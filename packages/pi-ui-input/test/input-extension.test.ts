import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  createInputExtension,
  type InputDependencies,
} from "../src/input-extension.ts";
import { createRecordingContext } from "./recording-context.ts";
import {
  createRecordingPi,
  extensionCommand,
  skillCommand,
} from "./recording-pi.ts";

const createDependencies = (
  overrides?: Partial<InputDependencies>
): InputDependencies => ({
  editorFactory: (() => ({ marker: "editor" })) as never,
  loadConfig: async () => ({
    diagnostics: [],
    enabledCapabilities: ["multiSkill"],
    motion: "full",
    native: false,
  }),
  readSkillFile: (filePath) => {
    if (filePath === "/skills/research/SKILL.md") {
      return "---\nname: research\n---\n\nResearch the topic.\n";
    }
    if (filePath === "/skills/code-review/SKILL.md") {
      return "Review the code carefully.\n";
    }
    throw new Error(`missing ${filePath}`);
  },
  ...overrides,
});

const startSession = async (
  recording: ReturnType<typeof createRecordingPi>,
  context: ExtensionContext
) => {
  await recording.emit("session_start", { type: "session_start" }, context);
};

describe("createInputExtension", () => {
  it("installs the provider and editor on tui session start", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createInputExtension(createDependencies())(recording.api);

    await startSession(recording, context.context);

    expect(context.autocompleteProviders).toHaveLength(1);
    expect(context.editorFactory).toBeTypeOf("function");
    expect(context.notifications).toEqual([]);
  });

  it("stays native outside tui mode and when disabled", async () => {
    const recording = createRecordingPi();
    const rpcContext = createRecordingContext("rpc");
    createInputExtension(createDependencies())(recording.api);
    await startSession(recording, rpcContext.context);
    expect(rpcContext.autocompleteProviders).toHaveLength(0);
    expect(rpcContext.editorFactory).toBeUndefined();

    const disabled = createRecordingPi();
    const disabledContext = createRecordingContext("tui");
    createInputExtension(
      createDependencies({
        loadConfig: async () => ({
          diagnostics: [],
          enabledCapabilities: [],
          motion: "full",
          native: true,
        }),
      })
    )(disabled.api);
    await startSession(disabled, disabledContext.context);
    expect(disabledContext.autocompleteProviders).toHaveLength(0);
    expect(disabledContext.editorFactory).toBeUndefined();
  });

  it("keeps another extension's editor and warns once", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    context.editorFactory = (() => ({})) as never;
    createInputExtension(createDependencies())(recording.api);

    await startSession(recording, context.context);

    expect(context.editorFactory).not.toBeUndefined();
    expect(context.autocompleteProviders).toHaveLength(1);
    expect(context.notifications).toEqual([
      {
        message: expect.stringContaining("another extension owns the editor"),
        type: "warning",
      },
    ]);
  });

  it("transforms inline skill tokens into native blocks", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    recording.setCommands([skillCommand("research")]);
    createInputExtension(createDependencies())(recording.api);

    const [result] = await recording.emit(
      "input",
      { source: "interactive", text: "用 /research 调研", type: "input" },
      context.context
    );

    expect(result).toEqual({
      action: "transform",
      text: '<skill name="research" location="/skills/research/SKILL.md">\nReferences are relative to /skills/research.\n\nResearch the topic.\n</skill>\n\n用 /research 调研',
    });
  });

  it("passes through native-owned and non-skill inputs", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    recording.setCommands([
      skillCommand("research"),
      extensionCommand("deploy"),
    ]);
    createInputExtension(createDependencies())(recording.api);

    const cases = [
      "/skill:research 单个行首",
      "/deploy --prod",
      "没有斜杠",
      "/unknown 未知",
    ];
    const results = await Promise.all(
      cases.map(async (text) => {
        const [result] = await recording.emit(
          "input",
          { source: "interactive", text, type: "input" },
          context.context
        );
        return result;
      })
    );
    for (const [index, result] of results.entries()) {
      expect(result, cases[index] ?? "").toEqual({ action: "continue" });
    }
  });

  it("skips extension-sourced input and unreadable skills", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    recording.setCommands([skillCommand("missing")]);
    createInputExtension(createDependencies())(recording.api);

    const [extensionResult] = await recording.emit(
      "input",
      { source: "extension", text: "用 /missing", type: "input" },
      context.context
    );
    expect(extensionResult).toEqual({ action: "continue" });

    const [result] = await recording.emit(
      "input",
      { source: "interactive", text: "用 /missing", type: "input" },
      context.context
    );
    expect(result).toEqual({ action: "continue" });
  });

  it("passes input through unchanged in rpc mode", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("rpc");
    recording.setCommands([skillCommand("research")]);
    createInputExtension(createDependencies())(recording.api);

    const [result] = await recording.emit(
      "input",
      { source: "rpc", text: "用 /research 调研", type: "input" },
      context.context
    );

    expect(result).toEqual({ action: "continue" });
  });

  it("stays idempotent across repeated session starts", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    createInputExtension(createDependencies())(recording.api);

    await startSession(recording, context.context);
    await startSession(recording, context.context);

    expect(context.autocompleteProviders).toHaveLength(1);
    expect(context.editorFactory).toBeTypeOf("function");
    expect(context.notifications).toEqual([]);

    await recording.emit(
      "session_shutdown",
      { type: "session_shutdown" },
      context.context
    );
    await startSession(recording, context.context);

    expect(context.autocompleteProviders).toHaveLength(2);
    expect(context.notifications).toEqual([]);
  });

  it("passes input through unchanged when multiSkill is disabled", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    recording.setCommands([skillCommand("research")]);
    createInputExtension(
      createDependencies({
        loadConfig: async () => ({
          diagnostics: [],
          enabledCapabilities: [],
          motion: "full",
          native: false,
        }),
      })
    )(recording.api);

    const [result] = await recording.emit(
      "input",
      { source: "interactive", text: "用 /research 调研", type: "input" },
      context.context
    );

    expect(result).toEqual({ action: "continue" });
  });

  it("preserves images through the transform", async () => {
    const recording = createRecordingPi();
    const context = createRecordingContext("tui");
    recording.setCommands([skillCommand("research")]);
    createInputExtension(createDependencies())(recording.api);
    const images = [{ data: "x", mimeType: "image/png" }];

    const [result] = await recording.emit(
      "input",
      { images, source: "interactive", text: "用 /research", type: "input" },
      context.context
    );

    expect(result).toMatchObject({ action: "transform", images });
  });
});
