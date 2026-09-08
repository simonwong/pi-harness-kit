import { stripVTControlCharacters } from "node:util";
import {
  type AgentToolResult,
  initTheme,
  type Theme,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultTools,
  type WrapSource,
  wrapActivityTool,
} from "../src/tool-cards.ts";

const theme = {
  fg: (_color: string, text: string) => text,
} as unknown as Theme;

const component = (text: string) =>
  ({
    invalidate: () => undefined,
    render: () => [text],
  }) as never;

const fakeRead = (): WrapSource => ({
  description: "Read file contents",
  execute: async () => ({
    content: [{ text: "line one\nline two", type: "text" }],
    details: undefined,
  }),
  name: "read",
  parameters: { type: "object" } as WrapSource["parameters"],
  renderCall: () => component("native call"),
  renderResult: () => component("native result"),
});

const renderContext = (
  args: Record<string, unknown>,
  flags: { isError?: boolean; isPartial?: boolean } = {}
) =>
  ({
    args,
    argsComplete: true,
    cwd: "/project",
    executionStarted: true,
    expanded: false,
    invalidate: () => undefined,
    isError: flags.isError === true,
    isPartial: flags.isPartial === true,
    lastComponent: undefined,
    showImages: false,
    state: {},
    toolCallId: "call-1",
  }) as never;

const linesOf = (
  rendered: { render: (width: number) => string[] } | undefined
): string[] => {
  if (rendered === undefined) {
    return [];
  }
  return rendered
    .render(80)
    .map((line) => stripVTControlCharacters(line).trimEnd());
};

const visibility = (
  collapsed: boolean,
  folded: boolean,
  traceEnabled = true
) => ({
  collapsed: () => collapsed,
  shouldFold: (_callId: string) => folded,
  traceEnabled: () => traceEnabled,
});

