import { describe, expect, it } from "vitest";
import {
  createTraceFolding,
  isTraceFoldRecord,
  observedToolIdsFromBranch,
  type TraceFoldRecord,
} from "../src/trace-folding.ts";

const createModel = () => {
  const records: TraceFoldRecord[] = [];
  return {
    model: createTraceFolding({ onSettle: (record) => records.push(record) }),
    records,
  };
};

describe("createTraceFolding", () => {
  it("restores observed pure-tool IDs from the selected branch and clears them on replacement", () => {
    const { model, records } = createModel();
    model.restoreObservedTools(
      observedToolIdsFromBranch([
        {
          message: {
            content: [{ id: "old-tool", type: "toolCall" }],
            role: "assistant",
          },
          type: "message",
        },
        { message: { content: "hello", role: "user" }, type: "message" },
      ])
    );
    model.toolCall({ id: "old-tool", name: "read" });
    model.thinkingStart("1:0", 0);
    model.thinkingEnd("1:0", "new trace", 100);
    model.visibleText(100);
    expect(records[0]?.toolCount).toBe(0);
    model.clear();
    model.thinkingStart("2:0", 200);
    model.thinkingEnd("2:0", "new branch", 300);
    model.toolCall({ id: "old-tool", name: "read" });
    expect(model.anchorForTool("old-tool")).toBe("2:0");
  });

  it("keeps one tool invocation in its original trace across delayed execution events", () => {
    const { model, records } = createModel();
    model.thinkingStart("1:0", 0);
    model.thinkingEnd("1:0", "first", 100);
    model.toolCall({ id: "tool-1", name: "read" });
    model.visibleText(100);
    model.toolCall({ id: "tool-1", name: "read" });
    model.thinkingStart("2:0", 200);
    model.thinkingEnd("2:0", "second", 300);
    model.visibleText(300);
    expect(records.map((record) => record.toolCount)).toEqual([1, 0]);
    expect(model.anchorForTool("tool-1")).toBe("1:0");
  });

  it("does not move a pure-tool invocation under a later thinking anchor", () => {
    const { model, records } = createModel();
    model.toolCall({ id: "tool-1", name: "read" });
    model.visibleText(100);
    model.toolCall({ id: "tool-1", name: "read" });
    model.thinkingStart("2:0", 200);
    model.thinkingEnd("2:0", "later", 300);
    model.visibleText(300);
    expect(records.map((record) => record.toolCount)).toEqual([0]);
    expect(model.anchorForTool("tool-1")).toBeUndefined();
  });

  it("keeps equal thinking text attached to its original message across traces and restore", () => {
    const { model, records } = createModel();
    const think = (key: string, text: string, start: number, end: number) => {
      model.thinkingStart(key, start);
      model.thinkingDelta(key, text, start);
      model.thinkingEnd(key, text, end);
    };
    think("1:0", "anchor", 0, 100);
    think("2:0", "same", 100, 200);
    model.toolCall({ id: "first-tool", name: "read" });
    model.visibleText(200);
    think("3:0", "same", 300, 2300);
    model.visibleText(2300);

    for (const candidate of [model, createModel().model]) {
      candidate.restore(records);
      expect(candidate.lookup("same", 2300, ["2:0"])?.role).toBe("hidden");
      expect(candidate.lookup("same", 2300, ["3:0"])).toMatchObject({
        elapsedMs: 2000,
        role: "anchor",
        toolCount: 0,
      });
      expect(candidate.lookup("same", 2300)).toBeUndefined();
    }
  });

  it("looks up a host-joined run of consecutive thinking blocks", () => {
    const { model } = createModel();
    model.thinkingStart("1:0", 0);
    model.thinkingEnd("1:0", "first", 100);
    model.thinkingStart("1:1", 100);
    model.thinkingEnd("1:1", "second", 300);
    model.toolCall({ id: "read-1", name: "read" });
    model.visibleText(300);
    expect(model.lookup("first\n\nsecond", 300, ["1:0", "1:1"])).toMatchObject({
      elapsedMs: 300,
      lines: 2,
      role: "anchor",
      toolCount: 1,
    });
  });

  it("owns duration tracking and restores historical duration records", () => {
    const { model } = createModel();
    model.thinkingStart("same", 100);
    model.thinkingDelta("same", "first", 100);
    model.thinkingStart("same", 400);
    model.thinkingDelta("same", "second", 400);
    model.boundary(1100);

    const [record] = model.takeFinishedDurations();
    expect(record).toEqual({
      digest: expect.any(String),
      key: "same",
      lines: 3,
      ms: 1000,
    });
    expect(model.lookupDuration("first\n\nsecond")).toEqual(record);

    const restored = createModel().model;
    restored.restoreDurations(record === undefined ? [] : [record]);
    expect(restored.lookupDuration("first\n\nsecond")).toEqual(record);
    expect(restored.lookupDuration("unknown")).toBeUndefined();
  });
  it("uses the first thinking block as anchor and hides later blocks", () => {
    const { model } = createModel();
    model.thinkingStart("m1:0", 0);
    model.thinkingDelta("m1:0", "first\nthought", 0);
    model.thinkingEnd("m1:0", "first\nthought", 300);
    model.toolCall({ id: "tool-1", name: "read" });
    model.thinkingStart("m2:0", 400);
    model.thinkingDelta("m2:0", "second thought", 0);

    expect(model.lookup("first\nthought", 900)).toMatchObject({
      elapsedMs: 800,
      lines: 3,
      role: "anchor",
      streaming: true,
      toolCount: 1,
    });
    expect(model.lookup("second thought", 900)).toMatchObject({
      role: "hidden",
    });
    expect(model.shouldFoldTool("tool-1")).toBe(true);
  });

  it("settles at visible text and restores persisted visibility", () => {
    const { model, records } = createModel();
    model.thinkingStart("m1:0", 100);
    model.thinkingDelta("m1:0", "first", 0);
    model.thinkingEnd("m1:0", "first", 350);
    model.toolCall({ id: "tool-1", name: "bash" });
    model.thinkingStart("m2:0", 400);
    model.thinkingDelta("m2:0", "second", 0);
    model.thinkingEnd("m2:0", "second", 550);
    model.visibleText(600);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      durationMs: 400,
      firstDigest: expect.any(String),
      firstKey: "m1:0",
      lines: 2,
      thinkingDigests: expect.any(Array),
      thinkingKeys: ["m1:0", "m2:0"],
      toolCallIds: ["tool-1"],
      toolCount: 1,
      version: 2,
    });

    const restored = createModel().model;
    restored.restore(records);
    expect(restored.lookup("first", 1000)?.role).toBe("anchor");
    expect(restored.lookup("second", 1000)?.role).toBe("hidden");
    expect(restored.shouldFoldTool("tool-1")).toBe(true);
  });

  it("ignores empty thinking blocks when choosing the anchor", () => {
    const { model } = createModel();
    model.thinkingStart("empty", 0);
    model.thinkingEnd("empty", "", 100);
    model.toolCall({ id: "tool-1", name: "read" });

    expect(model.shouldFoldTool("tool-1")).toBe(false);

    model.thinkingStart("non-empty", 200);
    model.thinkingDelta("non-empty", "real anchor", 0);
    model.thinkingEnd("non-empty", "real anchor", 300);

    expect(model.lookup("real anchor", 400)?.role).toBe("anchor");
    expect(model.shouldFoldTool("tool-1")).toBe(true);
  });

  it("does not hide a pure-tool trace", () => {
    const { model, records } = createModel();
    model.toolCall({ id: "tool-only", name: "bash" });
    model.visibleText(100);

    expect(records).toEqual([]);
    expect(model.shouldFoldTool("tool-only")).toBe(false);
  });

  it("clears pending state on session replacement", () => {
    const { model } = createModel();
    model.thinkingStart("old", 0);
    model.thinkingDelta("old", "old thinking", 0);
    model.toolCall({ id: "old-tool", name: "read" });

    model.clear();

    expect(model.lookup("old thinking", 100)).toBeUndefined();
    expect(model.shouldFoldTool("old-tool")).toBe(false);
  });

  it("counts unknown third-party tools without owning their renderer", () => {
    const { model } = createModel();
    model.thinkingStart("m1:0", 0);
    model.thinkingDelta("m1:0", "thinking", 0);
    model.thinkingEnd("m1:0", "thinking", 100);
    model.toolCall({
      id: "third-party",
      name: "subagent",
    });

    expect(model.lookup("thinking", 200)).toMatchObject({
      toolCount: 1,
      toolSummary: "used 1 tool",
    });
    expect(model.shouldFoldTool("third-party")).toBe(true);
  });

  it("ignores malformed records", () => {
    const { model, records } = createModel();
    model.thinkingStart("1:0", 0);
    model.thinkingEnd("1:0", "anchor", 100);
    model.visibleText(100);
    const [valid] = records;
    expect(isTraceFoldRecord(valid)).toBe(true);
    expect(isTraceFoldRecord({ ...valid, version: 1 })).toBe(false);
    expect(isTraceFoldRecord({ ...valid, firstKey: "missing" })).toBe(false);
    expect(isTraceFoldRecord({ ...valid, thinkingKeys: ["1:0", "1:0"] })).toBe(
      false
    );
    expect(
      isTraceFoldRecord({
        ...valid,
        toolCallIds: ["same", "same"],
        toolCount: 2,
      })
    ).toBe(false);
    expect(isTraceFoldRecord({ version: 1 })).toBe(false);
    expect(
      isTraceFoldRecord({
        durationMs: 1,
        firstDigest: "second",
        lines: 2,
        thinkingDigests: ["first", "second"],
        toolCallIds: [],
        toolCount: 0,
        version: 1,
      })
    ).toBe(false);
    expect(
      isTraceFoldRecord({
        durationMs: -1,
        firstDigest: "x",
        lines: 1,
        thinkingDigests: ["x"],
        toolCallIds: [],
        toolCount: 0,
        version: 1,
      })
    ).toBe(false);
  });
});
