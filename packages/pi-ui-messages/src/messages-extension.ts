import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionContext,
  type ExtensionFactory,
  getAgentDir,
  type MessageEndEvent,
  type MessageUpdateEvent,
} from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import {
  loadMessagesConfig,
  type MessagesConfigSnapshot,
  resolveMessagesConfig,
} from "./config.ts";
import {
  formatHiddenLabel,
  prefixAssistantReply,
  SPINNER_FRAMES,
  THINKING_TICK_MS_FULL,
} from "./thinking-format.ts";
import {
  createThinkingTracker,
  DURATION_ENTRY_TYPE,
  type DurationRecord,
  digestThinking,
  isDurationRecord,
  type TrackerEvent,
} from "./thinking-tracker.ts";
import { transformThinking } from "./thinking-transformer.ts";
import {
  createDefaultTools,
  type WrapSource,
  wrapActivityTool,
} from "./tool-cards.ts";
import {
  countTools,
  extractThinkingTexts,
  extractToolCalls,
  formatToolStats,
  hasToolStats,
  type ToolStats,
} from "./tool-stats.ts";

export interface MessagesDependencies {
  clearInterval?: (handle: unknown) => void;
  createTools?: (cwd: string) => WrapSource[];
  loadConfig: (context: ExtensionContext) => Promise<MessagesConfigSnapshot>;
  now: () => number;
  platform?: NodeJS.Platform;
  setInterval?: (callback: () => void, milliseconds: number) => unknown;
  toolCardsAtLoad?: boolean;
}

const THINKING_WIDGET_ID = "pi-ui:messages:thinking-loop";

interface RenderTui {
  requestRender: (force?: boolean) => void;
}

const productionDependencies: MessagesDependencies = {
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
  createTools: createDefaultTools,
  loadConfig: async (context) => {
    const readOptionalFile = async (
      filePath: string
    ): Promise<string | null> => {
      try {
        return await readFile(filePath, "utf8");
      } catch {
        return null;
      }
    };
    return loadMessagesConfig({
      globalPath: path.join(getAgentDir(), "pi-ui.json"),
      projectPath: path.join(context.cwd, CONFIG_DIR_NAME, "pi-ui.json"),
      projectTrusted: context.isProjectTrusted(),
      readConfig: readOptionalFile,
    });
  },
  now: () => Date.now(),
  platform: process.platform,
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
};

const recordsFromBranch = (branch: readonly unknown[]): DurationRecord[] => {
  const records: DurationRecord[] = [];
  for (const entry of branch) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("type" in entry) ||
      !("customType" in entry) ||
      entry.type !== "custom" ||
      entry.customType !== DURATION_ENTRY_TYPE
    ) {
      continue;
    }
    const data = "data" in entry ? entry.data : undefined;
    if (isDurationRecord(data)) {
      records.push(data);
    }
  }
  return records;
};

const trackerEventFromUpdate = (
  event: MessageUpdateEvent
): TrackerEvent | undefined => {
  if (event.message.role !== "assistant") {
    return;
  }
  const { timestamp } = event.message;
  const { assistantMessageEvent: update } = event;
  if (update.type === "thinking_start") {
    return { messageTimestamp: timestamp, type: "thinking_start" };
  }
  if (update.type === "thinking_delta") {
    return {
      delta: update.delta,
      messageTimestamp: timestamp,
      type: "thinking_delta",
    };
  }
  if (update.type === "text_start" || update.type === "toolcall_start") {
    return { messageTimestamp: timestamp, type: "boundary" };
  }
};

