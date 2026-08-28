export const DURATION_ENTRY_TYPE = "pi-ui:compact-thinking-duration";

export interface DurationRecord {
  digest: string;
  lines: number;
  ms: number;
}

export type TrackerEvent =
  | { messageTimestamp: number; type: "thinking_start" }
  | { delta: string; messageTimestamp: number; type: "thinking_delta" }
  | { messageTimestamp: number; type: "boundary" };

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
  typeof value.lines === "number" &&
  Number.isInteger(value.lines) &&
  value.lines >= 0 &&
  typeof value.ms === "number" &&
  Number.isFinite(value.ms) &&
  value.ms >= 1;

export const createThinkingTracker = () => {
  const stats = new Map<string, DurationRecord>();
  const pending: DurationRecord[] = [];
  let activeTimestamp: number | undefined;
  let runStartMs: number | undefined;
  let buffer = "";

  const finish = (now: number): void => {
    if (runStartMs === undefined) {
      return;
    }
    const text = buffer.trim();
    const ms = Math.max(1, now - runStartMs);
    if (text.length > 0) {
      const record: DurationRecord = {
        digest: digestThinking(text),
        lines: text.split("\n").length,
        ms,
      };
      stats.set(record.digest, record);
      pending.push(record);
    }
    activeTimestamp = undefined;
    runStartMs = undefined;
    buffer = "";
  };

  const startRun = (messageTimestamp: number, now: number): void => {
    if (activeTimestamp === messageTimestamp && runStartMs !== undefined) {
      if (buffer.length > 0) {
        buffer = `${buffer}\n\n`;
      }
      return;
    }
    if (runStartMs !== undefined) {
      finish(now);
    }
    activeTimestamp = messageTimestamp;
    runStartMs = now;
    buffer = "";
  };

  return {
    handle(event: TrackerEvent, now: number): void {
      if (event.type === "thinking_start") {
        startRun(event.messageTimestamp, now);
        return;
      }
      if (event.type === "thinking_delta") {
        if (runStartMs === undefined) {
          startRun(event.messageTimestamp, now);
        }
        buffer += event.delta;
        return;
      }
      finish(now);
    },
    isRunActive(): boolean {
      return runStartMs !== undefined;
    },
    lookup(markdown: string): DurationRecord | undefined {
      const text = markdown.trim();
      if (text.length === 0) {
        return;
      }
      return stats.get(digestThinking(text));
    },
    reset(): void {
      stats.clear();
      pending.length = 0;
      activeTimestamp = undefined;
      runStartMs = undefined;
      buffer = "";
    },
    restore(records: DurationRecord[]): void {
      for (const record of records) {
        stats.set(record.digest, record);
      }
    },
    streamingElapsedMs(now: number): number {
      if (runStartMs === undefined) {
        return 0;
      }
      return Math.max(0, now - runStartMs);
    },
    takeFinished(): DurationRecord[] {
      return pending.splice(0, pending.length);
    },
  };
};

export type ThinkingTracker = ReturnType<typeof createThinkingTracker>;
