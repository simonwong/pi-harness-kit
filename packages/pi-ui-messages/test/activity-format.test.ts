import { describe, expect, it } from "vitest";
import { activityCopy, activityLines } from "../src/activity-format.ts";

describe("activityCopy", () => {
  it("titles the seven builtins from args, not from a model description", () => {
    expect(activityCopy("read", { path: "package.json" })).toEqual({
      evidence: "package.json",
      title: "Reading package.json",
    });
    expect(activityCopy("write", { path: "src/a.ts" })).toEqual({
      evidence: "src/a.ts",
      title: "Writing src/a.ts",
    });
    expect(activityCopy("edit", { path: "src/a.ts" })).toEqual({
      evidence: "src/a.ts",
      title: "Editing src/a.ts",
    });
    expect(
      activityCopy("grep", { path: "packages", pattern: "toolCards" })
    ).toEqual({
      evidence: "packages",
      title: "Searching for toolCards",
    });
    expect(activityCopy("find", { path: ".", pattern: "*.md" })).toEqual({
      evidence: ".",
      title: "Finding *.md",
    });
    expect(activityCopy("ls", { path: "packages" })).toEqual({
      evidence: "packages",
      title: "Listing packages",
    });
    expect(activityCopy("bash", { command: "grep -rn toolCards" })).toEqual({
      evidence: "$ grep -rn toolCards",
      title: "Searching",
    });
    expect(activityCopy("bash", { command: "pnpm test" })).toEqual({
      evidence: "$ pnpm test",
      title: "Running pnpm",
    });
  });
});

describe("activityLines", () => {
  it("renders a pending activity row with a nested evidence line", () => {
    expect(
      activityLines({
        evidence: "package.json",
        pending: true,
        title: "Reading package.json",
      })
    ).toEqual(["● Reading package.json", "  L package.json"]);
  });

  it("keeps compact settled rows to title plus evidence", () => {
    expect(
      activityLines({
        evidence: "$ echo hi",
        pending: false,
        title: "Running echo",
      })
    ).toEqual(["● Running echo", "  L $ echo hi"]);
  });

  it("appends error and expanded detail without inventing progress", () => {
    expect(
      activityLines({
        detail: "boom",
        error: "exit 2",
        evidence: "$ false",
        expanded: true,
        pending: false,
        title: "Running false",
      })
    ).toEqual(["● Running false", "  L $ false", "  exit 2", "  boom"]);
  });
});
