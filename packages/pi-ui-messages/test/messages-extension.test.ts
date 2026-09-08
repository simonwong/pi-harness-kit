import {
  AssistantMessageComponent,
  type ExtensionContext,
  initTheme,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { TOOL_CARD_NAMES } from "../src/activity-format.ts";
import type { MessagesConfigSnapshot } from "../src/config.ts";
import {
  createMessagesExtension,
  type MessagesDependencies,
} from "../src/messages-extension.ts";
import type { WrapSource } from "../src/tool-cards.ts";
import {
  DURATION_ENTRY_TYPE,
  digestThinking,
  TRACE_FOLD_ENTRY_TYPE,
} from "../src/trace-folding.ts";
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

const mountThinking = (
  recording: ReturnType<typeof createRecordingPi>,
  context: ReturnType<typeof createRecordingContext>,
  messages: { timestamp: number; text: string }[]
) => {
  initTheme("dark", false);
  const outputs: string[] = [];
  for (const { timestamp, text } of messages) {
    context.transcript.addChild(
      new AssistantMessageComponent(
        {
          content: [{ thinking: text, type: "thinking" }],
          role: "assistant",
          timestamp,
        } as never,
        false,
        undefined,
        undefined,
        undefined,
        [
          ...recording.transformers,
          (transformed, transformContext) => {
            if (transformContext.messageType === "assistant-thinking") {
              outputs.push(transformed);
            }
            return transformed;
          },
        ]
      )
    );
  }
  return () => {
    outputs.length = 0;
    context.transcript.render(80);
    return [...outputs];
  };
};

describe("createMessagesExtension", () => {
  it("settles only at the first non-empty text in a reply segment", async () => {
    const clock = { now: 0 };
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension(timedDependencies(clock))(recording.api);
    await startSession(recording, context.context);
    const update = (timestamp: number, assistantMessageEvent: unknown) =>
      recording.emit(
        "message_update",
        {
          assistantMessageEvent,
          message: { role: "assistant", timestamp },
        },
        context.context
      );
    await update(1, { contentIndex: 0, type: "thinking_start" });
    clock.now = 100;
    await update(1, {
      content: "first",
      contentIndex: 0,
      type: "thinking_end",
    });
    await update(1, { contentIndex: 1, type: "text_start" });
    await update(1, { contentIndex: 1, delta: " \n", type: "text_delta" });
    await update(1, { content: " \n", contentIndex: 1, type: "text_end" });
    await update(1, {
      contentIndex: 2,
      toolCall: { id: "tool-1", name: "read" },
      type: "toolcall_end",
    });
    await update(2, { contentIndex: 0, type: "thinking_start" });
    clock.now = 200;
    await update(2, {
      content: "second",
      contentIndex: 0,
      type: "thinking_end",
    });
    await update(2, { contentIndex: 1, type: "text_start" });
    expect(
      recording.entries.filter(
        (entry) => entry.customType === TRACE_FOLD_ENTRY_TYPE
      )
    ).toEqual([]);
    await update(2, { contentIndex: 1, delta: "done", type: "text_delta" });
    await update(2, { content: "done", contentIndex: 1, type: "text_end" });
    const records = recording.entries.filter(
      (entry) => entry.customType === TRACE_FOLD_ENTRY_TYPE
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.data).toMatchObject({
      durationMs: 200,
      thinkingKeys: ["1:0", "2:0"],
      toolCount: 1,
    });
  });

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

  it("ignores stale async activation after session replacement", async () => {
    const recording = createRecordingPi();
    recording.allTools = builtinCatalog() as never;
    const context = createRecordingContext("tui");
    let resolveConfig: ((config: MessagesConfigSnapshot) => void) | undefined;
    const configPromise = new Promise<MessagesConfigSnapshot>((resolve) => {
      resolveConfig = resolve;
    });
    createMessagesExtension({
      createTools: fakeTools,
      loadConfig: async () => configPromise,
      now: () => 0,
    })(recording.api);

    const first = startSession(recording, context.context);
    const replacement = startSession(recording, context.context);
    resolveConfig?.(enabledConfig());
    await Promise.all([first, replacement]);

    expect(recording.shortcuts).toHaveLength(1);
    expect(recording.tools).toHaveLength(7);
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
        "  ⠋ Thinking · 2s (4 lines, alt+t to expand)",
        "  reasoning step 2",
        "  reasoning step 3",
        "  reasoning step 4",
      ].join("\n")
    );

    clock.now = 4000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { delta: "Reply", type: "text_delta" },
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
    ).toBe("  Thought for 3s (4 lines collapsed, alt+t to expand)");

    clock.now = 6000;
    await recording.emit(
      "message_end",
      {
        message: { role: "assistant", timestamp: 9 },
        type: "message_end",
      },
      context.context
    );

    expect(
      recording.entries.filter(
        (entry) => entry.customType === DURATION_ENTRY_TYPE
      )
    ).toHaveLength(1);
    expect(
      recording.entries.filter(
        (entry) => entry.customType === TRACE_FOLD_ENTRY_TYPE
      )
    ).toHaveLength(1);
    expect(context.hiddenThinkingLabel).toBe(
      "Thinking · 3s · 4 lines (ctrl+t to show)"
    );
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe("  Thought for 3s (4 lines collapsed, alt+t to expand)");
  });

  it("keeps historical Thought compact while a later turn is thinking", async () => {
    const clock = { now: 1000 };
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createMessagesExtension(timedDependencies(clock))(recording.api);
    await startSession(recording, context.context);

    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { type: "thinking_start" },
        message: { role: "assistant", timestamp: 1 },
        type: "message_update",
      },
      context.context
    );
    clock.now = 4000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          delta: `${thinkingMarkdown}\n`,
          type: "thinking_delta",
        },
        message: { role: "assistant", timestamp: 1 },
        type: "message_update",
      },
      context.context
    );
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { delta: "Reply", type: "text_delta" },
        message: { role: "assistant", timestamp: 1 },
        type: "message_update",
      },
      context.context
    );
    await recording.emit(
      "message_end",
      {
        message: { role: "assistant", timestamp: 1 },
        type: "message_end",
      },
      context.context
    );

    clock.now = 5000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { type: "thinking_start" },
        message: { role: "assistant", timestamp: 2 },
        type: "message_update",
      },
      context.context
    );
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          delta: "fresh reasoning\n",
          type: "thinking_delta",
        },
        message: { role: "assistant", timestamp: 2 },
        type: "message_update",
      },
      context.context
    );

    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe("  Thought for 3s (4 lines collapsed, alt+t to expand)");
    expect(
      recording.transformers[0]?.("fresh reasoning", {
        availableWidth: 80,
        isStreaming: true,
        messageType: "assistant-thinking",
      })
    ).toBe("  ⠋ Thinking · 0s (1 lines, alt+t to expand)\n  fresh reasoning");
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
    ).toBe("  Thought (4 lines collapsed, alt+t to expand)");
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
    ).toBe("  Thought for 12s (4 lines collapsed, alt+t to expand)");
  });

  it("restores first-versus-later trace visibility from session metadata", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    context.branch = [
      {
        customType: TRACE_FOLD_ENTRY_TYPE,
        data: {
          durationMs: 5000,
          firstDigest: digestThinking("first restored"),
          firstKey: "1:0",
          lines: 2,
          thinkingDigests: [
            digestThinking("first restored"),
            digestThinking("second restored"),
          ],
          thinkingKeys: ["1:0", "2:0"],
          toolCallIds: ["restored-tool"],
          toolCount: 1,
          version: 2,
        },
        type: "custom",
      },
    ];
    createMessagesExtension(createDependencies())(recording.api);
    await startSession(recording, context.context);

    const render = mountThinking(recording, context, [
      { text: "first restored", timestamp: 1 },
      { text: "second restored", timestamp: 2 },
    ]);
    expect(render()).toEqual(["  Thought for 5s, used 1 tool", ""]);
    const [anchor] = context.transcript.children;
    if (anchor === undefined) {
      throw new Error("Missing anchor component");
    }
    const originalMessage = Reflect.get(anchor, "lastMessage");
    Reflect.set(anchor, "lastMessage", undefined);
    expect(render()).toEqual([
      "  Thought (1 lines collapsed, alt+t to expand)",
      "  Thought (1 lines collapsed, alt+t to expand)",
    ]);
    Reflect.set(anchor, "lastMessage", originalMessage);
    expect(render()).toEqual(["  Thought for 5s, used 1 tool", ""]);
  });

  it("renders only the first Thought in a multi-thinking trace and restores all blocks when expanded", async () => {
    const clock = { now: 0 };
    const recording = createRecordingPi();
    recording.allTools = builtinCatalog() as never;
    const context = createRecordingContext("tui");
    createMessagesExtension(timedDependencies(clock))(recording.api);
    await startSession(recording, context.context);

    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { contentIndex: 0, type: "thinking_start" },
        message: { role: "assistant", timestamp: 1 },
        type: "message_update",
      },
      context.context
    );
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          contentIndex: 0,
          delta: "first thought",
          type: "thinking_delta",
        },
        message: { role: "assistant", timestamp: 1 },
        type: "message_update",
      },
      context.context
    );
    clock.now = 1000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          content: "first thought",
          contentIndex: 0,
          type: "thinking_end",
        },
        message: { role: "assistant", timestamp: 1 },
        type: "message_update",
      },
      context.context
    );
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          contentIndex: 1,
          toolCall: {
            arguments: {},
            id: "tool-1",
            name: "read",
            type: "toolCall",
          },
          type: "toolcall_end",
        },
        message: { role: "assistant", timestamp: 1 },
        type: "message_update",
      },
      context.context
    );
    clock.now = 2000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { contentIndex: 0, type: "thinking_start" },
        message: { role: "assistant", timestamp: 2 },
        type: "message_update",
      },
      context.context
    );
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          contentIndex: 0,
          delta: "second thought",
          type: "thinking_delta",
        },
        message: { role: "assistant", timestamp: 2 },
        type: "message_update",
      },
      context.context
    );
    clock.now = 3000;
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: {
          content: "second thought",
          contentIndex: 0,
          type: "thinking_end",
        },
        message: { role: "assistant", timestamp: 2 },
        type: "message_update",
      },
      context.context
    );

    const render = mountThinking(recording, context, [
      { text: "first thought", timestamp: 1 },
      { text: "second thought", timestamp: 2 },
    ]);
    const tool = new ToolExecutionComponent(
      "read",
      "tool-1",
      { path: "file.txt" },
      { showImages: false },
      recording.tools.find((definition) => definition.name === "read"),
      { requestRender: () => undefined } as never,
      "/project"
    );
    tool.updateResult({
      content: [
        {
          text: Array.from(
            { length: 25 },
            (_, index) => `evidence-${index}`
          ).join("\n"),
          type: "text",
        },
      ],
      isError: false,
    });
    context.transcript.addChild(tool);
    expect(render()).toEqual(["  Thought for 2s, used 1 tool", ""]);
    expect(tool.render(80)).toEqual([]);

    await recording.shortcuts[0]?.handler(context.context);
    expect(render()).toEqual(["first thought", "second thought"]);
    expect(tool.render(80).join("\n")).toContain("evidence-24");
    await recording.shortcuts[0]?.handler(context.context);
    render();
    expect(tool.render(80)).toEqual([]);
  });

  it("redraws the thinking header on the 100ms loop while text stays the last three lines", async () => {
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
        "  ⠙ Thinking · 3s (4 lines, alt+t to expand)",
        "  line two",
        "  line three",
        "  line four",
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
    await recording.emit(
      "message_update",
      {
        assistantMessageEvent: { contentIndex: 0, type: "thinking_start" },
        message: { role: "assistant", timestamp: 99 },
        type: "message_update",
      },
      context.context
    );
    expect(recording.entries).toEqual([]);
    expect(
      recording.transformers[0]?.(thinkingMarkdown, {
        availableWidth: 80,
        isStreaming: false,
        messageType: "assistant-thinking",
      })
    ).toBe(thinkingMarkdown);
  });

  it("waits for trusted TUI config before registering builtin wrappers", () => {
    const recording = createRecordingPi();
    recording.allTools = builtinCatalog() as never;
    createMessagesExtension(createDependencies({ createTools: fakeTools }))(
      recording.api
    );
    expect(recording.tools).toEqual([]);
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

  it("does not override tools owned by another extension", async () => {
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

  it("keeps Tool Cards active when Compact Thinking is disabled", async () => {
    const recording = createRecordingPi();
    recording.allTools = builtinCatalog() as never;
    const context = createRecordingContext("tui");
    createMessagesExtension({
      createTools: fakeTools,
      loadConfig: async () => ({
        diagnostics: [],
        enabledCapabilities: ["markdown", "toolCards"],
        motion: "full",
        native: false,
        shortcut: "alt+t",
      }),
      now: () => 0,
      platform: "linux",
    })(recording.api);
    await startSession(recording, context.context);

    expect(recording.tools.map((tool) => tool.name)).toEqual([
      ...TOOL_CARD_NAMES,
    ]);
    expect(recording.shortcuts).toEqual([]);
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

  it("prefixes assistant replies with a bullet and leaves user messages untouched", async () => {
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
    ).toBe("● hello");
    expect(
      recording.transformers[0]?.("hello", {
        availableWidth: 80,
        isStreaming: false,
        messageType: "user",
      })
    ).toBe("hello");
  });
});