export const createMessagesExtension =
  (
    dependencies: MessagesDependencies = productionDependencies
  ): ExtensionFactory =>
  (pi) => {
    const tracker = createThinkingTracker();
    const toolStatsByDigest = new Map<string, ToolStats>();
    let configSnapshot: Promise<MessagesConfigSnapshot> | undefined;
    let generation = 0;
    let active = false;
    let transcriptActive = false;
    let compact = true;
    let controlsInstalled = false;
    let labelOwned = false;
    let currentLabel = "Thinking...";
    let frame = 0;
    let shortcut = "alt+t";
    let thinkingTimer: unknown;
    let renderTui: RenderTui | undefined;

    const loadConfig = (context: ExtensionContext) => {
      configSnapshot ??= dependencies.loadConfig(context);
      return configSnapshot;
    };

    const applyLabel = (context: ExtensionContext, record?: DurationRecord) => {
      if (record !== undefined) {
        currentLabel = formatHiddenLabel({
          elapsedMs: record.ms,
          lines: record.lines,
        });
      }
      labelOwned = true;
      context.ui.setHiddenThinkingLabel(currentLabel);
    };

    const persistFinished = (context: ExtensionContext) => {
      const finished = tracker.takeFinished();
      for (const record of finished) {
        pi.appendEntry(DURATION_ENTRY_TYPE, record);
        applyLabel(context, record);
      }
    };

    const rememberToolStats = (content: unknown): void => {
      const stats = countTools(extractToolCalls(content));
      if (!hasToolStats(stats)) {
        return;
      }
      for (const text of extractThinkingTexts(content)) {
        const trimmed = text.trim();
        if (trimmed.length > 0) {
          toolStatsByDigest.set(digestThinking(trimmed), stats);
        }
      }
    };

    const restoreToolStats = (context: ExtensionContext): void => {
      for (const entry of context.sessionManager.getBranch()) {
        if (typeof entry !== "object" || entry === null) {
          continue;
        }
        const record = entry as unknown as Record<string, unknown>;
        const nested = record.message;
        const message =
          typeof nested === "object" && nested !== null
            ? (nested as Record<string, unknown>)
            : record;
        if (message.role !== "assistant") {
          continue;
        }
        rememberToolStats(message.content);
      }
    };

    const restoreDurations = (
      context: ExtensionContext
    ): DurationRecord | undefined => {
      const records = recordsFromBranch(context.sessionManager.getBranch());
      tracker.reset();
      tracker.restore(records);
      return records.at(-1);
    };

    const toggleCompact = (context: ExtensionContext) => {
      compact = !compact;
      applyLabel(context);
    };

    const installControls = (context: ExtensionContext) => {
      if (controlsInstalled) {
        return;
      }
      controlsInstalled = true;
      try {
        pi.registerShortcut(shortcut as KeyId, {
          description: "Toggle compact thinking",
          handler: (ctx) => {
            toggleCompact(ctx);
          },
        });
      } catch {
        context.ui.notify(
          "pi-ui messages: compact-thinking shortcut failed; use /compact-thinking",
          "warning"
        );
      }
      pi.registerCommand("compact-thinking", {
        description: "Toggle compact thinking presentation",
        handler: async (_args, ctx) => {
          toggleCompact(ctx);
        },
      });
    };

    const stopThinkingTimer = () => {
      if (
        thinkingTimer === undefined ||
        dependencies.clearInterval === undefined
      ) {
        thinkingTimer = undefined;
        return;
      }
      dependencies.clearInterval(thinkingTimer);
      thinkingTimer = undefined;
    };

    const startThinkingTimer = (context: ExtensionContext) => {
      if (
        thinkingTimer !== undefined ||
        dependencies.setInterval === undefined ||
        !active
      ) {
        return;
      }
      const startedGeneration = generation;
      thinkingTimer = dependencies.setInterval(() => {
        if (
          startedGeneration !== generation ||
          !active ||
          !tracker.isRunActive()
        ) {
          stopThinkingTimer();
          return;
        }
        frame = (frame + 1) % SPINNER_FRAMES.length;
        applyLabel(context);
        renderTui?.requestRender(true);
      }, THINKING_TICK_MS_FULL);
    };

    const syncThinkingTimer = (context: ExtensionContext) => {
      if (tracker.isRunActive()) {
        startThinkingTimer(context);
        return;
      }
      stopThinkingTimer();
    };

    const startThinking = (context: ExtensionContext) => {
      active = true;
      compact = true;
      const restored = restoreDurations(context);
      if (restored === undefined) {
        currentLabel = "Thinking...";
      }
      restoreToolStats(context);
      applyLabel(context, restored);
      installControls(context);
      installRenderLoop(context);
    };

    const installToolCards = (cwd: string, context?: ExtensionContext) => {
      const createTools = dependencies.createTools ?? createDefaultTools;
      for (const original of createTools(cwd)) {
        try {
          pi.registerTool(wrapActivityTool(original));
        } catch {
          context?.ui.notify(
            `pi-ui messages: tool card skipped for ${original.name}`,
            "warning"
          );
        }
      }
    };

    const peekToolCardsEnabled = (): boolean => {
      if (dependencies.toolCardsAtLoad !== undefined) {
        return dependencies.toolCardsAtLoad;
      }
      try {
        const globalContents = readFileSync(
          path.join(getAgentDir(), "pi-ui.json"),
          "utf8"
        );
        const snapshot = resolveMessagesConfig({
          globalContents,
          projectContents: null,
          projectTrusted: false,
        });
        return (
          !snapshot.native && snapshot.enabledCapabilities.includes("toolCards")
        );
      } catch {
        return true;
      }
    };

    if (peekToolCardsEnabled()) {
      installToolCards(process.cwd());
    }

    const installRenderLoop = (context: ExtensionContext) => {
      context.ui.setWidget(THINKING_WIDGET_ID, (tui) => {
        renderTui = tui;
        return {
          invalidate() {
            // Render loop widget has no visual cache.
          },
          render: () => [],
        };
      });
    };

    pi.registerMarkdownTransformer((markdown, transformContext) => {
      if (!transcriptActive) {
        return markdown;
      }
      if (transformContext.messageType === "assistant") {
        return prefixAssistantReply(markdown, transformContext.availableWidth);
      }
      if (!active || transformContext.messageType !== "assistant-thinking") {
        return markdown;
      }
      try {
        const live = tracker.isRunActive();
        const elapsedMs = live
          ? tracker.streamingElapsedMs(dependencies.now())
          : tracker.lookup(markdown)?.ms;
        const stats = toolStatsByDigest.get(digestThinking(markdown.trim()));
        return transformThinking(markdown, {
          availableWidth: transformContext.availableWidth,
          compact,
          elapsedMs,
          frame,
          highlight: stats?.highlight,
          isStreaming: live,
          platform: dependencies.platform ?? process.platform,
          shortcut,
          toolSummary: stats === undefined ? undefined : formatToolStats(stats),
        });
      } catch {
        return markdown;
      }
    });

    const activateTui = (
      context: ExtensionContext,
      config: MessagesConfigSnapshot
    ) => {
      for (const diagnostic of config.diagnostics) {
        context.ui.notify(`pi-ui messages: ${diagnostic}`, "warning");
      }
      ({ shortcut } = config);
      const thinkingEnabled =
        !config.native &&
        config.enabledCapabilities.includes("compactThinking");
      const cardsEnabled =
        !config.native && config.enabledCapabilities.includes("toolCards");
      transcriptActive = thinkingEnabled || cardsEnabled;
      if (thinkingEnabled) {
        startThinking(context);
      }
      if (cardsEnabled) {
        installToolCards(context.cwd, context);
      }
    };

    pi.on("session_start", async (_event, context) => {
      generation += 1;
      const currentGeneration = generation;
      stopThinkingTimer();
      active = false;
      transcriptActive = false;
      if (context.mode !== "tui") {
        return;
      }
      const config = await loadConfig(context);
      if (currentGeneration !== generation) {
        return;
      }
      activateTui(context, config);
    });

    pi.on("session_tree", (_event, context) => {
      if (!active || context.mode !== "tui") {
        return;
      }
      applyLabel(context, restoreDurations(context));
    });

    pi.on("session_shutdown", (_event, context) => {
      generation += 1;
      stopThinkingTimer();
      renderTui = undefined;
      if (context.mode === "tui") {
        context.ui.setWidget(THINKING_WIDGET_ID, undefined);
      }
      if (labelOwned && context.mode === "tui") {
        context.ui.setHiddenThinkingLabel();
      }
      active = false;
      transcriptActive = false;
      compact = true;
      controlsInstalled = false;
      labelOwned = false;
      currentLabel = "Thinking...";
      frame = 0;
      tracker.reset();
      toolStatsByDigest.clear();
      configSnapshot = undefined;
    });

    pi.on("message_update", (event: MessageUpdateEvent, context) => {
      if (!active) {
        return;
      }
      const mapped = trackerEventFromUpdate(event);
      if (mapped === undefined) {
        return;
      }
      tracker.handle(mapped, dependencies.now());
      persistFinished(context);
      syncThinkingTimer(context);
    });

    pi.on("message_end", (event: MessageEndEvent, context) => {
      if (!active || event.message.role !== "assistant") {
        return;
      }
      tracker.handle(
        { messageTimestamp: event.message.timestamp, type: "boundary" },
        dependencies.now()
      );
      persistFinished(context);
      rememberToolStats(event.message.content);
      applyLabel(context);
      stopThinkingTimer();
    });
  };
