import {
  AssistantMessageComponent,
  initTheme,
  type MarkdownTransformer,
  type ToolDefinition,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  getCapabilities,
  setCapabilities,
} from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { type WrapSource, wrapActivityTool } from "../src/tool-cards.ts";
import { attachTranscriptView } from "../src/transcript-view.ts";

type Message = NonNullable<
  ConstructorParameters<typeof AssistantMessageComponent>[0]
>;
const message = (timestamp: number, content: Message["content"]): Message =>
  ({ content, role: "assistant", timestamp }) as Message;

const fakeTool = (): WrapSource => ({
  description: "Read",
  execute: async () => ({ content: [], details: undefined }),
  name: "read",
  parameters: { type: "object" } as WrapSource["parameters"],
  renderCall: () => ({
    invalidate: () => undefined,
    render: () => ["native call"],
  }),
  renderResult: () => ({
    invalidate: () => undefined,
    render: () => ["native result"],
  }),
});

const setup = () => {
  initTheme("dark", false);
  const root = new Container();
  const owned = new Set<ToolDefinition>();
  let collapsed = true;
  let revision = 0;
  const view = attachTranscriptView(
    { children: [root] },
    {
      anchorForTool: () => "1:0",
      collapsed: () => collapsed,
      isOwnedTool: (definition) => owned.has(definition),
      revision: () => revision,
    }
  );
  const tool = wrapActivityTool(fakeTool(), {
    collapsed: () => collapsed,
    shouldFold: (id) => view.canFoldTool(id),
    traceEnabled: () => true,
  });
  owned.add(tool);
  const calls: (readonly string[] | undefined)[] = [];
  const transformer: MarkdownTransformer = (text, context) => {
    if (context.messageType === "assistant-thinking") {
      calls.push(view.thinkingKeys());
    }
    return text;
  };
  const assistant = new AssistantMessageComponent(
    message(1, [{ thinking: "anchor", type: "thinking" }]),
    false,
    undefined,
    undefined,
    undefined,
    [transformer]
  );
  const host = new ToolExecutionComponent(
    "read",
    "tool-1",
    { path: "file" },
    { showImages: true },
    tool,
    { requestRender: () => undefined } as never,
    "/project"
  );
  host.updateResult({
    content: [{ text: "output", type: "text" }],
    isError: false,
  });
  root.addChild(assistant);
  root.addChild(host);
  return {
    assistant,
    calls,
    host,
    root,
    setCollapsed(value: boolean) {
      collapsed = value;
      revision += 1;
    },
    transformer,
    view,
  };
};

describe("Transcript view adapter", () => {
  it("expands and collapses already completed host tools on render", () => {
    const fixture = setup();
    expect(fixture.root.render(80).join("\n")).not.toContain("native result");
    fixture.setCollapsed(false);
    expect(fixture.root.render(80).join("\n")).toContain("native result");
    fixture.setCollapsed(true);
    expect(fixture.root.render(80).join("\n")).not.toContain("native result");
  });

  it("folds the complete host component including inline images", () => {
    const previous = getCapabilities();
    setCapabilities({ ...previous, images: "kitty" });
    try {
      const fixture = setup();
      fixture.host.updateResult({
        content: [
          {
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
            mimeType: "image/png",
            type: "image",
          },
        ],
        isError: false,
      });
      fixture.root.render(80);
      expect(fixture.host.render(80)).toEqual([]);
      fixture.setCollapsed(false);
      expect(fixture.root.render(80).join("\n")).toContain("\u001b_G");
    } finally {
      setCapabilities(previous);
    }
  });

  it("identifies equal thinking text and contiguous blocks by message and content position", () => {
    const fixture = setup();
    fixture.assistant.updateContent(
      message(1, [
        { thinking: "same", type: "thinking" },
        { thinking: "same", type: "thinking" },
        { text: "reply", type: "text" },
        { thinking: "same", type: "thinking" },
      ])
    );
    fixture.root.addChild(
      new AssistantMessageComponent(
        message(2, [{ thinking: "same", type: "thinking" }]),
        false,
        undefined,
        undefined,
        undefined,
        [fixture.transformer]
      )
    );
    fixture.root.render(80);
    expect(fixture.calls).toEqual([["1:0", "1:1"], ["1:3"], ["2:0"]]);
    expect(fixture.view.thinkingKeys()).toBeUndefined();
  });

  it("keeps tools native when the anchor is hidden by Pi", () => {
    const fixture = setup();
    fixture.assistant.setHideThinkingBlock(true);
    expect(fixture.root.render(80).join("\n")).toContain("native result");
  });

  it("leaves extension-owned tools untouched", () => {
    const fixture = setup();
    const foreign = new ToolExecutionComponent(
      "todo",
      "foreign",
      {},
      { showImages: false },
      {
        ...fakeTool(),
        label: "Todo",
        name: "todo",
        renderShell: "self",
      },
      { requestRender: () => undefined } as never,
      "/project"
    );
    fixture.root.addChild(foreign);
    const original = foreign.render;
    expect(fixture.root.render(80).join("\n")).toContain("native call");
    expect(foreign.render).toBe(original);
    expect(fixture.view.canFoldTool("foreign")).toBe(false);
  });

  it("keeps evidence visible when the host identity seam is unavailable", () => {
    const fixture = setup();
    Object.defineProperty(fixture.assistant, "lastMessage", {
      value: undefined,
    });
    expect(fixture.root.render(80).join("\n")).toContain("native result");
    expect(fixture.calls).toEqual([undefined]);
    expect(fixture.view.canFoldTool("tool-1")).toBe(false);
  });

  it("drops fold membership when session-tree navigation replaces the transcript", () => {
    const fixture = setup();
    fixture.root.render(80);
    expect(fixture.view.canFoldTool("tool-1")).toBe(true);
    fixture.root.clear();
    fixture.root.addChild(fixture.host);
    expect(fixture.root.render(80).join("\n")).toContain("native result");
    expect(fixture.view.canFoldTool("tool-1")).toBe(false);
  });

  it("restores native component behavior on disposal", () => {
    const fixture = setup();
    fixture.root.render(80);
    fixture.view.dispose();
    fixture.view.dispose();
    expect(fixture.root.render(80).join("\n")).toContain("native result");
    expect(fixture.view.canFoldTool("tool-1")).toBe(false);
  });
});
