import { describe, expect, it } from "vitest";
import {
  extractInlineSkillQuery,
  findInlineSkillTokens,
} from "../src/inline-skill-tokens.ts";

describe("findInlineSkillTokens", () => {
  it("finds tokens at text start and after whitespace", () => {
    expect(findInlineSkillTokens("/research a /code-review b")).toEqual([
      { end: 9, name: "research", start: 0 },
      { end: 24, name: "code-review", start: 12 },
    ]);
  });

  it("accepts the skill: prefixed form and newlines as boundaries", () => {
    expect(findInlineSkillTokens("看看\n/skill:research 一下")).toEqual([
      { end: 18, name: "skill:research", start: 3 },
    ]);
  });

  it("rejects slashes inside words, paths, URLs, and fractions", () => {
    expect(findInlineSkillTokens("a/b 1/2 https://x/y ./z")).toEqual([]);
  });

  it("rejects a bare slash and a slash before punctuation-only names", () => {
    expect(findInlineSkillTokens("a / b")).toEqual([]);
  });

  it("rejects tokens whose name run ends at another slash (path prefixes)", () => {
    expect(findInlineSkillTokens("cat /home/user")).toEqual([]);
    expect(findInlineSkillTokens("cat /tmp")).toEqual([
      { end: 8, name: "tmp", start: 4 },
    ]);
  });

  it("stops at punctuation outside the name charset", () => {
    expect(findInlineSkillTokens("看 /code-review,")).toEqual([
      { end: 14, name: "code-review", start: 2 },
    ]);
  });
});

describe("extractInlineSkillQuery", () => {
  it("extracts the query after whitespace mid-line", () => {
    expect(extractInlineSkillQuery("hello /rev", 0)).toBe("rev");
  });

  it("extracts an empty query right after the slash", () => {
    expect(extractInlineSkillQuery("hello /", 0)).toBe("");
  });

  it("extracts queries at the start of later lines", () => {
    expect(extractInlineSkillQuery("/rev", 1)).toBe("rev");
    expect(extractInlineSkillQuery("/", 2)).toBe("");
  });

  it("rejects the first-line slash-command area including leading whitespace", () => {
    expect(extractInlineSkillQuery("/rev", 0)).toBeUndefined();
    expect(extractInlineSkillQuery("   /rev", 0)).toBeUndefined();
  });

  it("rejects path-like tokens and non-token contexts", () => {
    expect(extractInlineSkillQuery("hello /home/", 0)).toBeUndefined();
    expect(extractInlineSkillQuery("hello a/rev", 0)).toBeUndefined();
    expect(extractInlineSkillQuery("hello", 0)).toBeUndefined();
  });
});
