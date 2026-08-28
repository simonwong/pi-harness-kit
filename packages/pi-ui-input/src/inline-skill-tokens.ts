/**
 * Inline skill `/token` scanner.
 *
 * Trigger detection, autocomplete, and submission expansion share these
 * definitions so all three agree on what counts as an inline skill
 * reference: a `/name` token whose `/` sits at the start of the text or
 * directly after whitespace, whose name uses the skill-name charset, and
 * which contains no second `/`. Paths, URLs, and fractions never match.
 * Design follows Kimi Code CLI's inline-skill-tokens and the herbertgao
 * pi-inline-skills boundary rules.
 */

export interface InlineSkillToken {
  /** Index one past the last name character. */
  end: number;
  /** Token text without the leading `/` (may carry a `skill:` prefix). */
  name: string;
  /** Index of the leading `/` in the scanned text. */
  start: number;
}

const NAME_CHARACTER = /[a-zA-Z0-9:_-]/;
const WHITESPACE = /\s/;

export const findInlineSkillTokens = (text: string): InlineSkillToken[] => {
  const tokens: InlineSkillToken[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "/") {
      continue;
    }
    const before = index > 0 ? text[index - 1] : undefined;
    if (before !== undefined && !WHITESPACE.test(before)) {
      continue;
    }

    let end = index + 1;
    while (end < text.length && NAME_CHARACTER.test(text[end] ?? "")) {
      end += 1;
    }

    const name = text.slice(index + 1, end);
    if (name.length === 0) {
      continue;
    }
    // A name run terminated by another `/` is a path segment, not a token.
    if (text[end] === "/") {
      continue;
    }
    tokens.push({ end, name, start: index });
  }

  return tokens;
};

const QUERY_PATTERN = /(?:^|[ \t])\/([a-zA-Z0-9:_-]*)$/;

/**
 * Extract the autocomplete query for an inline `/query` token at the caret.
 * Returns the query without the leading `/`, or undefined when the caret is
 * not on an inline skill token. The leading slash-command area of the first
 * line belongs to the native slash-command path and never matches here.
 */
export const extractInlineSkillQuery = (
  textBeforeCursor: string,
  cursorLine: number
): string | undefined => {
  const match = QUERY_PATTERN.exec(textBeforeCursor);
  if (!match) {
    return;
  }
  const query = match[1] ?? "";
  if (cursorLine === 0) {
    const slashIndex = textBeforeCursor.length - query.length - 1;
    if (textBeforeCursor.slice(0, slashIndex).trim() === "") {
      return;
    }
  }
  return query;
};
