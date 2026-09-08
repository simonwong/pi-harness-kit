import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionContext,
  type ExtensionFactory,
  getAgentDir,
  type MessageEndEvent,
  type MessageUpdateEvent,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { loadMessagesConfig, type MessagesConfigSnapshot } from "./config.ts";
import {
  formatHiddenLabel,
  prefixAssistantReply,
  SPINNER_FRAMES,
  THINKING_TICK_MS_FULL,
} from "./thinking-format.ts";
import { transformThinking } from "./thinking-transformer.ts";
import {
  createDefaultTools,
  type DefaultToolOptions,
  type WrapSource,
  wrapActivityTool,
} from "./tool-cards.ts";
import {
  createTraceFolding,
  DURATION_ENTRY_TYPE,
  type DurationRecord,
  durationRecordsFromBranch,
  observedToolIdsFromBranch,
  recordsFromTraceBranch,
  TRACE_FOLD_ENTRY_TYPE,
  type TraceFoldPresentation,
} from "./trace-folding.ts";
import {
  attachTranscriptView,
  type TranscriptView,
} from "./transcript-view.ts";

export interface MessagesDependencies {
  clearInterval?: (handle: unknown) => void;
  createTools?: (cwd: string, options: DefaultToolOptions) => WrapSource[];
  loadConfig: (context: ExtensionContext) => Promise<MessagesConfigSnapshot>;
  now: () => number;
  platform?: NodeJS.Platform;
  setInterval?: (callback: () => void, milliseconds: number) => unknown;
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

export const createMessagesExtension =
  (
    dependencies: MessagesDependencies = productionDependencies
  ): ExtensionFactory =>
  (pi) => {
    const trace = createTraceFolding({
      onSettle: (record) => {
        pi.appendEntry(TRACE_FOLD_ENTRY_TYPE, record);
      },
    });
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
    let transcriptView: TranscriptView | undefined;
    let renderRevision = 0;
    let visibleReplyKey: string | undefined;
    const ownedTools = new WeakSet<ToolDefinition>();

    const requestRender = () => {
      renderRevision += 1;
      renderTui?.requestRender(true);
    };

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
      const finished = trace.takeFinishedDurations();
      for (const record of finished) {
        pi.appendEntry(DURATION_ENTRY_TYPE, record);
        applyLabel(context, record);
      }
    };

    const restoreState = (
      context: ExtensionContext
    ): DurationRecord | undefined => {
      const branch = context.sessionManager.getBranch();
      const records = durationRecordsFromBranch(branch);
      trace.clear();
      visibleReplyKey = undefined;
      trace.restoreDurations(records);
      trace.restore(recordsFromTraceBranch(branch));
      trace.restoreObservedTools(observedToolIdsFromBranch(branch));
      return records.at(-1);
    };

    const toggleCompact = (context: ExtensionContext) => {
      compact = !compact;
      applyLabel(context);
      requestRender();
    };

    const installControls = (context: ExtensionContext) => {
      if (controlsInstalled) {
        return;
      }
      controlsInstalled = true;
      try {
        pi.registerShortcut(shortcut as KeyId, {
          description: "Toggle compact thinking trace",
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
        description: "Toggle compact thinking trace",
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
          !trace.isThinkingActive()
        ) {
          stopThinkingTimer();
          return;
        }
        frame = (frame + 1) % SPINNER_FRAMES.length;
        applyLabel(context);
        requestRender();
      }, THINKING_TICK_MS_FULL);
    };

    const syncThinkingTimer = (context: ExtensionContext) => {
      if (trace.isThinkingActive()) {
        startThinkingTimer(context);
        return;
      }
      stopThinkingTimer();
    };

    const installRenderLoop = (context: ExtensionContext) => {
      context.ui.setWidget(THINKING_WIDGET_ID, (tui) => {
        renderTui = tui;
        transcriptView?.dispose();
        transcriptView = attachTranscriptView(tui, {
          anchorForTool: (callId) =>
            active ? trace.anchorForTool(callId) : undefined,
          collapsed: () => compact,
          isOwnedTool: (tool) => ownedTools.has(tool),
          revision: () => renderRevision,
        });
        return {
          invalidate() {
            // This invisible widget only owns the render-loop handle.
          },
          render: () => [],
        };
      });
    };

    const startThinking = (context: ExtensionContext) => {
      active = true;
      compact = true;
      const restored = restoreState(context);
      if (restored === undefined) {
        currentLabel = "Thinking...";
      }
      applyLabel(context, restored);
      installControls(context);
      installRenderLoop(context);
    };

