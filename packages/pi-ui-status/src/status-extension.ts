import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionContext,
  type ExtensionFactory,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { loadStatusConfig, type StatusConfigSnapshot } from "./config.ts";
import {
  classifyRunOutcome,
  createWorkingState,
  updateWorkingState,
  type WorkingState,
} from "./working-model.ts";
import {
  ACTIVITY_INTERVAL_MS,
  type ActivityWord,
  createOutcomePresentation,
  createStaticIndicatorPresentation,
  formatWorkingMessage,
  type IndicatorPresentation,
  selectActivityWord,
  toneForElapsed,
} from "./working-presentation.ts";

const OUTCOME_WIDGET_KEY = "pi-ui:status:working-outcome";
const METRICS_INTERVAL_MS = 1000;

export interface StatusClock {
  clearInterval: (handle: unknown) => void;
  now: () => number;
  setInterval: (callback: () => void, milliseconds: number) => unknown;
}

export interface StatusDependencies {
  clock: StatusClock;
  loadConfig: (context: ExtensionContext) => Promise<StatusConfigSnapshot>;
  random?: () => number;
}

interface WorkingRuntime {
  activitySlot: number;
  activityWord: ActivityWord;
  config: StatusConfigSnapshot;
  context: ExtensionContext;
  failed: boolean;
  generation: number;
  lastIndicatorSignature?: string;
  lastMessage?: string;
  metricsTimer?: unknown;
  outcomeVisible: boolean;
  ownsWorking: boolean;
  state: WorkingState;
}

const systemClock: StatusClock = {
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
  now: Date.now,
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
};

const readOptionalFile = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
};

const loadProductionConfig = async (
  context: ExtensionContext
): Promise<StatusConfigSnapshot> => {
  const projectTrusted = context.isProjectTrusted();
  return loadStatusConfig({
    globalPath: path.join(getAgentDir(), "pi-ui.json"),
    projectPath: path.join(context.cwd, CONFIG_DIR_NAME, "pi-ui.json"),
    projectTrusted,
    readConfig: readOptionalFile,
  });
};

const productionDependencies: StatusDependencies = {
  clock: systemClock,
  loadConfig: loadProductionConfig,
  random: Math.random,
};

const errorDescription = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const indicatorSignature = (indicator: IndicatorPresentation): string =>
  JSON.stringify([indicator.intervalMs, indicator.frames]);

