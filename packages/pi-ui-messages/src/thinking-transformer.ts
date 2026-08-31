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
  isStreaming: boolean;
  platform?: NodeJS.Platform;
  shortcut: string;
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
    lines,
    platform: input.platform,
    shortcut: input.shortcut,
  });
};
