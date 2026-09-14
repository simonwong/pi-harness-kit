import { describe, expect, it } from "vitest";
import {
  classifyRunOutcome,
  createWorkingState,
  updateWorkingState,
  visibleOutputTokens,
} from "../src/working-model.ts";

describe("Working lifecycle model", () => {
  it.each([
    ["inactive", { now: 1000, type: "started" }, "active"],
    ["inactive", { output: 1, type: "assistantUpdated" }, "inactive"],
    ["inactive", { now: 0, output: 1, type: "assistantEnded" }, "inactive"],
    [
      "inactive",
      { now: 0, outcome: { kind: "done" }, type: "runEnded" },
      "inactive",
    ],
    ["inactive", { now: 0, type: "settled" }, "inactive"],
    ["inactive", { type: "shutdown" }, "inactive"],
    ["active", { now: 2000, type: "started" }, "active"],
    ["active", { output: 1, type: "assistantUpdated" }, "active"],
    ["active", { now: 0, output: 1, type: "assistantEnded" }, "active"],
    [
      "active",
      { now: 0, outcome: { kind: "done" }, type: "runEnded" },
      "pending",
    ],
    ["active", { now: 0, type: "settled" }, "settled"],
    ["active", { type: "shutdown" }, "inactive"],
    ["pending", { now: 2000, type: "started" }, "active"],
    ["pending", { output: 1, type: "assistantUpdated" }, "pending"],
    ["pending", { now: 0, output: 1, type: "assistantEnded" }, "pending"],
    [
      "pending",
      { now: 0, outcome: { kind: "cancelled" }, type: "runEnded" },
      "pending",
    ],
    ["pending", { now: 0, type: "settled" }, "settled"],
    ["pending", { type: "shutdown" }, "inactive"],
    ["settled", { now: 2000, type: "started" }, "active"],
    ["settled", { output: 1, type: "assistantUpdated" }, "settled"],
    ["settled", { now: 0, output: 1, type: "assistantEnded" }, "settled"],
    [
      "settled",
      { now: 0, outcome: { kind: "done" }, type: "runEnded" },
      "settled",
    ],
    ["settled", { now: 0, type: "settled" }, "settled"],
    ["settled", { type: "shutdown" }, "inactive"],
  ] as const)("transitions %s through %s to %s", (phase, event, expected) => {
    const active = updateWorkingState(createWorkingState(), {
      now: 1000,
      type: "started",
    });
    const pending = updateWorkingState(active, {
      now: 0,
      outcome: { kind: "error", message: "failure" },
      type: "runEnded",
    });
    const states = {
      active,
      inactive: createWorkingState(),
      pending,
      settled: updateWorkingState(pending, { now: 0, type: "settled" }),
    };

    expect(updateWorkingState(states[phase], event).phase).toBe(expected);
  });

  it.each([
    { now: 2500, output: 10, type: "assistantEnded" },
    { now: 2500, outcome: { kind: "cancelled" }, type: "runEnded" },
    { now: 2500, type: "settled" },
  ] as const)("closes interrupted thinking on $type", (event) => {
    let state = updateWorkingState(createWorkingState(), {
      now: 0,
      type: "started",
    });
    state = updateWorkingState(state, { now: 500, type: "thinkingStarted" });
    state = updateWorkingState(state, { now: 1000, type: "thinkingStarted" });
    state = updateWorkingState(state, event);
    expect(state).toMatchObject({
      thinkingMilliseconds: 2000,
      thinkingObserved: true,
      thinkingStartedAt: undefined,
    });
    state = updateWorkingState(state, { now: 9000, type: "settled" });
    expect(state.thinkingMilliseconds).toBe(2000);
    state = updateWorkingState(state, { now: 10_000, type: "started" });
    expect(state).toMatchObject({
      thinkingMilliseconds: 0,
      thinkingObserved: false,
    });
  });

  it.each(["inactive", "pending", "settled"] as const)(
    "ignores thinking events while %s",
    (phase) => {
      const state = { ...createWorkingState(), phase };
      expect(
        updateWorkingState(state, { now: 1000, type: "thinkingStarted" })
      ).toEqual(state);
      expect(
        updateWorkingState(state, { now: 2000, type: "thinkingEnded" })
      ).toEqual(state);
    }
  );

  it("records an end-only thinking event without inventing elapsed time", () => {
    const active = updateWorkingState(createWorkingState(), {
      now: 0,
      type: "started",
    });
    const ended = updateWorkingState(active, {
      now: 10_000,
      type: "thinkingEnded",
    });
    expect(ended).toMatchObject({
      thinkingMilliseconds: 0,
      thinkingObserved: true,
      thinkingStartedAt: undefined,
    });
    expect(
      updateWorkingState(ended, { now: 11_000, type: "thinkingEnded" })
    ).toEqual(ended);
    expect(updateWorkingState(ended, { type: "shutdown" })).toEqual(
      createWorkingState()
    );
  });

  it("spans repeated starts, retries, and queued continuation until settled", () => {
    let state = createWorkingState();

    state = updateWorkingState(state, { now: 1000, type: "started" });
    state = updateWorkingState(state, { now: 2000, type: "started" });
    state = updateWorkingState(state, {
      now: 0,
      outcome: { kind: "error", message: "temporary provider failure" },
      type: "runEnded",
    });
    state = updateWorkingState(state, { now: 3000, type: "started" });
    state = updateWorkingState(state, {
      now: 0,
      outcome: { kind: "done" },
      type: "runEnded",
    });
    state = updateWorkingState(state, { now: 0, type: "settled" });

    expect(state).toMatchObject({
      outcome: { kind: "done" },
      phase: "settled",
      startedAt: 1000,
    });
  });

  it("uses cumulative active usage and finalized message usage without double counting", () => {
    let state = updateWorkingState(createWorkingState(), {
      now: 1000,
      type: "started",
    });

    state = updateWorkingState(state, {
      output: 80,
      type: "assistantUpdated",
    });
    state = updateWorkingState(state, {
      output: 120,
      type: "assistantUpdated",
    });
    expect(state.completedOutput + state.activeOutput).toBe(120);

    state = updateWorkingState(state, {
      now: 0,
      output: 125,
      type: "assistantEnded",
    });
    state = updateWorkingState(state, {
      output: 40,
      type: "assistantUpdated",
    });

    expect(state).toMatchObject({
      activeOutput: 40,
      completedOutput: 125,
      outputReported: true,
    });
    expect(state.completedOutput + state.activeOutput).toBe(165);
  });

  it("omits default zero usage and preserves positive streaming usage at message end", () => {
    let state = updateWorkingState(createWorkingState(), {
      now: 1000,
      type: "started",
    });
    state = updateWorkingState(state, {
      now: 0,
      output: 0,
      type: "assistantEnded",
    });
    expect(state).toMatchObject({
      activeOutput: 0,
      completedOutput: 0,
      outputReported: false,
    });

    state = updateWorkingState(state, {
      output: 84,
      type: "assistantUpdated",
    });
    state = updateWorkingState(state, {
      now: 0,
      output: 0,
      type: "assistantEnded",
    });
    expect(state).toMatchObject({
      activeOutput: 0,
      completedOutput: 84,
      outputReported: true,
    });
  });

  it("classifies the last assistant outcome and preserves public error information", () => {
    expect(
      classifyRunOutcome([
        { errorMessage: "first", role: "assistant", stopReason: "error" },
        {
          errorMessage: " final error ",
          role: "assistant",
          stopReason: "error",
        },
      ])
    ).toEqual({ kind: "error", message: "final error" });
    expect(
      classifyRunOutcome([{ role: "assistant", stopReason: "aborted" }])
    ).toEqual({ kind: "cancelled" });
    expect(
      classifyRunOutcome([{ role: "assistant", stopReason: "stop" }])
    ).toEqual({ kind: "done" });
    for (const stopReason of ["deferred", "length", "pending", "toolUse"]) {
      expect(classifyRunOutcome([{ role: "assistant", stopReason }])).toEqual({
        kind: "unknown",
      });
    }
    expect(classifyRunOutcome([])).toEqual({ kind: "unknown" });
    expect(classifyRunOutcome([{ role: "toolResult" }])).toEqual({
      kind: "unknown",
    });
  });

  it("keeps settlement neutral when no run outcome was observed", () => {
    const active = updateWorkingState(createWorkingState(), {
      now: 1000,
      type: "started",
    });

    expect(
      updateWorkingState(active, { now: 0, type: "settled" })
    ).toMatchObject({
      outcome: { kind: "unknown" },
      phase: "settled",
    });
  });

  it("returns to an inert state on shutdown and ignores inactive usage", () => {
    let state = updateWorkingState(createWorkingState(), {
      output: 99,
      type: "assistantUpdated",
    });
    expect(state).toEqual(createWorkingState());

    state = updateWorkingState(state, { now: 1000, type: "started" });
    state = updateWorkingState(state, { type: "shutdown" });
    state = updateWorkingState(state, { type: "shutdown" });

    expect(state).toEqual(createWorkingState());
  });

  it("uses reasoning tokens only while output is still unreported", () => {
    expect(visibleOutputTokens({ output: 0, reasoning: 40 })).toBe(40);
    expect(visibleOutputTokens({ output: 200, reasoning: 40 })).toBe(200);
    expect(visibleOutputTokens({ output: 84 })).toBe(84);
    expect(visibleOutputTokens({ output: 0 })).toBe(0);
    expect(visibleOutputTokens({ output: 0, reasoning: Number.NaN })).toBe(0);
  });
});
