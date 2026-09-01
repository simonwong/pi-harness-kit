import { describe, expect, it } from "vitest";
import {
  countTools,
  formatToolStats,
  shouldFoldTool,
} from "../src/tool-stats.ts";

describe("tool stats", () => {
  it("counts reads, greps, lists, and shells", () => {
    const stats = countTools([
      { args: { pattern: "a" }, name: "grep" },
      { args: { command: "rg foo" }, name: "bash" },
      { args: { path: "packages/CLAUDE.md" }, name: "read" },
      { args: { path: "packages" }, name: "ls" },
      { args: { command: "pnpm test" }, name: "bash" },
      { args: { path: "x.ts" }, name: "edit" },
    ]);
    expect(formatToolStats(stats)).toBe(
      "searched for 2 patterns, read 1 file, listed 1 directory, ran 1 shell command"
    );
    expect(stats.highlight).toBe("packages/CLAUDE.md");
  });

  it("folds read/bash and keeps edit/write visible", () => {
    expect(shouldFoldTool("read")).toBe(true);
    expect(shouldFoldTool("bash")).toBe(true);
    expect(shouldFoldTool("edit")).toBe(false);
    expect(shouldFoldTool("write")).toBe(false);
  });
});
