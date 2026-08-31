import { describe, expect, it } from "vitest";
import { transformThinking } from "../src/thinking-transformer.ts";

const thinking = [
  "reasoning step 1",
  "reasoning step 2",
  "reasoning step 3",
  "reasoning step 4",
].join("\n");

describe("thinking transformer", () => {
  it("streams a header plus the last three lines", () => {
    expect(
      transformThinking(thinking, {
        availableWidth: 80,
        compact: true,
        elapsedMs: 2000,
        isStreaming: true,
        platform: "linux",
        shortcut: "alt+t",
      })
    ).toBe(
      [
        "Thinking (4 lines, alt+t to expand)",
        "reasoning step 2",
        "reasoning step 3",
        "reasoning step 4",
      ].join("\n")
    );
  });

  it("collapses completed thinking to a single summary line", () => {
    expect(
      transformThinking(thinking, {
        availableWidth: 80,
        compact: true,
        elapsedMs: 5000,
        isStreaming: false,
        platform: "linux",
        shortcut: "alt+t",
      })
    ).toBe("Thought for 5s (4 lines collapsed, alt+t to expand)");
  });

  it("counts trimmed lines so a trailing newline does not inflate the summary", () => {
    expect(
      transformThinking(`${thinking}\n`, {
        availableWidth: 80,
        compact: true,
        elapsedMs: 1000,
        isStreaming: false,
        platform: "linux",
        shortcut: "alt+t",
      })
    ).toBe("Thought for 1s (4 lines collapsed, alt+t to expand)");
  });

  it("passes thinking through when expanded", () => {
    expect(
      transformThinking(thinking, {
        availableWidth: 80,
        compact: false,
        elapsedMs: 5000,
        isStreaming: false,
        platform: "linux",
        shortcut: "alt+t",
      })
    ).toBe(thinking);
  });
});
