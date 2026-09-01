import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { type WrapSource, wrapActivityTool } from "../src/tool-cards.ts";

const theme = {
  fg: (_color: string, text: string) => text,
} as unknown as Theme;

const fakeRead = (): WrapSource => ({
  description: "Read file contents",
  execute: async () => ({
    content: [{ text: "line one\nline two", type: "text" }],
    details: undefined,
  }),
  name: "read",
  parameters: { type: "object" } as WrapSource["parameters"],
});

const renderContext = (
  args: Record<string, unknown>,
  flags: { isError?: boolean; isPartial?: boolean } = {}
) => ({
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
});

const linesOf = (
  component: { render: (width: number) => string[] } | undefined
) => {
  if (component === undefined) {
    return [];
  }
  return component
    .render(80)
    .map((line) => stripVTControlCharacters(line).trimEnd());
};

describe("wrapActivityTool", () => {
  it("paints a pending activity row from call args", () => {
    const tool = wrapActivityTool(fakeRead());
    const component = tool.renderCall?.(
      { path: "package.json" },
      theme,
      renderContext({ path: "package.json" }, { isPartial: true })
    );
    expect(linesOf(component)).toEqual([
      "● Reading package.json",
      "  L package.json",
    ]);
  });

  it("hides settled read/bash rows so they can fold into the thinking summary", () => {
    const tool = wrapActivityTool(fakeRead());
    const header = tool.renderCall?.(
      { path: "package.json" },
      theme,
      renderContext({ path: "package.json" })
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
    expect(linesOf(header)).toEqual([]);
    expect(linesOf(result)).toEqual([]);
  });

  it("shows expanded detail without a second header", () => {
    const tool = wrapActivityTool(fakeRead());
    const component = tool.renderResult?.(
      {
        content: [{ text: "Error: missing", type: "text" }],
        details: undefined,
      },
      { expanded: true, isPartial: false },
      theme,
      renderContext({ path: "gone.ts" }, { isError: true })
    );
    expect(linesOf(component)).toEqual(["Error: missing", "Error: missing"]);
  });

  it("delegates execute to the original tool", async () => {
    let called = false;
    const original = fakeRead();
    original.execute = async () => {
      called = true;
      return { content: [{ text: "ok", type: "text" }], details: undefined };
    };
    const tool = wrapActivityTool(original);
    const result = await tool.execute(
      "id",
      { path: "a" },
      undefined,
      undefined,
      {
        cwd: "/project",
      } as never
    );
    expect(called).toBe(true);
    expect(result.content[0]).toEqual({ text: "ok", type: "text" });
  });

  it("truncates each activity line to the render width", () => {
    const tool = wrapActivityTool(fakeRead());
    const component = tool.renderCall?.(
      { path: "packages/pi-ui-messages/src/tool-cards.ts" },
      theme,
      renderContext(
        { path: "packages/pi-ui-messages/src/tool-cards.ts" },
        { isPartial: true }
      )
    );
    for (const width of [1, 20, 40, 80]) {
      const lines = component?.render(width) ?? [];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
