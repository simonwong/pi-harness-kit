import {
  countSourceLines,
  formatCompletedLine,
  formatStreamingHeader,
  THINKING_TAIL_LINES,
  tailWindow,
} from "./thinking-format.ts";

export interface ThinkingTransformInput {
  availableWidth: number;
  compact: boolean;
  elapsedMs: number | undefined;
  frame: number;
  highlight?: string;
  isStreaming: boolean;
  platform?: NodeJS.Platform;
  shortcut: string;
  toolSummary?: string;
}

export const transformThinking = (
  markdown: string,
  input: ThinkingTransformInput
): string => {
  const text = markdown.trim();
  if (!input.compact || text.length === 0) {
    return markdown;
  }

  const lines = countSourceLines(text);
  if (input.isStreaming) {
    const header = formatStreamingHeader({
      elapsedMs: input.elapsedMs ?? 0,
      frame: input.frame,
      lines,
      platform: input.platform,
      shortcut: input.shortcut,
    });
    return [
      header,
      ...tailWindow(text, THINKING_TAIL_LINES, input.availableWidth),
    ].join("\n");
  }

  return formatCompletedLine({
    elapsedMs: input.elapsedMs,
    highlight: input.highlight,
    lines,
    platform: input.platform,
    shortcut: input.shortcut,
    toolSummary: input.toolSummary,
  });
};
