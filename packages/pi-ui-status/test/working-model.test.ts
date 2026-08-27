import { describe, expect, it } from "vitest";
import {
  classifyRunOutcome,
  createWorkingState,
  updateWorkingState,
} from "../src/working-model.ts";

describe("Working lifecycle model", () => {
  it.each([
    ["inactive", { now: 1000, type: "started" }, "active"],
    ["inactive", { output: 1, type: "assistantUpdated" }, "inactive"],
    ["inactive", { output: 1, type: "assistantEnded" }, "inactive"],
    ["inactive", { outcome: { kind: "done" }, type: "runEnded" }, "inactive"],
    ["inactive", { type: "settled" }, "inactive"],
    ["inactive", { type: "shutdown" }, "inactive"],
    ["active", { now: 2000, type: "started" }, "active"],
    ["active", { output: 1, type: "assistantUpdated" }, "active"],
    ["active", { output: 1, type: "assistantEnded" }, "active"],
    ["active", { outcome: { kind: "done" }, type: "runEnded" }, "pending"],
    ["active", { type: "settled" }, "settled"],
    ["active", { type: "shutdown" }, "inactive"],
    ["pending", { now: 2000, type: "started" }, "active"],
    ["pending", { output: 1, type: "assistantUpdated" }, "pending"],
    ["pending", { output: 1, type: "assistantEnded" }, "pending"],
    [
      "pending",
      { outcome: { kind: "cancelled" }, type: "runEnded" },
      "pending",
    ],
    ["pending", { type: "settled" }, "settled"],
    ["pending", { type: "shutdown" }, "inactive"],
    ["settled", { now: 2000, type: "started" }, "active"],
    ["settled", { output: 1, type: "assistantUpdated" }, "settled"],
    ["settled", { output: 1, type: "assistantEnded" }, "settled"],
    ["settled", { outcome: { kind: "done" }, type: "runEnded" }, "settled"],
    ["settled", { type: "settled" }, "settled"],
    ["settled", { type: "shutdown" }, "inactive"],
  ] as const)("transitions %s through %s to %s", (phase, event, expected) => {
    const active = updateWorkingState(createWorkingState(), {
      now: 1000,
      type: "started",
    });
    const pending = updateWorkingState(active, {
      outcome: { kind: "error", message: "failure" },
      type: "runEnded",
    });
    const states = {
      active,
      inactive: createWorkingState(),
      pending,
      settled: updateWorkingState(pending, { type: "settled" }),
    };

    expect(updateWorkingState(states[phase], event).phase).toBe(expected);
  });

  it("spans repeated starts, retries, and queued continuation until settled", () => {
    let state = createWorkingState();

    state = updateWorkingState(state, { now: 1000, type: "started" });
    state = updateWorkingState(state, { now: 2000, type: "started" });
    state = updateWorkingState(state, {
      outcome: { kind: "error", message: "temporary provider failure" },
      type: "runEnded",
    });
    state = updateWorkingState(state, { now: 3000, type: "started" });
    state = updateWorkingState(state, {
      outcome: { kind: "done" },
      type: "runEnded",
    });
    state = updateWorkingState(state, { type: "settled" });

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

    expect(updateWorkingState(active, { type: "settled" })).toMatchObject({
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
});
