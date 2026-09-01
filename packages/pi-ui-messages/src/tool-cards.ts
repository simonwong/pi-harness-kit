import type {
  AgentToolResult,
  Theme,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { activityCopy, renderActivity } from "./activity-format.ts";

export interface WrapSource {
  description: string;
  execute: ToolDefinition["execute"];
  label?: string;
  name: string;
  parameters: ToolDefinition["parameters"];
  prepareArguments?: ToolDefinition["prepareArguments"];
  promptGuidelines?: string[];
  promptSnippet?: string;
}

const paint = (_theme: Theme, last: unknown, body: string): Text => {
  const text = last instanceof Text ? last : new Text("", 0, 0);
  text.setText(body);
  return text;
};

const resultText = (result: AgentToolResult<unknown>): string => {
  const [part] = result.content;
  return part?.type === "text" ? part.text : "";
};

const resultDetail = (
  tool: string,
  result: AgentToolResult<unknown>
): string => {
  if (tool === "read" && result.content[0]?.type === "image") {
    return "image loaded";
  }
  if (tool === "edit") {
    const details = result.details as { diff?: string } | undefined;
    return details?.diff ?? resultText(result);
  }
  return resultText(result);
};

const resultError = (
  result: AgentToolResult<unknown>,
  context: { isError: boolean }
): string | undefined => {
  if (!(context.isError || resultText(result).startsWith("Error"))) {
    return;
  }
  return resultText(result).split("\n")[0] || "error";
};

export const createDefaultTools = (cwd: string): WrapSource[] => [
  createReadTool(cwd) as unknown as WrapSource,
  createBashTool(cwd) as unknown as WrapSource,
  createEditTool(cwd) as unknown as WrapSource,
  createWriteTool(cwd) as unknown as WrapSource,
  createGrepTool(cwd) as unknown as WrapSource,
  createFindTool(cwd) as unknown as WrapSource,
  createLsTool(cwd) as unknown as WrapSource,
];

export const wrapActivityTool = (original: WrapSource): ToolDefinition => {
  const { name } = original;
  return {
    description: original.description,
    execute: original.execute,
    label: original.label ?? name,
    name,
    parameters: original.parameters,
    prepareArguments: original.prepareArguments,
    promptGuidelines: original.promptGuidelines,
    promptSnippet: original.promptSnippet,
    renderCall(args, theme, context) {
      const copy = activityCopy(name, args as Record<string, unknown>);
      return paint(
        theme,
        context.lastComponent,
        renderActivity(theme, {
          evidence: copy.evidence,
          pending: true,
          title: copy.title,
        })
      );
    },
    renderResult(result, options, theme, context) {
      const copy = activityCopy(name, context.args as Record<string, unknown>);
      return paint(
        theme,
        context.lastComponent,
        renderActivity(theme, {
          detail: resultDetail(name, result),
          error: resultError(result, context),
          evidence: copy.evidence,
          expanded: options.expanded,
          pending: options.isPartial,
          title: copy.title,
        })
      );
    },
    renderShell: "self",
  };
};

export const isBuiltinSource = (source: string | undefined): boolean =>
  source === "builtin";
