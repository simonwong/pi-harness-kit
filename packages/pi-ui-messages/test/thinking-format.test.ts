import { describe, expect, it } from "vitest";
import {
  formatCompletedLine,
  formatHiddenLabel,
  formatStreamingHeader,
  prefixAssistantReply,
  tailWindow,
} from "../src/thinking-format.ts";

describe("thinking presentation copy", () => {
  it("formats the streaming header with spinner and expand hint, without live seconds", () => {
    expect(
      formatStreamingHeader({
        elapsedMs: 17_400,
        frame: 0,
        lines: 56,
        platform: "linux",
        shortcut: "alt+t",
      })
    ).toBe("⠋ Thinking · 17s (56 lines, alt+t to expand)");
  });

  it("formats the completed single line without a tail preview", () => {
    expect(
      formatCompletedLine({
        elapsedMs: 5400,
        lines: 60,
        platform: "linux",
        shortcut: "alt+t",
      })
    ).toBe("Thought for 5s (60 lines collapsed, alt+t to expand)");
  });

  it("folds tool counts into the completed thinking line", () => {
    expect(
      formatCompletedLine({
        elapsedMs: 24_000,
        highlight: "CLAUDE.md",
        lines: 12,
        platform: "linux",
        shortcut: "alt+t",
        toolSummary:
          "searched for 5 patterns, read 1 file, listed 3 directories, ran 1 shell command",
      })
    ).toBe(
      [
        "Thought for 24s, searched for 5 patterns, read 1 file, listed 3 directories, ran 1 shell command",
        "  L Loaded CLAUDE.md",
      ].join("\n")
    );
  });

  it("omits fabricated duration on completed historical thinking", () => {
    expect(
      formatCompletedLine({
        elapsedMs: undefined,
        lines: 12,
        platform: "linux",
        shortcut: "alt+o",
      })
    ).toBe("Thought (12 lines collapsed, alt+o to expand)");
  });

  it("keeps the last three lines for the streaming tail window", () => {
    expect(tailWindow("a\nb\nc\nd\ne", 3, 80)).toEqual(["c", "d", "e"]);
    expect(tailWindow("only", 3, 80)).toEqual(["only"]);
  });

  it("keeps the last wrapped rows when thinking is one long paragraph", () => {
    const text = `${"head ".repeat(12)}${"tail ".repeat(12)}`.trim();
    const preview = tailWindow(text, 3, 12).join(" ");
    expect(preview).toContain("tail");
    expect(preview).not.toContain("head");
  });

  it("shows option instead of alt on macOS", () => {
    expect(
      formatStreamingHeader({
        elapsedMs: 1000,
        frame: 0,
        lines: 4,
        platform: "darwin",
        shortcut: "alt+t",
      })
    ).toBe("⠋ Thinking · 1s (4 lines, option+t to expand)");
    expect(
      formatCompletedLine({
        elapsedMs: 5000,
        lines: 60,
        platform: "darwin",
        shortcut: "alt+t",
      })
    ).toBe("Thought for 5s (60 lines collapsed, option+t to expand)");
  });

  it("prefixes assistant replies with a bullet once", () => {
    expect(prefixAssistantReply("hello")).toBe("● hello");
    expect(prefixAssistantReply("● already")).toBe("● already");
    expect(prefixAssistantReply("   ")).toBe("   ");
  });

  it("upgrades the hidden-mode label with latest stats", () => {
    expect(formatHiddenLabel({ elapsedMs: 5000, lines: 60 })).toBe(
      "Thinking · 5s · 60 lines (ctrl+t to show)"
    );
  });
});
