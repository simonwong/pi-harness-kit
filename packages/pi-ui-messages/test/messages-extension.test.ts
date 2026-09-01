import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { TOOL_CARD_NAMES } from "../src/activity-format.ts";
import type { MessagesConfigSnapshot } from "../src/config.ts";
import {
  createMessagesExtension,
  type MessagesDependencies,
} from "../src/messages-extension.ts";
import {
  DURATION_ENTRY_TYPE,
  digestThinking,
} from "../src/thinking-tracker.ts";
import type { WrapSource } from "../src/tool-cards.ts";
import { createRecordingContext } from "./recording-context.ts";
import { createRecordingPi } from "./recording-pi.ts";

const enabledConfig = (): MessagesConfigSnapshot => ({
  diagnostics: [],
  enabledCapabilities: ["markdown", "compactThinking", "toolCards"],
  motion: "full",
  native: false,
  shortcut: "alt+t",
});

const createDependencies = (
  overrides?: Partial<MessagesDependencies>
): MessagesDependencies => ({
  loadConfig: async () => enabledConfig(),
  now: () => 1000,
  platform: "linux",
  ...overrides,
});

const timedDependencies = (clock: { now: number }): MessagesDependencies => ({
  loadConfig: async () => enabledConfig(),
  now: () => clock.now,
  platform: "linux",
});

const startSession = async (
  recording: ReturnType<typeof createRecordingPi>,
  context: ExtensionContext
) => {
  await recording.emit("session_start", { type: "session_start" }, context);
};

const fakeTools = (): WrapSource[] =>
  TOOL_CARD_NAMES.map((name) => ({
    description: name,
    execute: async () => ({
      content: [{ text: "ok", type: "text" }],
      details: undefined,
    }),
    name,
    parameters: { type: "object" } as WrapSource["parameters"],
  }));

const builtinCatalog = () =>
  TOOL_CARD_NAMES.map((name) => ({
    description: name,
    name,
    parameters: {},
    sourceInfo: {
      origin: "top-level" as const,
      path: `<builtin:${name}>`,
      scope: "temporary" as const,
      source: "builtin" as const,
    },
  }));

const thinkingMarkdown = [
  "reasoning step 1",
  "reasoning step 2",
  "reasoning step 3",
  "reasoning step 4",
].join("\n");

