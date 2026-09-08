export const DURATION_ENTRY_TYPE = "pi-ui:compact-thinking-duration";
export const TRACE_FOLD_ENTRY_TYPE = "pi-ui:trace-fold";
const TRACE_FOLD_VERSION = 2;

export interface DurationRecord {
  digest: string;
  key?: string;
  lines: number;
  ms: number;
}

export interface TraceFoldRecord {
  durationMs: number;
  firstDigest: string;
  firstKey: string;
  lines: number;
  thinkingDigests: string[];
  thinkingKeys: string[];
  toolCallIds: string[];
  toolCount: number;
  version: 2;
}

export interface TraceFoldPresentation {
  anchorKey: string;
  elapsedMs: number;
  latestText?: string;
  lines: number;
  role: "anchor" | "hidden";
  streaming: boolean;
  toolCount: number;
  toolSummary?: string;
}

interface ToolCallFact {
  id: string;
  name: string;
}

interface ThinkingBlock {
  durationMs: number;
  finished: boolean;
  key: string;
  startedAt: number;
  text: string;
}

interface MutableTrace {
  blocks: ThinkingBlock[];
  tools: ToolCallFact[];
}

interface TraceFoldingOptions {
  onSettle: (record: TraceFoldRecord) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const digestThinking = (text: string): string => {
  let hash = 5381;
  for (const char of text) {
    hash = Math.imul(hash, 33) + char.charCodeAt(0);
  }
  return Math.abs(hash).toString(16);
};

export const isDurationRecord = (value: unknown): value is DurationRecord =>
  isRecord(value) &&
  typeof value.digest === "string" &&
  value.digest.length > 0 &&
  (value.key === undefined ||
    (typeof value.key === "string" && value.key.length > 0)) &&
  typeof value.lines === "number" &&
  Number.isInteger(value.lines) &&
  value.lines >= 0 &&
  typeof value.ms === "number" &&
  Number.isFinite(value.ms) &&
  value.ms >= 1;

const sourceLines = (text: string): number => {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split("\n").length;
};

const blockDigest = (block: ThinkingBlock): string =>
  digestThinking(block.text.trim());

const durationAt = (block: ThinkingBlock, now: number): number =>
  block.durationMs + (block.finished ? 0 : Math.max(0, now - block.startedAt));

const nonEmptyBlocks = (trace: MutableTrace): ThinkingBlock[] =>
  trace.blocks.filter((block) => block.text.trim().length > 0);

const toolSummary = (count: number): string | undefined =>
  count === 0 ? undefined : `used ${count} ${count === 1 ? "tool" : "tools"}`;

export const isTraceFoldRecord = (value: unknown): value is TraceFoldRecord =>
  isRecord(value) &&
  value.version === TRACE_FOLD_VERSION &&
  typeof value.durationMs === "number" &&
  Number.isFinite(value.durationMs) &&
  value.durationMs >= 0 &&
  typeof value.firstDigest === "string" &&
  value.firstDigest.length > 0 &&
  typeof value.lines === "number" &&
  Number.isInteger(value.lines) &&
  value.lines > 0 &&
  Array.isArray(value.thinkingDigests) &&
  value.thinkingDigests.length > 0 &&
  value.thinkingDigests.every(
    (digest) => typeof digest === "string" && digest.length > 0
  ) &&
  value.thinkingDigests.at(0) === value.firstDigest &&
  typeof value.firstKey === "string" &&
  Array.isArray(value.thinkingKeys) &&
  value.thinkingKeys.length === value.thinkingDigests.length &&
  value.thinkingKeys.every(
    (key) => typeof key === "string" && key.length > 0
  ) &&
  new Set(value.thinkingKeys).size === value.thinkingKeys.length &&
  value.thinkingKeys.at(0) === value.firstKey &&
  Array.isArray(value.toolCallIds) &&
  value.toolCallIds.every(
    (callId) => typeof callId === "string" && callId.length > 0
  ) &&
  typeof value.toolCount === "number" &&
  new Set(value.toolCallIds).size === value.toolCallIds.length &&
  Number.isInteger(value.toolCount) &&
  value.toolCount >= 0 &&
  value.toolCount === value.toolCallIds.length;

export const durationRecordsFromBranch = (
  branch: readonly unknown[]
): DurationRecord[] => {
  const records: DurationRecord[] = [];
  for (const entry of branch) {
    if (
      !isRecord(entry) ||
      entry.type !== "custom" ||
      entry.customType !== DURATION_ENTRY_TYPE ||
      !isDurationRecord(entry.data)
    ) {
      continue;
    }
    records.push(entry.data);
  }
  return records;
};

export const recordsFromTraceBranch = (
  branch: readonly unknown[]
): TraceFoldRecord[] => {
  const records: TraceFoldRecord[] = [];
  for (const entry of branch) {
    if (
      !isRecord(entry) ||
      entry.type !== "custom" ||
      entry.customType !== TRACE_FOLD_ENTRY_TYPE ||
      !isTraceFoldRecord(entry.data)
    ) {
      continue;
    }
    records.push(entry.data);
  }
  return records;
};

export const observedToolIdsFromBranch = (
  branch: readonly unknown[]
): string[] => {
  const ids = new Set<string>();
  for (const entry of branch) {
    if (
      !isRecord(entry) ||
      entry.type !== "message" ||
      !isRecord(entry.message) ||
      entry.message.role !== "assistant" ||
      !Array.isArray(entry.message.content)
    ) {
      continue;
    }
    for (const content of entry.message.content) {
      if (
        isRecord(content) &&
        content.type === "toolCall" &&
        typeof content.id === "string" &&
        content.id.length > 0
      ) {
        ids.add(content.id);
      }
    }
  }
  return [...ids];
};

export const createTraceFolding = (options: TraceFoldingOptions) => {
  const durations = new Map<string, DurationRecord>();
  const keyedDurations = new Map<string, DurationRecord>();
  const ambiguousDurations = new Set<string>();
  const pendingDurations: DurationRecord[] = [];
  const settledBlocks = new Map<string, TraceFoldRecord>();
  const digestKeys = new Map<string, Set<string>>();
  const settledTools = new Map<string, string>();
  const observedTools = new Set<string>();
  let active: MutableTrace | undefined;
  let activeBlock: ThinkingBlock | undefined;

  const ensureTrace = (): MutableTrace => {
    active ??= { blocks: [], tools: [] };
    return active;
  };

  const indexDuration = (record: DurationRecord): void => {
    const previous = durations.get(record.digest);
    if (previous !== undefined && previous.key !== record.key) {
      ambiguousDurations.add(record.digest);
    }
    durations.set(record.digest, record);
    if (record.key !== undefined) {
      keyedDurations.set(record.key, record);
    }
  };

  const finishActiveBlock = (now: number, content?: string): void => {
    if (activeBlock === undefined || activeBlock.finished) {
      return;
    }
    if (content !== undefined) {
      activeBlock.text = content;
    }
    activeBlock.durationMs += Math.max(0, now - activeBlock.startedAt);
    activeBlock.finished = true;
    const text = activeBlock.text.trim();
    if (text.length > 0) {
      const record: DurationRecord = {
        digest: digestThinking(text),
        key: activeBlock.key,
        lines: sourceLines(text),
        ms: Math.max(1, activeBlock.durationMs),
      };
      indexDuration(record);
      pendingDurations.push(record);
    }
    activeBlock = undefined;
  };

  const indexRecord = (record: TraceFoldRecord): void => {
    for (const [index, key] of record.thinkingKeys.entries()) {
      settledBlocks.set(key, record);
      const digest = record.thinkingDigests[index];
      if (digest !== undefined) {
        const keys = digestKeys.get(digest) ?? new Set<string>();
        keys.add(key);
        digestKeys.set(digest, keys);
      }
    }
    for (const callId of record.toolCallIds) {
      settledTools.set(callId, record.firstKey);
      observedTools.add(callId);
    }
  };

  const presentation = (
    trace: MutableTrace,
    role: "anchor" | "hidden",
    now: number
  ): TraceFoldPresentation => {
    const blocks = nonEmptyBlocks(trace);
    const durationMs = blocks.reduce(
      (sum, block) => sum + durationAt(block, now),
      0
    );
    const lines = blocks.reduce(
      (sum, block) => sum + sourceLines(block.text),
      0
    );
    return {
      anchorKey: blocks[0].key,
      elapsedMs: durationMs,
      latestText: activeBlock?.text,
      lines,
      role,
      streaming: activeBlock !== undefined,
      toolCount: trace.tools.length,
      toolSummary: toolSummary(trace.tools.length),
    };
  };

  const uniqueThinkingKey = (text: string): readonly string[] | undefined => {
    const digest = digestThinking(text);
    const matching = new Set(digestKeys.get(digest));
    for (const block of active === undefined ? [] : nonEmptyBlocks(active)) {
      if (blockDigest(block) === digest) {
        matching.add(block.key);
      }
    }
    return matching.size === 1 ? [...matching] : undefined;
  };

  return {
    anchorForTool(callId: string): string | undefined {
      const settled = settledTools.get(callId);
      if (settled !== undefined) {
        return settled;
      }
      if (active === undefined) {
        return;
      }
      if (active.tools.some((tool) => tool.id === callId)) {
        return nonEmptyBlocks(active).at(0)?.key;
      }
    },
    boundary(now: number): void {
      finishActiveBlock(now);
    },
    clear(): void {
      durations.clear();
      keyedDurations.clear();
      ambiguousDurations.clear();
      pendingDurations.length = 0;
      settledBlocks.clear();
      digestKeys.clear();
      settledTools.clear();
      observedTools.clear();
      active = undefined;
      activeBlock = undefined;
    },
    isThinkingActive(): boolean {
      return activeBlock !== undefined;
    },
    lookup(
      markdown: string,
      now: number,
      thinkingKeys?: readonly string[]
    ): TraceFoldPresentation | undefined {
      const text = markdown.trim();
      if (text.length === 0) {
        return;
      }
      const keys = thinkingKeys ?? uniqueThinkingKey(text);
      if (keys === undefined) {
        return;
      }
      if (active !== undefined) {
        const blocks = nonEmptyBlocks(active);
        const first = blocks.at(0);
        if (
          first !== undefined &&
          blocks.some((block) => keys.includes(block.key))
        ) {
          return presentation(
            active,
            keys.includes(first.key) ? "anchor" : "hidden",
            now
          );
        }
      }
      const record = keys
        .map((key) => settledBlocks.get(key))
        .find((value) => value !== undefined);
      if (record !== undefined) {
        return {
          anchorKey: record.firstKey,
          elapsedMs: record.durationMs,
          lines: record.lines,
          role: keys.includes(record.firstKey) ? "anchor" : "hidden",
          streaming: false,
          toolCount: record.toolCount,
          toolSummary: toolSummary(record.toolCount),
        };
      }
    },
    lookupDuration(
      markdown: string,
      keys?: readonly string[]
    ): DurationRecord | undefined {
      if (keys !== undefined) {
        const records = keys.map((key) => keyedDurations.get(key));
        if (records.some((record) => record === undefined)) {
          return;
        }
        return {
          digest: digestThinking(markdown.trim()),
          lines: records.reduce((sum, record) => sum + (record?.lines ?? 0), 0),
          ms: records.reduce((sum, record) => sum + (record?.ms ?? 0), 0),
        };
      }
      const text = markdown.trim();
      return text.length === 0 || ambiguousDurations.has(digestThinking(text))
        ? undefined
        : durations.get(digestThinking(text));
    },
    restore(records: readonly TraceFoldRecord[]): void {
      settledBlocks.clear();
      digestKeys.clear();
      settledTools.clear();
      observedTools.clear();
      for (const record of records) {
        indexRecord(record);
      }
    },
    restoreDurations(records: readonly DurationRecord[]): void {
      for (const record of records) {
        indexDuration(record);
      }
    },
    restoreObservedTools(callIds: readonly string[]): void {
      for (const callId of callIds) {
        observedTools.add(callId);
      }
    },
    settle(now: number): void {
      finishActiveBlock(now);
      const trace = active;
      active = undefined;
      if (trace === undefined || trace.blocks.length === 0) {
        return;
      }
      const blocks = nonEmptyBlocks(trace);
      const thinkingDigests = blocks.map(blockDigest);
      const [firstDigest] = thinkingDigests;
      const thinkingKeys = blocks.map((block) => block.key);
      const [firstKey] = thinkingKeys;
      if (firstDigest === undefined || firstKey === undefined) {
        return;
      }
      const record: TraceFoldRecord = {
        durationMs: blocks.reduce((sum, block) => sum + block.durationMs, 0),
        firstDigest,
        firstKey,
        lines: blocks.reduce((sum, block) => sum + sourceLines(block.text), 0),
        thinkingDigests,
        thinkingKeys,
        toolCallIds: trace.tools.map((tool) => tool.id),
        toolCount: trace.tools.length,
        version: TRACE_FOLD_VERSION,
      };
      indexRecord(record);
      options.onSettle(record);
    },
    shouldFoldTool(callId: string): boolean {
      return this.anchorForTool(callId) !== undefined;
    },
    streamingElapsedMs(now: number): number {
      return activeBlock === undefined
        ? 0
        : Math.max(0, now - activeBlock.startedAt);
    },
    takeFinishedDurations(): DurationRecord[] {
      return pendingDurations.splice(0, pendingDurations.length);
    },
    thinkingDelta(key: string, delta: string, now: number): void {
      if (activeBlock === undefined || activeBlock.key !== key) {
        this.thinkingStart(key, now);
      }
      if (activeBlock?.key === key) {
        activeBlock.text += delta;
      }
    },
    thinkingEnd(key: string, content: string, now: number): void {
      if (activeBlock?.key !== key) {
        return;
      }
      finishActiveBlock(now, content);
    },
    thinkingStart(key: string, now: number): void {
      if (activeBlock?.key === key) {
        if (activeBlock.text.length > 0) {
          activeBlock.text += "\n\n";
        }
        return;
      }
      finishActiveBlock(now);
      const block: ThinkingBlock = {
        durationMs: 0,
        finished: false,
        key,
        startedAt: now,
        text: "",
      };
      ensureTrace().blocks.push(block);
      activeBlock = block;
    },
    toolCall(tool: ToolCallFact): void {
      if (observedTools.has(tool.id)) {
        return;
      }
      observedTools.add(tool.id);
      ensureTrace().tools.push(tool);
    },
    visibleText(now: number): void {
      this.settle(now);
    },
  };
};

export type TraceFolding = ReturnType<typeof createTraceFolding>;