export const createStatusExtension =
  (
    dependencies: StatusDependencies = productionDependencies
  ): ExtensionFactory =>
  (pi) => {
    const random = dependencies.random ?? Math.random;
    let configSnapshot: Promise<StatusConfigSnapshot> | undefined;
    let generation = 0;
    let runtime: WorkingRuntime | undefined;

    const stopMetrics = (target: WorkingRuntime): void => {
      if (target.metricsTimer === undefined) {
        return;
      }
      dependencies.clock.clearInterval(target.metricsTimer);
      target.metricsTimer = undefined;
    };

    const clearOutcome = (target: WorkingRuntime): void => {
      if (!target.outcomeVisible) {
        return;
      }
      target.context.ui.setWidget(OUTCOME_WIDGET_KEY, undefined);
      target.outcomeVisible = false;
    };

    const restoreNative = (target: WorkingRuntime): void => {
      if (!target.ownsWorking) {
        return;
      }
      let firstError: unknown;
      let restoreFailed = false;
      for (const restore of [
        () => target.context.ui.setWorkingMessage(),
        () => target.context.ui.setWorkingIndicator(),
        () => target.context.ui.setWorkingVisible(true),
      ]) {
        try {
          restore();
        } catch (error) {
          if (!restoreFailed) {
            firstError = error;
          }
          restoreFailed = true;
        }
      }
      if (restoreFailed) {
        throw firstError;
      }
      target.ownsWorking = false;
    };

    const disposeRuntime = (): void => {
      if (!runtime) {
        return;
      }
      const target = runtime;
      runtime = undefined;
      stopMetrics(target);
      try {
        clearOutcome(target);
      } catch {
        // Cleanup is best-effort after the owning UI has failed.
      }
      target.state = updateWorkingState(target.state, { type: "shutdown" });
      try {
        restoreNative(target);
      } catch {
        // The host may already be disposing its UI generation.
      }
    };

    const failRuntime = (target: WorkingRuntime, error: unknown): void => {
      if (target.failed) {
        return;
      }
      target.failed = true;
      stopMetrics(target);
      try {
        clearOutcome(target);
      } catch {
        // Preserve the original Capability failure as the diagnostic.
      }
      try {
        restoreNative(target);
      } catch {
        // Preserve the original Capability failure as the diagnostic.
      }
      try {
        target.context.ui.notify(
          `[pi-ui-status] Working disabled: ${errorDescription(error)}`,
          "warning"
        );
      } catch {
        // A diagnostic cannot recover an unavailable UI.
      }
    };

    const advanceActivity = (
      target: WorkingRuntime,
      elapsedMs: number
    ): void => {
      if (target.config.motion === "off") {
        return;
      }
      const activitySlot = Math.floor(elapsedMs / ACTIVITY_INTERVAL_MS);
      while (target.activitySlot < activitySlot) {
        target.activityWord = selectActivityWord(random, target.activityWord);
        target.activitySlot += 1;
      }
    };

    const applyActivePresentation = (target: WorkingRuntime): void => {
      if (
        target.failed ||
        target.state.phase !== "active" ||
        target.generation !== generation
      ) {
        return;
      }
      const now = dependencies.clock.now();
      const startedAt = target.state.startedAt ?? now;
      const elapsedMs = Math.max(0, now - startedAt);
      const elapsed = Math.floor(elapsedMs / 1000);
      const tone = toneForElapsed(elapsed);
      try {
        advanceActivity(target, elapsedMs);
        if (target.config.motion !== "full") {
          const indicator = createStaticIndicatorPresentation(
            target.config.motion,
            tone,
            target.context.ui.theme
          );
          const signature = indicatorSignature(indicator);
          if (target.lastIndicatorSignature !== signature) {
            target.context.ui.setWorkingIndicator(indicator);
            target.lastIndicatorSignature = signature;
          }
        }
        const message = formatWorkingMessage(
          target.state,
          now,
          target.config.motion,
          target.context.ui.theme,
          target.activityWord
        );
        if (message !== target.lastMessage) {
          target.context.ui.setWorkingMessage(message);
          target.lastMessage = message;
        }
      } catch (error) {
        failRuntime(target, error);
      }
    };

    const startMetrics = (target: WorkingRuntime): void => {
      if (
        target.metricsTimer !== undefined ||
        target.failed ||
        target.config.motion === "off"
      ) {
        return;
      }
      target.metricsTimer = dependencies.clock.setInterval(() => {
        applyActivePresentation(target);
      }, METRICS_INTERVAL_MS);
    };

    const showSettledOutcome = (target: WorkingRuntime): void => {
      const { outcome } = target.state;
      if (
        !outcome ||
        outcome.kind === "unknown" ||
        target.failed ||
        target.generation !== generation
      ) {
        return;
      }
      const now = dependencies.clock.now();
      const startedAt = target.state.startedAt ?? now;
      const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
      try {
        clearOutcome(target);
        const presentation = createOutcomePresentation(outcome, elapsed);
        target.outcomeVisible = true;
        target.context.ui.setWidget(
          OUTCOME_WIDGET_KEY,
          (_tui, theme) => ({
            invalidate() {
              // Render derives current theme state without a cache.
            },
            render: (width) => {
              if (!Number.isFinite(width) || width <= 0) {
                return [];
              }
              const availableWidth = Math.floor(width);
              const leftPadding = availableWidth > 1 ? " " : "";
              const contentWidth = availableWidth - leftPadding.length;
              return wrapTextWithAnsi(presentation.text, contentWidth).map(
                (line) =>
                  leftPadding +
                  theme.fg(
                    presentation.tone,
                    truncateToWidth(line, contentWidth, "")
                  )
              );
            },
          }),
          { placement: "aboveEditor" }
        );
      } catch (error) {
        failRuntime(target, error);
      }
    };

    const loadGenerationConfig = async (
      context: ExtensionContext,
      currentGeneration: number
    ): Promise<StatusConfigSnapshot | undefined> => {
      try {
        configSnapshot ??= dependencies.loadConfig(context);
        return await configSnapshot;
      } catch (error) {
        if (currentGeneration === generation && context.mode === "tui") {
          context.ui.notify(
            `[pi-ui-status] Status kept native: ${errorDescription(error)}`,
            "warning"
          );
        }
      }
    };

    const activateRuntime = (
      context: ExtensionContext,
      currentGeneration: number,
      config: StatusConfigSnapshot
    ): void => {
      if (config.native || !config.enabledCapabilities.includes("working")) {
        return;
      }
      const target: WorkingRuntime = {
        activitySlot: 0,
        activityWord: selectActivityWord(random),
        config,
        context,
        failed: false,
        generation: currentGeneration,
        outcomeVisible: false,
        ownsWorking: true,
        state: createWorkingState(),
      };
      runtime = target;
      try {
        context.ui.setWorkingVisible(true);
        if (config.motion === "full") {
          context.ui.setWorkingIndicator();
        } else {
          const indicator = createStaticIndicatorPresentation(
            config.motion,
            "accent",
            context.ui.theme
          );
          context.ui.setWorkingIndicator(indicator);
          target.lastIndicatorSignature = indicatorSignature(indicator);
        }
        const initialState = updateWorkingState(target.state, {
          now: dependencies.clock.now(),
          type: "started",
        });
        const initialMessage = formatWorkingMessage(
          initialState,
          dependencies.clock.now(),
          config.motion,
          context.ui.theme,
          target.activityWord
        );
        context.ui.setWorkingMessage(initialMessage);
        target.lastMessage = initialMessage;
      } catch (error) {
        failRuntime(target, error);
      }
    };

    pi.on("session_start", async (_event, context) => {
      generation += 1;
      const currentGeneration = generation;
      disposeRuntime();
      const config = await loadGenerationConfig(context, currentGeneration);
      if (
        !config ||
        currentGeneration !== generation ||
        context.mode !== "tui"
      ) {
        return;
      }
      for (const diagnostic of config.diagnostics) {
        context.ui.notify(`[pi-ui-status] ${diagnostic}`, "warning");
      }
      activateRuntime(context, currentGeneration, config);
    });

    pi.on("session_shutdown", () => {
      generation += 1;
      disposeRuntime();
    });

    pi.on("agent_start", () => {
      const target = runtime;
      if (!target || target.failed) {
        return;
      }
      try {
        clearOutcome(target);
      } catch (error) {
        failRuntime(target, error);
        return;
      }
      if (target.state.phase === "settled") {
        target.activitySlot = 0;
        target.activityWord = selectActivityWord(random, target.activityWord);
      }
      target.state = updateWorkingState(target.state, {
        now: dependencies.clock.now(),
        type: "started",
      });
      applyActivePresentation(target);
      startMetrics(target);
    });

    pi.on("message_update", (event) => {
      const target = runtime;
      if (!target || target.failed || event.message.role !== "assistant") {
        return;
      }
      target.state = updateWorkingState(target.state, {
        output: event.message.usage.output,
        type: "assistantUpdated",
      });
      applyActivePresentation(target);
    });

    pi.on("message_end", (event) => {
      const target = runtime;
      if (!target || target.failed || event.message.role !== "assistant") {
        return;
      }
      target.state = updateWorkingState(target.state, {
        output: event.message.usage.output,
        type: "assistantEnded",
      });
      applyActivePresentation(target);
    });

    pi.on("agent_end", (event) => {
      const target = runtime;
      if (!target || target.failed) {
        return;
      }
      target.state = updateWorkingState(target.state, {
        outcome: classifyRunOutcome(event.messages),
        type: "runEnded",
      });
    });

    pi.on("agent_settled", () => {
      const target = runtime;
      if (!target || target.failed || target.state.phase === "settled") {
        return;
      }
      stopMetrics(target);
      target.state = updateWorkingState(target.state, { type: "settled" });
      showSettledOutcome(target);
    });
  };
