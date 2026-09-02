import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

export const THINKING_TAIL_LINES = 3;

export const THINKING_TICK_MS_FULL = 80;

export const SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

const TAIL_WRAP_SLACK_LINES = 2;
const TAIL_WRAP_MIN_CHARS = 2000;

const spinnerIcon = (frame: number): string => {
  const index = Math.abs(frame) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[index] ?? "⠋";
};

export const formatShortcutLabel = (
  shortcut: string,
  platform: NodeJS.Platform = process.platform
): string =>
  shortcut
    .split("+")
    .map((part) =>
      platform === "darwin" && part.toLowerCase() === "alt" ? "option" : part
    )
    .join("+");

export const formatStreamingHeader = (input: {
  elapsedMs: number;
  frame: number;
  lines: number;
  platform?: NodeJS.Platform;
  shortcut: string;
}): string => {
  const shortcut = formatShortcutLabel(input.shortcut, input.platform);
  const seconds = Math.floor(input.elapsedMs / 1000);
  return `${spinnerIcon(input.frame)} Thinking · ${seconds}s (${input.lines} lines, ${shortcut} to expand)`;
};

export const formatCompletedLine = (input: {
  elapsedMs: number | undefined;
  highlight?: string;
  lines: number;
  platform?: NodeJS.Platform;
  shortcut: string;
  toolSummary?: string;
}): string => {
  const duration =
    input.elapsedMs === undefined
      ? ""
      : ` for ${Math.round(input.elapsedMs / 1000)}s`;
  if (input.toolSummary !== undefined && input.toolSummary.length > 0) {
    let line = `● Thought${duration}, ${input.toolSummary}`;
    if (input.highlight !== undefined && input.highlight.length > 0) {
      line += `\n  L Loaded ${input.highlight}`;
    }
    return line;
  }
  const shortcut = formatShortcutLabel(input.shortcut, input.platform);
  return `● Thought${duration} (${input.lines} lines collapsed, ${shortcut} to expand)`;
};

export const formatHiddenLabel = (input: {
  elapsedMs: number | undefined;
  lines: number;
}): string => {
  if (input.elapsedMs === undefined) {
    return `Thinking · ${input.lines} lines (ctrl+t to show)`;
  }
  return `Thinking · ${Math.round(input.elapsedMs / 1000)}s · ${input.lines} lines (ctrl+t to show)`;
};

export const countSourceLines = (markdown: string): number => {
  if (markdown.length === 0) {
    return 0;
  }
  return markdown.split("\n").length;
};

export const tailWindow = (
  markdown: string,
  count: number,
  width: number
): string[] => {
  const contentWidth = Math.max(1, width);
  const budget = Math.max(
    contentWidth * (count + TAIL_WRAP_SLACK_LINES),
    TAIL_WRAP_MIN_CHARS
  );
  let source = markdown;
  if (source.length > budget) {
    const start = source.length - budget;
    const newline = source.indexOf("\n", start);
    source = newline === -1 ? source.slice(start) : source.slice(newline + 1);
  }
  const lines = wrapTextWithAnsi(source.replace(/\t/g, "   "), contentWidth);
  if (lines.length <= count) {
    return lines;
  }
  return lines.slice(-count);
};
