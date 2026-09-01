export const TOOL_CARD_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
] as const;

export type ToolCardName = (typeof TOOL_CARD_NAMES)[number];

export interface ActivityCopy {
  evidence: string;
  title: string;
}

export interface ActivityLineInput {
  detail?: string;
  error?: string;
  evidence: string;
  expanded?: boolean;
  pending: boolean;
  title: string;
}

const COMMAND_HEAD = /\s+/;
const LEADING_DOLLAR = /^\$ /;

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;

export const basename = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) ?? path;
};

const bashTitle = (command: string): string => {
  const head = command.trim().split(COMMAND_HEAD)[0] ?? "command";
  const base = basename(head);
  if (base === "grep" || base === "rg") {
    return "Searching";
  }
  if (base === "ls") {
    return "Listing";
  }
  if (base === "find") {
    return "Finding";
  }
  if (base === "cat" || base === "head" || base === "tail" || base === "sed") {
    return "Reading";
  }
  if (base === "cd") {
    return "Running cd";
  }
  return `Running ${clip(base, 24)}`;
};

const textArg = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  return typeof value === "string" ? value : "";
};

const preferredArg = (args: Record<string, unknown>): string => {
  const keys = [
    "path",
    "file_path",
    "command",
    "pattern",
    "query",
    "url",
    "name",
    "description",
  ];
  for (const key of keys) {
    const value = textArg(args, key);
    if (value.length > 0) {
      return key === "command" ? `$ ${value}` : value;
    }
  }
  return "";
};

const humanize = (tool: string): string =>
  tool
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\b\w/g, (char) => char.toUpperCase());

export const activityCopy = (
  tool: string,
  args: Record<string, unknown>
): ActivityCopy => {
  switch (tool) {
    case "read":
      return {
        evidence: textArg(args, "path") || "file",
        title: `Reading ${basename(textArg(args, "path") || "file")}`,
      };
    case "write":
      return {
        evidence: textArg(args, "path") || "file",
        title: `Writing ${basename(textArg(args, "path") || "file")}`,
      };
    case "edit":
      return {
        evidence: textArg(args, "path") || "file",
        title: `Editing ${basename(textArg(args, "path") || "file")}`,
      };
    case "grep":
      return {
        evidence: textArg(args, "path") || textArg(args, "glob") || ".",
        title: `Searching for ${clip(textArg(args, "pattern") || "pattern", 40)}`,
      };
    case "find":
      return {
        evidence: textArg(args, "path") || ".",
        title: `Finding ${clip(textArg(args, "pattern") || "files", 40)}`,
      };
    case "ls":
      return {
        evidence: textArg(args, "path") || ".",
        title: `Listing ${basename(textArg(args, "path") || ".")}`,
      };
    case "bash": {
      const command = textArg(args, "command");
      return {
        evidence: `$ ${command}`,
        title: bashTitle(command),
      };
    }
    default: {
      const evidence = preferredArg(args);
      return {
        evidence,
        title:
          evidence.length > 0
            ? `${humanize(tool)} ${clip(basename(evidence.replace(LEADING_DOLLAR, "")), 40)}`
            : humanize(tool),
      };
    }
  }
};

export const activityLines = (input: ActivityLineInput): string[] => {
  const lines = [`● ${input.title}`, `  L ${input.evidence}`];
  if (input.error !== undefined && input.error.length > 0) {
    lines.push(`  ${input.error}`);
  }
  if (
    input.expanded === true &&
    input.detail !== undefined &&
    input.detail.length > 0
  ) {
    for (const line of input.detail.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  return lines;
};

export const renderActivity = (
  theme: {
    fg: (
      color: "accent" | "dim" | "error" | "muted" | "success" | "text",
      text: string
    ) => string;
  },
  input: ActivityLineInput
): string => {
  let dot = theme.fg("success", "●");
  if (input.error !== undefined) {
    dot = theme.fg("error", "●");
  } else if (input.pending) {
    dot = theme.fg("accent", "●");
  }
  const lines = [
    `${dot} ${input.title}`,
    `  ${theme.fg("dim", "L")} ${theme.fg("muted", input.evidence)}`,
  ];
  if (input.error !== undefined && input.error.length > 0) {
    lines.push(`  ${theme.fg("error", input.error)}`);
  }
  if (
    input.expanded === true &&
    input.detail !== undefined &&
    input.detail.length > 0
  ) {
    for (const line of input.detail.split("\n")) {
      lines.push(`  ${theme.fg("dim", line)}`);
    }
  }
  return lines.join("\n");
};
