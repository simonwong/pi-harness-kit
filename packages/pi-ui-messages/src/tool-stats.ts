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
    return classifyBash(textArg(args, "command"));
  }
  return "skip";
};

const classifyBash = (
  command: string
): "list" | "pattern" | "shell" => {
  const head = bashHead(command);
  if (head === "grep" || head === "rg" || head === "find") {
    return "pattern";
  }
  if (head === "ls") {
    return "list";
  }
  return "shell";
};

const BUCKET_KEY = {
  edit: "edits",
  file: "files",
  list: "lists",
  pattern: "patterns",
  shell: "shells",
  write: "writes",
} as const;

const FILE_BUCKETS = new Set(["edits", "files", "writes"]);

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
    if (bucket === "skip") {
      continue;
    }
    const key = BUCKET_KEY[bucket];
    stats[key] += 1;
    const path = textArg(args, "path");
    if (path.length > 0 && FILE_BUCKETS.has(key)) {
      stats.highlight = path;
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
