import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { StatusConfigSnapshot } from "../src/config.ts";
import { createStatusExtension } from "../src/status-extension.ts";
import { ManualClock } from "./manual-clock.ts";
import { createRecordingContext } from "./recording-context.ts";
import { createRecordingPi } from "./recording-pi.ts";

const enabledConfig: StatusConfigSnapshot = {
  diagnostics: [],
  enabledCapabilities: ["working", "statusCues"],
  motion: "full",
  native: false,
};

const last = <Value>(values: Value[]): Value | undefined => values.at(-1);
const visible = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : stripVTControlCharacters(value);

describe("Status Surface Working runtime", () => {
  it("drives active metrics and a settled outcome through public Pi UI seams", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    const extension = createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
      random: () => 0,
    });

    extension(recording.api);

    expect(recording.eventNames()).toEqual([
      "session_start",
      "session_shutdown",
      "agent_start",
      "message_update",
      "message_end",
      "agent_end",
      "agent_settled",
    ]);
    expect(clock.activeTimers()).toBe(0);
    expect(ui.workingMessages).toEqual([]);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    expect(clock.activeTimers()).toBe(0);
    expect(ui.workingVisibility).toEqual([true]);
    expect(ui.workingIndicators).toEqual([undefined]);

    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    expect(clock.activeTimers()).toBe(1);
    expect(visible(last(ui.workingMessages))).toBe("Vibing (0s)");

    await recording.emit(
      "message_update",
      {
        message: { role: "assistant", usage: { output: 84 } },
        type: "message_update",
      },
      ui.context
    );
    expect(visible(last(ui.workingMessages))).toBe("Vibing (↓ 84 0s)");

    clock.advance(20_000);
    expect(visible(last(ui.workingMessages))).toBe("Vibing (↓ 84 20s)");

    await recording.emit(
      "message_end",
      {
        message: { role: "assistant", usage: { output: 100 } },
        type: "message_end",
      },
      ui.context
    );
    expect(visible(last(ui.workingMessages))).toBe("Vibing (↓ 100 20s)");

    await recording.emit(
      "agent_end",
      {
        messages: [{ role: "assistant", stopReason: "stop" }],
        type: "agent_end",
      },
      ui.context
    );
    expect(clock.activeTimers()).toBe(1);
    expect(ui.widgets).toEqual([]);

    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );
    expect(last(ui.widgets)).toEqual({
      content: [expect.stringContaining("Worked for 20s")],
      key: "pi-ui:status:working-outcome",
      placement: "aboveEditor",
    });
    expect(clock.activeTimers()).toBe(0);
    const writesAfterSettlement = ui.widgets.length;
    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );
    expect(ui.widgets).toHaveLength(writesAfterSettlement);

    clock.advance(2000);
    expect(visible(last(ui.widgets)?.content?.[0])).toBe(" Worked for 20s");

    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    expect(last(ui.widgets)).toEqual({
      content: undefined,
      key: "pi-ui:status:working-outcome",
      placement: undefined,
    });
    expect(clock.activeTimers()).toBe(1);
  });

  it("shows reasoning tokens until output usage arrives", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
      random: () => 0,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    await recording.emit(
      "message_update",
      {
        message: { role: "assistant", usage: { output: 0, reasoning: 12 } },
        type: "message_update",
      },
      ui.context
    );
    expect(visible(last(ui.workingMessages))).toBe("Vibing (↓ 12 0s)");

    await recording.emit(
      "message_update",
      {
        message: { role: "assistant", usage: { output: 50, reasoning: 12 } },
        type: "message_update",
      },
      ui.context
    );
    expect(visible(last(ui.workingMessages))).toBe("Vibing (↓ 50 0s)");
  });

  it("keeps a random word for ten seconds and prevents an immediate repeat", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    const samples = [0, 1];
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
      random: () => samples.shift() ?? 0,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    expect(visible(last(ui.workingMessages))).toBe("Vibing (0s)");

    clock.advance(9999);
    expect(visible(last(ui.workingMessages))).toBe("Vibing (9s)");

    clock.advance(1);
    expect(visible(last(ui.workingMessages))).toBe("Smooshing (10s)");
    expect(samples).toEqual([]);
  });

  it("preserves every random slot across a delayed retry", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    let randomCalls = 0;
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
      random: () => {
        randomCalls += 1;
        return randomCalls === 1 ? 0 : 1;
      },
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    await recording.emit(
      "agent_end",
      {
        messages: [{ role: "assistant", stopReason: "error" }],
        type: "agent_end",
      },
      ui.context
    );
    clock.advance(30_000);
    expect(randomCalls).toBe(1);

    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    expect(randomCalls).toBe(4);
    expect(visible(last(ui.workingMessages))).toBe("Smooshing (30s)");
  });

  it("shows final cancellation and sanitized error information only after settlement", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    await recording.emit(
      "agent_end",
      {
        messages: [{ role: "assistant", stopReason: "aborted" }],
        type: "agent_end",
      },
      ui.context
    );
    expect(ui.widgets).toEqual([]);
    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );
    expect(visible(last(ui.widgets)?.content?.[0])).toBe(" Cancelled after 0s");
    expect(clock.activeTimers()).toBe(0);

    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    expect(clock.activeTimers()).toBe(1);
    await recording.emit(
      "agent_end",
      {
        messages: [
          {
            errorMessage: "\u001B[31mprovider\u001B[0m\n request failed",
            role: "assistant",
            stopReason: "error",
          },
        ],
        type: "agent_end",
      },
      ui.context
    );
    expect(visible(last(ui.widgets)?.content?.[0])).toBeUndefined();
    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );
    expect(visible(last(ui.widgets)?.content?.[0])).toBe(
      " ! Error after 0s: provider request failed"
    );
    expect(clock.activeTimers()).toBe(0);
  });

  it("keeps unknown settlement neutral instead of claiming success", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    await recording.emit(
      "agent_end",
      {
        messages: [{ role: "assistant", stopReason: "length" }],
        type: "agent_end",
      },
      ui.context
    );
    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );

    expect(ui.widgets).toEqual([]);
    expect(clock.activeTimers()).toBe(0);
  });

  it("keeps native behavior for non-TUI, Native Escape Hatch, and disabled Working", async () => {
    const cases: [
      ReturnType<typeof createRecordingContext>,
      StatusConfigSnapshot,
    ][] = [
      [createRecordingContext("print"), enabledConfig],
      [
        createRecordingContext(),
        {
          diagnostics: [],
          enabledCapabilities: [],
          motion: "full",
          native: true,
        },
      ],
      [
        createRecordingContext(),
        {
          diagnostics: [],
          enabledCapabilities: ["statusCues"],
          motion: "full",
          native: false,
        },
      ],
    ];

    await Promise.all(
      cases.map(async ([ui, config]) => {
        const clock = new ManualClock();
        const recording = createRecordingPi();
        createStatusExtension({
          clock,
          loadConfig: async () => config,
        })(recording.api);

        await recording.emit(
          "session_start",
          { type: "session_start" },
          ui.context
        );
        await recording.emit(
          "agent_start",
          { type: "agent_start" },
          ui.context
        );

        expect(ui.workingIndicators).toEqual([]);
        expect(ui.workingMessages).toEqual([]);
        expect(ui.workingVisibility).toEqual([]);
        expect(ui.widgets).toEqual([]);
        expect(clock.activeTimers()).toBe(0);
      })
    );
  });

  it("rebuilds a reduced-motion static indicator when the theme changes", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => ({ ...enabledConfig, motion: "reduced" }),
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    const firstFrame = last(ui.workingIndicators)?.frames?.[0];

    ui.setColorCode("accent", 36);
    clock.advance(1000);
    const secondFrame = last(ui.workingIndicators)?.frames?.[0];

    expect(ui.workingIndicators).toHaveLength(2);
    expect(secondFrame).not.toBe(firstFrame);
    expect(visible(secondFrame)).toBe(visible(firstFrame));
  });

  it("renders a persistent outcome from the active theme", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    clock.advance(20_000);
    await recording.emit(
      "agent_end",
      {
        messages: [{ role: "assistant", stopReason: "stop" }],
        type: "agent_end",
      },
      ui.context
    );
    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );
    const first = last(ui.widgets)?.content?.[0];

    ui.setColorCode("muted", 36);
    ui.rerenderWidgets();
    const second = last(ui.widgets)?.content?.[0];

    expect(first).not.toBe(second);
    expect(visible(first)).toBe(" Worked for 20s");
    expect(visible(second)).toBe(" Worked for 20s");
  });

  it("wraps the owning outcome component at every required width", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    clock.advance(12_000);
    await recording.emit(
      "agent_end",
      {
        messages: [
          {
            errorMessage: "\u001B[31m连接失败\u001B[0m，请检查 provider 配置",
            role: "assistant",
            stopReason: "error",
          },
        ],
        type: "agent_end",
      },
      ui.context
    );
    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );

    expect(ui.renderWidgetComponents(0)).toEqual([[]]);
    for (const width of [1, 20, 40, 80]) {
      const lines = ui.renderWidgetComponents(width).flat();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        expect(line.endsWith("\u001B[39m")).toBe(true);
        expect(stripVTControlCharacters(line).startsWith(" ")).toBe(width > 1);
      }
      expect(
        lines
          .map((line) => stripVTControlCharacters(line))
          .join("")
          .replaceAll(/\s+/g, "")
      ).toContain("!Errorafter12s:");
    }
  });

  it("does not repeat unchanged writes and ignores events after shutdown", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    const writesBeforeUpdates = ui.workingMessages.length;
    const update = {
      message: { role: "assistant", usage: { output: 0 } },
      type: "message_update",
    };
    await recording.emit("message_update", update, ui.context);
    await recording.emit("message_update", update, ui.context);
    expect(ui.workingMessages).toHaveLength(writesBeforeUpdates);

    await recording.emit(
      "session_shutdown",
      { type: "session_shutdown" },
      ui.context
    );
    const writesAfterShutdown = ui.workingMessages.length;
    await recording.emit("message_update", update, ui.context);
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    expect(ui.workingMessages).toHaveLength(writesAfterShutdown);
    expect(clock.activeTimers()).toBe(0);
  });

  it("keeps Status native and reports once when configuration loading fails", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    createStatusExtension({
      clock,
      loadConfig: async () => {
        throw new Error("permission denied");
      },
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);

    expect(ui.notifications).toEqual([
      {
        message: "[pi-ui-status] Status kept native: permission denied",
        type: "warning",
      },
    ]);
    expect(ui.workingMessages).toEqual([]);
    expect(ui.workingIndicators).toEqual([]);
    expect(clock.activeTimers()).toBe(0);
  });

  it("disposes an active generation before session replacement", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    let loadCount = 0;
    createStatusExtension({
      clock,
      loadConfig: async () => {
        loadCount += 1;
        return enabledConfig;
      },
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    expect(clock.activeTimers()).toBe(1);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    const writesAfterReplacement = ui.workingMessages.length;

    expect(loadCount).toBe(1);
    expect(clock.activeTimers()).toBe(0);
    expect(ui.workingIndicators).toEqual([undefined, undefined, undefined]);
    clock.advance(1000);
    expect(ui.workingMessages).toHaveLength(writesAfterReplacement);
  });

  it("disables only Working when an owned UI write fails", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    ui.context.ui.setWorkingIndicator = () => {
      throw new Error("indicator unavailable");
    };
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);

    expect(clock.activeTimers()).toBe(0);
    expect(ui.notifications).toEqual([
      {
        message: "[pi-ui-status] Working disabled: indicator unavailable",
        type: "warning",
      },
    ]);
    expect(last(ui.workingMessages)).toBeUndefined();
    expect(last(ui.workingVisibility)).toBe(true);
  });

  it("clears a partially installed outcome widget before native fallback", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    const originalSetWidget = ui.context.ui.setWidget as (
      key: string,
      content: unknown,
      options?: { placement?: "aboveEditor" | "belowEditor" }
    ) => void;
    ui.context.ui.setWidget = ((
      key: string,
      content: unknown,
      options?: { placement?: "aboveEditor" | "belowEditor" }
    ) => {
      originalSetWidget(key, content, options);
      if (typeof content === "function") {
        throw new Error("widget unavailable");
      }
    }) as typeof ui.context.ui.setWidget;
    createStatusExtension({
      clock,
      loadConfig: async () => enabledConfig,
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    await recording.emit("agent_start", { type: "agent_start" }, ui.context);
    await recording.emit(
      "agent_end",
      {
        messages: [{ role: "assistant", stopReason: "stop" }],
        type: "agent_end",
      },
      ui.context
    );
    await recording.emit(
      "agent_settled",
      { type: "agent_settled" },
      ui.context
    );

    expect(last(ui.widgets)).toEqual({
      content: undefined,
      key: "pi-ui:status:working-outcome",
      placement: undefined,
    });
    expect(last(ui.workingMessages)).toBeUndefined();
    expect(last(ui.workingIndicators)).toBeUndefined();
    expect(last(ui.workingVisibility)).toBe(true);
    expect(clock.activeTimers()).toBe(0);
    expect(ui.notifications).toEqual([
      {
        message: "[pi-ui-status] Working disabled: widget unavailable",
        type: "warning",
      },
    ]);
  });

  it("restores native UI after a reduced indicator write fails", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    const originalSetIndicator = ui.context.ui.setWorkingIndicator;
    ui.context.ui.setWorkingIndicator = (indicator) => {
      if (indicator) {
        throw new Error("static indicator unavailable");
      }
      originalSetIndicator(indicator);
    };
    createStatusExtension({
      clock,
      loadConfig: async () => ({ ...enabledConfig, motion: "reduced" }),
    })(recording.api);

    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );

    expect(last(ui.workingMessages)).toBeUndefined();
    expect(last(ui.workingIndicators)).toBeUndefined();
    expect(last(ui.workingVisibility)).toBe(true);
    expect(clock.activeTimers()).toBe(0);
    expect(ui.notifications).toEqual([
      {
        message:
          "[pi-ui-status] Working disabled: static indicator unavailable",
        type: "warning",
      },
    ]);
  });

  it("keeps one immutable config snapshot while rejecting stale activation", async () => {
    const clock = new ManualClock();
    const recording = createRecordingPi();
    const ui = createRecordingContext();
    let loadCount = 0;
    let resolveConfig: ((snapshot: StatusConfigSnapshot) => void) | undefined;
    createStatusExtension({
      clock,
      loadConfig: () => {
        loadCount += 1;
        return new Promise((resolve) => {
          resolveConfig = resolve;
        });
      },
    })(recording.api);

    const first = recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    const second = recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    resolveConfig?.(enabledConfig);
    await Promise.all([first, second]);

    expect(loadCount).toBe(1);
    expect(ui.workingVisibility).toEqual([true]);
    expect(ui.workingIndicators).toHaveLength(1);
    expect(clock.activeTimers()).toBe(0);

    await recording.emit(
      "session_shutdown",
      { type: "session_shutdown" },
      ui.context
    );
    await recording.emit(
      "session_start",
      { type: "session_start" },
      ui.context
    );
    expect(loadCount).toBe(1);
  });

  it.each([
    ["reduced", 1],
    ["off", 0],
  ] as const)(
    "uses a static indicator for %s motion and cleans up idempotently",
    async (motion, activeTimerCount) => {
      const clock = new ManualClock();
      const recording = createRecordingPi();
      const ui = createRecordingContext();
      createStatusExtension({
        clock,
        loadConfig: async () => ({ ...enabledConfig, motion }),
      })(recording.api);

      await recording.emit(
        "session_start",
        { type: "session_start" },
        ui.context
      );
      expect(last(ui.workingIndicators)?.frames).toHaveLength(1);
      expect(last(ui.workingIndicators)?.intervalMs).toBeUndefined();
      expect(clock.activeTimers()).toBe(0);

      await recording.emit("agent_start", { type: "agent_start" }, ui.context);
      expect(clock.intervals).toHaveLength(activeTimerCount);
      expect(clock.activeTimers()).toBe(activeTimerCount);

      await recording.emit(
        "session_shutdown",
        { type: "session_shutdown" },
        ui.context
      );
      await recording.emit(
        "session_shutdown",
        { type: "session_shutdown" },
        ui.context
      );
      expect(clock.activeTimers()).toBe(0);
      expect(last(ui.workingMessages)).toBeUndefined();
      expect(last(ui.workingIndicators)).toBeUndefined();
      expect(last(ui.workingVisibility)).toBe(true);
    }
  );
});
