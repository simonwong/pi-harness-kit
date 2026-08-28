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
import { loadMessagesConfig, type MessagesConfigSnapshot } from "./config.ts";
import { formatHiddenLabel, SPINNER_FRAMES } from "./thinking-format.ts";
import {
  createThinkingTracker,
  DURATION_ENTRY_TYPE,
  type DurationRecord,
  isDurationRecord,
  type TrackerEvent,
} from "./thinking-tracker.ts";
import { transformThinking } from "./thinking-transformer.ts";

export interface MessagesDependencies {
  loadConfig: (context: ExtensionContext) => Promise<MessagesConfigSnapshot>;
  now: () => number;
  platform?: NodeJS.Platform;
}

const productionDependencies: MessagesDependencies = {
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
    let configSnapshot: Promise<MessagesConfigSnapshot> | undefined;
    let generation = 0;
    let active = false;
    let compact = true;
    let controlsInstalled = false;
    let labelOwned = false;
    let currentLabel = "Thinking...";
    let frame = 0;
    let motion: MessagesConfigSnapshot["motion"] = "full";
    let shortcut = "alt+t";

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

    pi.registerMarkdownTransformer((markdown, transformContext) => {
      if (!active || transformContext.messageType !== "assistant-thinking") {
        return markdown;
      }
      try {
        const live = tracker.isRunActive();
        const elapsedMs = live
          ? tracker.streamingElapsedMs(dependencies.now())
          : tracker.lookup(markdown)?.ms;
        return transformThinking(markdown, {
          availableWidth: transformContext.availableWidth,
          compact,
          elapsedMs,
          frame,
          isStreaming: live,
          motion,
          platform: dependencies.platform ?? process.platform,
          shortcut,
        });
      } catch {
        return markdown;
      }
    });

    pi.on("session_start", async (_event, context) => {
      generation += 1;
      const currentGeneration = generation;
      active = false;
      if (context.mode !== "tui") {
        return;
      }
      const config = await loadConfig(context);
      if (currentGeneration !== generation) {
        return;
      }
      for (const diagnostic of config.diagnostics) {
        context.ui.notify(`pi-ui messages: ${diagnostic}`, "warning");
      }
      ({ motion, shortcut } = config);
      if (
        config.native ||
        !config.enabledCapabilities.includes("compactThinking")
      ) {
        return;
      }
      active = true;
      compact = true;
      const restored = restoreDurations(context);
      if (restored === undefined) {
        currentLabel = "Thinking...";
      }
      applyLabel(context, restored);
      installControls(context);
    });

    pi.on("session_tree", (_event, context) => {
      if (!active || context.mode !== "tui") {
        return;
      }
      applyLabel(context, restoreDurations(context));
    });

    pi.on("session_shutdown", (_event, context) => {
      generation += 1;
      if (labelOwned && context.mode === "tui") {
        context.ui.setHiddenThinkingLabel();
      }
      active = false;
      compact = true;
      controlsInstalled = false;
      labelOwned = false;
      currentLabel = "Thinking...";
      frame = 0;
      tracker.reset();
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
      if (mapped.type === "thinking_delta") {
        frame = (frame + 1) % SPINNER_FRAMES.length;
      }
      tracker.handle(mapped, dependencies.now());
      persistFinished(context);
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
    });
  };
