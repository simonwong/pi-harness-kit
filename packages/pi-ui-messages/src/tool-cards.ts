import type {
  AgentToolResult,
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
import { truncateToWidth } from "@earendil-works/pi-tui";
import { activityCopy, renderActivity } from "./activity-format.ts";
import { shouldFoldTool } from "./tool-stats.ts";

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

class ActivityRow {
  private body = "";

  setText(body: string): void {
    this.body = body;
  }

  invalidate(): void {
    // Truncation depends on render width, not cached theme.
  }

  render(width: number): string[] {
    if (this.body.length === 0) {
      return [];
    }
    const limit = Math.max(1, width);
    return this.body.split("\n").map((line) => truncateToWidth(line, limit));
  }
}

const paint = (last: unknown, body: string): ActivityRow => {
  const row = last instanceof ActivityRow ? last : new ActivityRow();
  row.setText(body);
  return row;
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
      if (shouldFoldTool(name) && !context.isPartial) {
        return paint(context.lastComponent, "");
      }
      const copy = activityCopy(name, args as Record<string, unknown>);
      return paint(
        context.lastComponent,
        renderActivity(theme, {
          error: context.isError && !context.isPartial ? "" : undefined,
          evidence: copy.evidence,
          pending: context.isPartial,
          title: copy.title,
        })
      );
    },
    renderResult(result, options, theme, context) {
      if (!options.expanded) {
        return paint(context.lastComponent, "");
      }
      const error = resultError(result, context);
      const detail = resultDetail(name, result);
      const lines: string[] = [];
      if (error !== undefined) {
        lines.push(theme.fg("error", error));
      }
      if (detail.length > 0) {
        for (const line of detail.split("\n")) {
          lines.push(theme.fg("dim", line));
        }
      }
      return paint(context.lastComponent, lines.join("\n"));
    },
    renderShell: "self",
  };
};