    const installToolCards = (cwd: string, context: ExtensionContext) => {
      const catalog = new Map(
        pi.getAllTools().map((tool) => [tool.name, tool])
      );
      const settings = SettingsManager.create(cwd, getAgentDir(), {
        projectTrusted: context.isProjectTrusted(),
      });
      const createTools = dependencies.createTools ?? createDefaultTools;
      for (const original of createTools(cwd, {
        autoResizeImages: settings.getImageAutoResize(),
        shellCommandPrefix: settings.getShellCommandPrefix(),
        shellPath: settings.getShellPath(),
      })) {
        const registered = catalog.get(original.name);
        if (registered?.sourceInfo.source !== "builtin") {
          continue;
        }
        try {
          const tool = wrapActivityTool(original, {
            collapsed: () => compact,
            shouldFold: (callId) =>
              active && transcriptView?.canFoldTool(callId) === true,
            traceEnabled: () => active,
          });
          pi.registerTool(tool);
          ownedTools.add(tool);
        } catch {
          context.ui.notify(
            `pi-ui messages: tool card skipped for ${original.name}`,
            "warning"
          );
        }
      }
    };

    const transformAnchor = (
      markdown: string,
      folded: TraceFoldPresentation,
      availableWidth: number
    ) =>
      transformThinking(
        folded.streaming && folded.latestText ? folded.latestText : markdown,
        {
          availableWidth,
          compact: true,
          elapsedMs: folded.elapsedMs,
          frame,
          isStreaming: folded.streaming,
          lineCount: folded.lines,
          platform: dependencies.platform ?? process.platform,
          shortcut,
          toolSummary: folded.toolSummary,
        }
      );

    const transformCompactThinking = (
      markdown: string,
      transformContext: { availableWidth: number; isStreaming: boolean }
    ): string => {
      if (!compact) {
        return markdown;
      }
      const keys = transcriptView?.thinkingKeys();
      const folded =
        keys === undefined
          ? undefined
          : trace.lookup(markdown, dependencies.now(), keys);
      if (
        folded !== undefined &&
        transcriptView?.hasThinkingKey(folded.anchorKey)
      ) {
        return folded.role === "hidden"
          ? ""
          : transformAnchor(markdown, folded, transformContext.availableWidth);
      }
      const live = transformContext.isStreaming && trace.isThinkingActive();
      const elapsedMs = live
        ? trace.streamingElapsedMs(dependencies.now())
        : trace.lookupDuration(markdown, keys)?.ms;
      return transformThinking(markdown, {
        availableWidth: transformContext.availableWidth,
        compact: true,
        elapsedMs,
        frame,
        isStreaming: live,
        platform: dependencies.platform ?? process.platform,
        shortcut,
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
        return transformCompactThinking(markdown, transformContext);
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
      transcriptView?.dispose();
      transcriptView = undefined;
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
      applyLabel(context, restoreState(context));
      requestRender();
    });

    pi.on("session_shutdown", (_event, context) => {
      generation += 1;
      stopThinkingTimer();
      transcriptView?.dispose();
      transcriptView = undefined;
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
      trace.clear();
      visibleReplyKey = undefined;
      configSnapshot = undefined;
    });

    const observeReply = (key: string, text: string, now: number) => {
      if (key !== visibleReplyKey && text.trim().length > 0) {
        trace.visibleText(now);
        visibleReplyKey = key;
      }
    };

    const updateTrace = (event: MessageUpdateEvent, now: number): void => {
      const update = event.assistantMessageEvent;
      const index = "contentIndex" in update ? update.contentIndex : 0;
      const key = `${event.message.timestamp}:${index}`;
      switch (update.type) {
        case "thinking_start":
          trace.thinkingStart(key, now);
          break;
        case "thinking_delta":
          trace.thinkingDelta(key, update.delta, now);
          break;
        case "thinking_end":
          trace.thinkingEnd(key, update.content, now);
          break;
        case "text_start":
          trace.boundary(now);
          visibleReplyKey = undefined;
          break;
        case "text_delta":
          observeReply(key, update.delta, now);
          break;
        case "text_end":
          observeReply(key, update.content, now);
          break;
        case "toolcall_start":
          trace.boundary(now);
          break;
        case "toolcall_end":
          trace.toolCall({
            id: update.toolCall.id,
            name: update.toolCall.name,
          });
          break;
        default:
          break;
      }
    };

    const handleMessageUpdate = (
      event: MessageUpdateEvent,
      context: ExtensionContext
    ): void => {
      if (!active || event.message.role !== "assistant") {
        return;
      }
      const now = dependencies.now();
      updateTrace(event, now);
      persistFinished(context);
      syncThinkingTimer(context);
      requestRender();
    };

    pi.on("message_update", handleMessageUpdate);

    pi.on("tool_execution_start", (event) => {
      if (!active) {
        return;
      }
      trace.toolCall({
        id: event.toolCallId,
        name: event.toolName,
      });
      requestRender();
    });

    pi.on("message_start", (event) => {
      if (active && event.message.role === "user") {
        trace.settle(dependencies.now());
        visibleReplyKey = undefined;
      }
    });

    pi.on("agent_settled", () => {
      if (active) {
        trace.settle(dependencies.now());
        requestRender();
      }
    });

    pi.on("message_end", (event: MessageEndEvent, context) => {
      if (!active || event.message.role !== "assistant") {
        return;
      }
      trace.boundary(dependencies.now());
      persistFinished(context);
      applyLabel(context);
      stopThinkingTimer();
    });
  };