describe("wrapActivityTool", () => {
  it("delivers final hidden results to the native renderer for timer cleanup", () => {
    initTheme("dark", false);
    vi.useFakeTimers();
    try {
      const source = createDefaultTools("/project", {
        autoResizeImages: false,
      }).find((definition) => definition.name === "bash");
      if (source === undefined) {
        throw new Error("Missing bash builtin");
      }
      const tool = wrapActivityTool(source, visibility(true, true));
      const host = new ToolExecutionComponent(
        "bash",
        "running",
        { command: "echo hello" },
        { showImages: false },
        tool,
        { requestRender: () => undefined } as never,
        "/project"
      );
      host.markExecutionStarted();
      host.updateResult(
        { content: [{ text: "partial", type: "text" }], isError: false },
        true
      );
      expect(vi.getTimerCount()).toBe(1);
      host.updateResult({
        content: [{ text: "done", type: "text" }],
        isError: false,
      });
      expect(host.render(80)).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(["read", "bash", "edit"])(
    "restores the native %s component after folding without losing long output",
    (name) => {
      initTheme("dark", false);
      let collapsed = true;
      const source = createDefaultTools("/project", {
        autoResizeImages: false,
      }).find((tool) => tool.name === name);
      if (source === undefined) {
        throw new Error(`Missing builtin ${name}`);
      }
      const wrapped = wrapActivityTool(source, {
        collapsed: () => collapsed,
        shouldFold: () => true,
        traceEnabled: () => true,
      });
      const args = { command: "echo hello", path: "file.txt" };
      const ui = { requestRender: () => undefined } as never;
      const host = new ToolExecutionComponent(
        name,
        "call-1",
        args,
        { showImages: false },
        wrapped,
        ui,
        "/project"
      );
      const native = new ToolExecutionComponent(
        name,
        "call-1",
        args,
        { showImages: false },
        { ...source, renderShell: "self" } as never,
        ui,
        "/project"
      );
      const result = {
        content: [
          {
            text: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            type: "text",
          },
        ],
        details:
          name === "edit"
            ? {
                diff: "+1 abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
                firstChangedLine: 1,
              }
            : undefined,
        isError: false,
      };
      host.updateResult(result);
      native.updateResult(result);
      native.setExpanded(true);
      expect(host.render(20)).toEqual([]);
      collapsed = false;
      host.invalidate();
      expect(host.render(20)).toEqual(native.render(20));
    }
  );

  it("labels failed standalone tool calls without relying on color", () => {
    const tool = wrapActivityTool(fakeRead(), visibility(true, false, false));
    const result = tool.renderCall?.(
      { path: "abc" },
      theme,
      renderContext({ path: "abc" }, { isError: true })
    );
    expect(linesOf(result).join("\n")).toContain("failed");
  });

  it("builds complete public builtin definitions", () => {
    const tools = createDefaultTools("/project", {
      autoResizeImages: false,
      shellCommandPrefix: "source env",
      shellPath: "/bin/zsh",
    });

    expect(tools).toHaveLength(7);
    expect(tools.every((tool) => tool.renderCall !== undefined)).toBe(true);
    expect(tools.every((tool) => tool.renderResult !== undefined)).toBe(true);
  });
  it("hides both slots when the call belongs to a collapsed trace", () => {
    const tool = wrapActivityTool(fakeRead(), visibility(true, true));
    const call = tool.renderCall?.(
      { path: "package.json" },
      theme,
      renderContext({ path: "package.json" }, { isPartial: true })
    );
    const result = tool.renderResult?.(
      {
        content: [{ text: "line one\nline two", type: "text" }],
        details: undefined,
      },
      { expanded: false, isPartial: false },
      theme,
      renderContext({ path: "package.json" })
    );

    expect(linesOf(call)).toEqual([]);
    expect(linesOf(result)).toEqual([]);
  });

  it("restores original call and result renderers when expanded", () => {
    const tool = wrapActivityTool(fakeRead(), visibility(false, true));
    const context = renderContext({ path: "package.json" });

    expect(
      linesOf(tool.renderCall?.({ path: "package.json" }, theme, context))
    ).toEqual(["native call"]);
    expect(
      linesOf(
        tool.renderResult?.(
          { content: [{ text: "ok", type: "text" }], details: undefined },
          { expanded: true, isPartial: false },
          theme,
          context
        )
      )
    ).toEqual(["native result"]);
  });

  it("forces full native evidence when the trace is expanded", () => {
    let callExpanded = false;
    let resultExpanded = false;
    const source = fakeRead();
    source.renderCall = (_args, _theme, renderState) => {
      callExpanded = renderState.expanded;
      return component("native call");
    };
    source.renderResult = (_result, options) => {
      resultExpanded = options.expanded;
      return component("native result");
    };
    const tool = wrapActivityTool(source, visibility(false, true));
    const context = renderContext({ path: "package.json" });

    tool.renderCall?.({ path: "package.json" }, theme, context);
    tool.renderResult?.(
      { content: [{ text: "ok", type: "text" }], details: undefined },
      { expanded: false, isPartial: false },
      theme,
      context
    );

    expect(callExpanded).toBe(true);
    expect(resultExpanded).toBe(true);
  });

  it("keeps Tool Cards useful when Compact Thinking is disabled", () => {
    const tool = wrapActivityTool(fakeRead(), visibility(true, false, false));
    const context = renderContext(
      { path: "package.json" },
      { isPartial: true }
    );

    expect(
      linesOf(tool.renderCall?.({ path: "package.json" }, theme, context))
    ).toEqual(["● Reading package.json · package.json …"]);
  });

  it("keeps pure-tool calls native while the trace view is collapsed", () => {
    const tool = wrapActivityTool(fakeRead(), visibility(true, false));
    const context = renderContext({ path: "package.json" });

    expect(
      linesOf(tool.renderCall?.({ path: "package.json" }, theme, context))
    ).toEqual(["native call"]);
  });

  it("passes error, cancellation, result details, and renderer state through", () => {
    const source = fakeRead();
    const expected: AgentToolResult<{ reason: string }> = {
      content: [{ text: "Cancelled by user", type: "text" }],
      details: { reason: "abort" },
    };
    let receivedResult: AgentToolResult<unknown> | undefined;
    let receivedError = false;
    source.renderResult = (result, _options, _theme, renderState) => {
      receivedResult = result;
      receivedError = renderState.isError;
      renderState.state.seen = true;
      return component("native cancellation");
    };
    const tool = wrapActivityTool(source, visibility(false, true));
    const context = renderContext(
      { path: "package.json" },
      { isError: true }
    ) as unknown as { state: Record<string, unknown> };

    expect(
      linesOf(
        tool.renderResult?.(
          expected,
          { expanded: false, isPartial: false },
          theme,
          context as never
        )
      )
    ).toEqual(["native cancellation"]);
    expect(receivedResult).toBe(expected);
    expect(receivedError).toBe(true);
    expect(context.state).toEqual({ seen: true });
  });

  it("preserves execution and constrained-sampling metadata", () => {
    const source = fakeRead();
    source.constrainedSampling = false;
    source.executionMode = "parallel";
    const tool = wrapActivityTool(source, visibility(true, true));

    expect(tool.constrainedSampling).toBe(false);
    expect(tool.executionMode).toBe("parallel");
  });

  it("delegates execute to the original tool unchanged", async () => {
    const original = fakeRead();
    const expected: AgentToolResult<{ exact: boolean }> = {
      content: [{ text: "ok", type: "text" }],
      details: { exact: true },
    };
    original.execute = async () => expected;
    const tool = wrapActivityTool(original, visibility(true, true));
    const result = await tool.execute(
      "id",
      { path: "a" },
      undefined,
      undefined,
      { cwd: "/project" } as never
    );

    expect(result).toBe(expected);
  });

  it("keeps fallback activity rows within render width", () => {
    const source = fakeRead();
    source.renderCall = undefined;
    const tool = wrapActivityTool(source, visibility(true, false));
    const { renderCall } = tool;
    if (typeof renderCall !== "function") {
      throw new Error("Missing call renderer");
    }
    const rendered = renderCall(
      { path: "packages/pi-ui-messages/src/tool-cards.ts" },
      theme,
      renderContext(
        { path: "packages/pi-ui-messages/src/tool-cards.ts" },
        { isPartial: true }
      )
    );

    for (const width of [1, 20, 40, 80]) {
      const lines = rendered?.render(width) ?? [];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
