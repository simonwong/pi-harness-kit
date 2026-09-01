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

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;

const COMMAND_HEAD = /\s+/;

const bashTitle = (command: string): string => {
  const head = command.trim().split(COMMAND_HEAD)[0] ?? "command";
  const base = head.split("/").at(-1) ?? head;
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
  return `Running ${clip(base, 24)}`;
};

const textArg = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  return typeof value === "string" ? value : "";
};

export const activityCopy = (
  tool: string,
  args: Record<string, unknown>
): ActivityCopy => {
  switch (tool) {
    case "read":
      return {
        evidence: textArg(args, "path") || "file",
        title: `Reading ${clip(textArg(args, "path") || "file", 56)}`,
      };
    case "write":
      return {
        evidence: textArg(args, "path") || "file",
        title: `Writing ${clip(textArg(args, "path") || "file", 56)}`,
      };
    case "edit":
      return {
        evidence: textArg(args, "path") || "file",
        title: `Editing ${clip(textArg(args, "path") || "file", 56)}`,
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
        title: `Listing ${clip(textArg(args, "path") || ".", 56)}`,
      };
    case "bash": {
      const command = textArg(args, "command");
      return {
        evidence: `$ ${command}`,
        title: bashTitle(command),
      };
    }
    default:
      return { evidence: "", title: tool };
  }
};

export const activityLines = (input: ActivityLineInput): string[] => {
  const lines = [`● ${input.title}`, `  L ${input.evidence}`];
  if (input.error !== undefined) {
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
  if (input.error !== undefined) {
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
