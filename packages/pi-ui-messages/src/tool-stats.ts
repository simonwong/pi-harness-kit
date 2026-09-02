export interface ToolCallFact {
  args?: unknown;
  name: string;
}

export interface ToolStats {
  edits: number;
  files: number;
  highlight?: string;
  lists: number;
  patterns: number;
  shells: number;
  writes: number;
}

const COMMAND_HEAD = /\s+/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textArg = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  return typeof value === "string" ? value : "";
};

const bashHead = (command: string): string => {
  const head = command.trim().split(COMMAND_HEAD)[0] ?? "";
  const parts = head.split("/").filter(Boolean);
  return parts.at(-1) ?? head;
};

export const shouldFoldTool = (_name: string): boolean => true;

const classify = (
  name: string,
  args: Record<string, unknown>
): "edit" | "file" | "list" | "pattern" | "shell" | "skip" | "write" => {
  if (name === "read") {
    return "file";
  }
  if (name === "ls") {
    return "list";
  }
  if (name === "grep" || name === "find") {
    return "pattern";
  }
  if (name === "edit") {
    return "edit";
  }
  if (name === "write") {
    return "write";
  }
  if (name === "bash") {
    const head = bashHead(textArg(args, "command"));
    if (head === "grep" || head === "rg") {
      return "pattern";
    }
    if (head === "ls") {
      return "list";
    }
    if (head === "find") {
      return "pattern";
    }
    return "shell";
  }
  return "skip";
};

export const countTools = (calls: readonly ToolCallFact[]): ToolStats => {
  const stats: ToolStats = {
    edits: 0,
    files: 0,
    lists: 0,
    patterns: 0,
    shells: 0,
    writes: 0,
  };
  for (const call of calls) {
    const args = isRecord(call.args) ? call.args : {};
    const bucket = classify(call.name, args);
    const path = textArg(args, "path");
    if (bucket === "file") {
      stats.files += 1;
      if (path.length > 0) {
        stats.highlight = path;
      }
    } else if (bucket === "edit") {
      stats.edits += 1;
      if (path.length > 0) {
        stats.highlight = path;
      }
    } else if (bucket === "write") {
      stats.writes += 1;
      if (path.length > 0) {
        stats.highlight = path;
      }
    } else if (bucket === "list") {
      stats.lists += 1;
    } else if (bucket === "pattern") {
      stats.patterns += 1;
    } else if (bucket === "shell") {
      stats.shells += 1;
    }
  }
  return stats;
};

const phrase = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const formatToolStats = (stats: ToolStats): string => {
  const parts: string[] = [];
  if (stats.patterns > 0) {
    parts.push(`searched for ${phrase(stats.patterns, "pattern", "patterns")}`);
  }
  if (stats.files > 0) {
    parts.push(`read ${phrase(stats.files, "file", "files")}`);
  }
  if (stats.lists > 0) {
    parts.push(`listed ${phrase(stats.lists, "directory", "directories")}`);
  }
  if (stats.edits > 0) {
    parts.push(`edited ${phrase(stats.edits, "file", "files")}`);
  }
  if (stats.writes > 0) {
    parts.push(`wrote ${phrase(stats.writes, "file", "files")}`);
  }
  if (stats.shells > 0) {
    parts.push(
      `ran ${phrase(stats.shells, "shell command", "shell commands")}`
    );
  }
  return parts.join(", ");
};

export const hasToolStats = (
  stats: ToolStats | undefined
): stats is ToolStats =>
  stats !== undefined &&
  (stats.edits > 0 ||
    stats.files > 0 ||
    stats.lists > 0 ||
    stats.patterns > 0 ||
    stats.shells > 0 ||
    stats.writes > 0);

export const extractToolCalls = (content: unknown): ToolCallFact[] => {
  if (!Array.isArray(content)) {
    return [];
  }
  const calls: ToolCallFact[] = [];
  for (const part of content) {
    if (!isRecord(part) || part.type !== "toolCall") {
      continue;
    }
    if (typeof part.name !== "string") {
      continue;
    }
    calls.push({
      args: part.arguments ?? part.args,
      name: part.name,
    });
  }
  return calls;
};

export const extractThinkingTexts = (content: unknown): string[] => {
  if (!Array.isArray(content)) {
    return [];
  }
  const texts: string[] = [];
  for (const part of content) {
    if (!isRecord(part) || part.type !== "thinking") {
      continue;
    }
    if (typeof part.thinking === "string" && part.thinking.length > 0) {
      texts.push(part.thinking);
    } else if (typeof part.text === "string" && part.text.length > 0) {
      texts.push(part.text);
    }
  }
  return texts;
};