describe("createMessagesExtension", () => {
  it("stays native outside tui mode and when compactThinking is disabled", async () => {
    const recording = createRecordingPi();
    const rpc = createRecordingContext("rpc");
    createMessagesExtension(createDependencies())(recording.api);
    await startSession(recording, rpc.context);

    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe(thinkingMarkdown);

    const disabled = createRecordingPi();
    const disabledContext = createRecordingContext("tui");
    createMessagesExtension({
      loadConfig: async () => ({
        diagnostics: ["bad json"],
        enabledCapabilities: [],
        motion: "full",
        native: true,
        shortcut: "alt+t",
      }),
      now: () => 0,
    })(disabled.api);
    await startSession(disabled, disabledContext.context);
    expect(disabledContext.notifications).toEqual([
      { message: "pi-ui messages: bad json", type: "warning" },
    ]);
    expect(disabled.shortcuts).toHaveLength(0);
    expect(
      disabled.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe(thinkingMarkdown);
  });

  it("stays native when compactThinking is disabled on a live surface", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension({
      loadConfig: async () => ({
        diagnostics: [],
        enabledCapabilities: ["markdown", "toolCards"],
        motion: "full",
        native: false,
        shortcut: "alt+t",
      }),
      now: () => 0,
    })(recording.api);
    await startSession(recording, context.context);

    expect(recording.shortcuts).toHaveLength(0);
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: true,
        messageType: "assistant-thinking",
      })
    ).toBe(thinkingMarkdown);
  });

  it("compacts streaming and completed thinking after a tui session start", async () => {
    const clock = { now: 1000 };
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension(timedDependencies(clock))(recording.api);
    await startSession(recording, context.context);

    expect(recording.shortcuts[0]?.shortcut).toBe("alt+t");
    expect(recording.commands[0]?.name).toBe("compact-thinking");

    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { type: "thinking_start" },
        message: { role: "assistant", timestamp: 9 },
        type: "message_update",
      },
      context.context
    );
    clock.now = 3000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          delta: `${thinkingMarkdown}\n`,
          type: "thinking_delta",
        },
        message: { role: "assistant", timestamp: 9 },
        type: "message_update",
      },
      context.context
    );

    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: true,
        messageType: "assistant-thinking",
      })
    ).toBe(
      [
        "⠋ Thinking · 2s (4 lines, alt+t to expand)",
        "reasoning step 2",
        "reasoning step 3",
        "reasoning step 4",
      ].join("\n")
    );

    clock.now = 4000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { type: "text_start" },
        message: { role: "assistant", timestamp: 9 },
        type: "message_update",
      },
      context.context
    );
    expect(
      recording.transformers[0]?.(`${thinkingMarkdown}\n`, {
        availableWidth: 80,
        isStreaming: true,
        messageType: "assistant-thinking",
      })
    ).toBe("Thought for 3s (4 lines collapsed, alt+t to expand)");

    clock.now = 6000;
    await recording.emit(
      "message_end",
      {
        message: { role: "assistant", timestamp: 9 },
        type: "message_end",
      },
      context.context
    );

    expect(recording.entries).toHaveLength(1);
    expect(recording.entries[0]?.customType).toBe(DURATION_ENTRY_TYPE);
    expect(context.hiddenThinkingLabel).toBe(
      "Thinking · 3s · 4 lines (ctrl+t to show)"
    );
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe("Thought for 3s (4 lines collapsed, alt+t to expand)");
  });

  it("expands through the registered shortcut and restores compact form", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension(timedDependencies({ now: 1000 }))(recording.api);
    await startSession(recording, context.context);
    await recording.emit(
      "message_end",
      {
        message: { role: "assistant", timestamp: 1 },
        type: "message_end",
      },
      context.context
    );

    await recording.shortcuts[0]?.handler(context.context);
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe(thinkingMarkdown);

    await recording.shortcuts[0]?.handler(context.context);
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe("Thought (4 lines collapsed, alt+t to expand)");
  });

  it("restores persisted durations from the session branch", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    context.branch = [
      {
        customType: DURATION_ENTRY_TYPE,
        data: {
          digest: digestThinking(thinkingMarkdown),
          lines: 4,
          ms: 12_000,
        },
        type: "custom",
      },
    ];
    createMessagesExtension(createDependencies())(recording.api);
    await startSession(recording, context.context);

    expect(context.hiddenThinkingLabel).toBe(
      "Thinking · 12s · 4 lines (ctrl+t to show)"
    );
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe("Thought for 12s (4 lines collapsed, alt+t to expand)");
  });

  it("redraws the thinking header on the 80ms loop while text stays the last three lines", async () => {
    const clock = { now: 1000 };
    const ticks: Array<() => void> = [];
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension({
      clearInterval: () => undefined,
      loadConfig: async () => enabledConfig(),
      now: () => clock.now,
      platform: "linux",
      setInterval: (callback) => {
        ticks.push(callback);
        return ticks.length;
      },
    })(recording.api);
    await startSession(recording, context.context);
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { type: "thinking_start" },
        message: { role: "assistant", timestamp: 4 },
        type: "message_update",
      },
      context.context
    );
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          delta: "keep the tail\nline two\nline three\nline four\n",
          type: "thinking_delta",
        },
        message: { role: "assistant", timestamp: 4 },
        type: "message_update",
      },
      context.context
    );

    expect(ticks).toHaveLength(1);
    clock.now = 4000;
    ticks[0]?.();

    expect(
      recording.transformers[0]?.(
        "keep the tail\nline two\nline three\nline four",
        {
          availableWidth: 80,
          isStreaming: true,
          messageType: "assistant-thinking",
        }
      )
    ).toBe(
      [
        "⠙ Thinking · 3s (4 lines, alt+t to expand)",
        "line two",
        "line three",
        "line four",
      ].join("\n")
    );
  });

  it("stops compacting after session_shutdown", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension(createDependencies())(recording.api);
    await startSession(recording, context.context);
    await recording.emit(
      "session_shutdown",
      { type: "session_shutdown" },
      context.context
    );

    expect(context.hiddenThinkingLabel).toBeUndefined();
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe(thinkingMarkdown);
  });

  it("registers activity-row wrappers for builtin tools in tui", async () => {
    const recording = createRecordingPi();
    recording.allTools = builtinCatalog() as never;
    const context = createRecordingContext("tui");
    createMessagesExtension(createDependencies({ createTools: fakeTools }))(
      recording.api
    );
    await startSession(recording, context.context);

    expect(recording.tools.map((tool) => tool.name)).toEqual([
      ...TOOL_CARD_NAMES,
    ]);
    expect(recording.tools[0]?.renderShell).toBe("self");
  });

  it("does not wrap tools that are not builtin", async () => {
    const recording = createRecordingPi();
    recording.allTools = TOOL_CARD_NAMES.map((name) => ({
      description: name,
      name,
      parameters: {},
      sourceInfo: {
        origin: "top-level",
        path: "ext.ts",
        scope: "user",
        source: "extension",
      },
    })) as never;
    const context = createRecordingContext("tui");
    createMessagesExtension(createDependencies({ createTools: fakeTools }))(
      recording.api
    );
    await startSession(recording, context.context);
    expect(recording.tools).toEqual([]);
  });

  it("does not wrap tools when toolCards is disabled", async () => {
    const recording = createRecordingPi();
    recording.allTools = builtinCatalog() as never;
    const context = createRecordingContext("tui");
    createMessagesExtension({
      createTools: fakeTools,
      loadConfig: async () => ({
        diagnostics: [],
        enabledCapabilities: ["compactThinking"],
        motion: "full",
        native: false,
        shortcut: "alt+t",
      }),
      now: () => 0,
      platform: "linux",
    })(recording.api);
    await startSession(recording, context.context);
    expect(recording.tools).toEqual([]);
    expect(recording.shortcuts.length).toBeGreaterThan(0);
  });

  it("ignores assistant text Markdown and leaves user messages untouched", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension(createDependencies())(recording.api);
    await startSession(recording, context.context);

    expect(
      recording.transformers[0]?.("hello", {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant",
      })
    ).toBe("hello");
  });
});
