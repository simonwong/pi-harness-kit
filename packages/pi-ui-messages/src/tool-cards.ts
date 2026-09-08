import type {
  AgentToolResult,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import { activityCopy, renderActivityLine } from "./activity-format.ts";

export interface WrapSource {
  constrainedSampling?: ToolDefinition["constrainedSampling"];
  description: string;
  execute: ToolDefinition["execute"];
  executionMode?: ToolDefinition["executionMode"];
  label?: string;
  name: string;
  parameters: ToolDefinition["parameters"];
  prepareArguments?: ToolDefinition["prepareArguments"];
  promptGuidelines?: string[];
  promptSnippet?: string;
  renderCall?: ToolDefinition["renderCall"];
  renderResult?: ToolDefinition["renderResult"];
  renderShell?: ToolDefinition["renderShell"];
}

export interface FoldVisibility {
  collapsed: () => boolean;
  shouldFold: (toolCallId: string) => boolean;
  traceEnabled: () => boolean;
}

export interface DefaultToolOptions {
  autoResizeImages: boolean;
  shellCommandPrefix?: string;
  shellPath?: string;
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

type ResultRenderer = NonNullable<ToolDefinition["renderResult"]>;

const renderFallbackResult = (
  name: string,
  ...[result, options, theme, context]: Parameters<ResultRenderer>
) => {
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
};

export const createDefaultTools = (
  cwd: string,
  options: DefaultToolOptions
): WrapSource[] => [
  createReadToolDefinition(cwd, {
    autoResizeImages: options.autoResizeImages,
  }) as unknown as WrapSource,
  createBashToolDefinition(cwd, {
    commandPrefix: options.shellCommandPrefix,
    shellPath: options.shellPath,
  }) as unknown as WrapSource,
  createEditToolDefinition(cwd) as unknown as WrapSource,
  createWriteToolDefinition(cwd) as unknown as WrapSource,
  createGrepToolDefinition(cwd) as unknown as WrapSource,
  createFindToolDefinition(cwd) as unknown as WrapSource,
  createLsToolDefinition(cwd) as unknown as WrapSource,
];

export const wrapActivityTool = (
  original: WrapSource,
  visibility: FoldVisibility
): ToolDefinition => {
  const { name } = original;
  const nativeComponents = new WeakMap<
    object,
    {
      call?: Component;
      result?: Component;
    }
  >();
  const componentsFor = (state: object) => {
    let components = nativeComponents.get(state);
    if (components === undefined) {
      components = {};
      nativeComponents.set(state, components);
    }
    return components;
  };
  const folded = (toolCallId: string): boolean =>
    visibility.shouldFold(toolCallId);
  const hidden = (toolCallId: string): boolean =>
    visibility.collapsed() && folded(toolCallId);

  return {
    constrainedSampling: original.constrainedSampling,
    description: original.description,
    execute: original.execute,
    executionMode: original.executionMode,
    label: original.label ?? name,
    name,
    parameters: original.parameters,
    prepareArguments: original.prepareArguments,
    promptGuidelines: original.promptGuidelines,
    promptSnippet: original.promptSnippet,
    renderCall(args, theme, context) {
      const components = componentsFor(context.state);
      const expanded =
        context.expanded ||
        (folded(context.toolCallId) && !visibility.collapsed());
      components.call = original.renderCall?.(args, theme, {
        ...context,
        expanded,
        lastComponent: components.call,
      });
      if (hidden(context.toolCallId)) {
        return paint(context.lastComponent, "");
      }
      if (!(visibility.traceEnabled() || context.expanded)) {
        const copy = activityCopy(name, args as Record<string, unknown>);
        return paint(
          context.lastComponent,
          renderActivityLine(theme, {
            error: context.isError && !context.isPartial ? "failed" : undefined,
            evidence: copy.evidence,
            pending: context.isPartial,
            title: copy.title,
          })
        );
      }
      if (components.call !== undefined) {
        return components.call;
      }
      const copy = activityCopy(name, args as Record<string, unknown>);
      return paint(
        context.lastComponent,
        renderActivityLine(theme, {
          error: context.isError && !context.isPartial ? "failed" : undefined,
          evidence: copy.evidence,
          pending: context.isPartial,
          title: copy.title,
        })
      );
    },
    renderResult(result, options, theme, context) {
      const components = componentsFor(context.state);
      const restoreFully =
        folded(context.toolCallId) && !visibility.collapsed();
      // Native renderers must receive terminal updates even while hidden so they release resources.
      components.result = original.renderResult?.(
        result,
        restoreFully ? { ...options, expanded: true } : options,
        theme,
        {
          ...context,
          expanded: context.expanded || restoreFully,
          lastComponent: components.result,
        }
      );
      if (hidden(context.toolCallId)) {
        return paint(context.lastComponent, "");
      }
      if (!(visibility.traceEnabled() || options.expanded)) {
        return paint(context.lastComponent, "");
      }
      if (components.result !== undefined) {
        return components.result;
      }
      return renderFallbackResult(name, result, options, theme, context);
    },
    renderShell: "self",
  };
};
