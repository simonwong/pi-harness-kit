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

  it("wraps a long Loaded path under the Loaded label", () => {
    const highlight =
      "/Users/simon/Documents/simon/github/pi-harness-kit/packages/pi-ui-messages/test/extension.test.ts";
    const output = formatCompletedLine({
      availableWidth: 42,
      elapsedMs: 4000,
      highlight,
      lines: 1,
      platform: "linux",
      shortcut: "alt+t",
      toolSummary: "read 1 file, edited 2 files",
    });
    const lines = output.split("\n");
    expect(lines[0]).toBe("Thought for 4s, read 1 file, edited 2 files");
    expect(lines[1]?.startsWith("  L Loaded ")).toBe(true);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines.slice(2)) {
      expect(line.startsWith("           ")).toBe(true);
    }
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
    expect(prefixAssistantReply("- already")).toBe("- already");
    expect(prefixAssistantReply("   ")).toBe("   ");
  });

  it("hangs following reply lines under the bullet text", () => {
    expect(prefixAssistantReply("hello\nworld")).toBe(
      "● hello  \n\u00A0\u00A0world"
    );
  });

  it("indents fences so they are not flush-left code tokens", () => {
    const output = prefixAssistantReply("```text\nfoo\n```");
    expect(output.startsWith("●")).toBe(true);
    expect(output).toContain("\u00A0\u00A0```text");
    expect(output).toContain("\u00A0\u00A0foo");
  });

  it("upgrades the hidden-mode label with latest stats", () => {
    expect(formatHiddenLabel({ elapsedMs: 5000, lines: 60 })).toBe(
      "Thinking · 5s · 60 lines (ctrl+t to show)"
    );
  });
});
