import { describe, expect, it } from "vitest";
import {
  createThinkingTracker,
  digestThinking,
} from "../src/thinking-tracker.ts";

describe("thinking duration tracker", () => {
  it("records duration at text or tool boundaries, not thinking_end", () => {
    const tracker = createThinkingTracker();
    tracker.handle({ messageTimestamp: 1, type: "thinking_start" }, 1000);
    tracker.handle(
      {
        delta: "step one\nstep two\n",
        messageTimestamp: 1,
        type: "thinking_delta",
      },
      1000
    );
    expect(tracker.takeFinished()).toEqual([]);

    tracker.handle({ messageTimestamp: 1, type: "boundary" }, 6000);
    const finished = tracker.takeFinished();
    expect(finished).toEqual([
      {
        digest: digestThinking("step one\nstep two"),
        lines: 2,
        ms: 5000,
      },
    ]);
    expect(tracker.lookup("step one\nstep two")).toEqual(finished[0]);
  });

  it("keeps one run across repeated thinking_start on the same message", () => {
    const tracker = createThinkingTracker();
    tracker.handle({ messageTimestamp: 7, type: "thinking_start" }, 100);
    tracker.handle(
      { delta: "first", messageTimestamp: 7, type: "thinking_delta" },
      100
    );
    tracker.handle({ messageTimestamp: 7, type: "thinking_start" }, 400);
    tracker.handle(
      { delta: "second", messageTimestamp: 7, type: "thinking_delta" },
      400
    );
    tracker.handle({ messageTimestamp: 7, type: "boundary" }, 1100);

    const finished = tracker.takeFinished();
    expect(finished).toHaveLength(1);
    expect(finished[0]?.ms).toBe(1000);
    expect(finished[0]?.digest).toBe(digestThinking("first\n\nsecond"));
  });

  it("restores persisted records without inventing missing durations", () => {
    const tracker = createThinkingTracker();
    const record = {
      digest: digestThinking("old thought"),
      lines: 3,
      ms: 8000,
    };
    tracker.restore([record]);
    expect(tracker.lookup("old thought")).toEqual(record);
    expect(tracker.lookup("unknown block")).toBeUndefined();
  });
});
