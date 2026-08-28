import { stripFrontmatter } from "@earendil-works/pi-coding-agent";
import { findInlineSkillTokens } from "./inline-skill-tokens.ts";
import type { SkillEntry, SkillResolver } from "./skill-catalog.ts";

export type SkillFileReader = (skill: SkillEntry) => Promise<string> | string;

export interface InlineSkillExpansion {
  /** Names of skills whose blocks were prepended, in first-mention order. */
  expanded: string[];
  /** Names of skills that resolved but failed to load; tokens stay literal. */
  failed: string[];
  /** The transformed text: skill blocks followed by the original text. */
  text: string;
}

/**
 * Build one skill block byte-identical to pi's native `/skill:` expansion:
 * same element order, same "References are relative" line, same frontmatter
 * stripping and trimming.
 */
export const buildSkillBlock = (skill: SkillEntry, content: string): string => {
  const body = stripFrontmatter(content).trim();
  return `<skill name="${skill.name}" location="${skill.path}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
};

/**
 * Expand inline skill tokens into native skill blocks prepended to the
 * original message. Returns undefined when the message needs no
 * transformation: no resolvable tokens, or exactly one resolved token at the
 * very start of the message, which the native `/skill:` path already owns.
 * Every submission re-expands so edited skills take effect immediately;
 * tokens whose files fail to load stay literal in the prose.
 */
export const expandInlineSkills = async (
  text: string,
  resolve: SkillResolver,
  readSkill: SkillFileReader
): Promise<InlineSkillExpansion | undefined> => {
  const tokens = findInlineSkillTokens(text);
  if (tokens.length === 0) {
    return;
  }

  const resolved: SkillEntry[] = [];
  const seen = new Set<string>();
  let leadingResolvedCount = 0;
  for (const token of tokens) {
    const skill = resolve(token.name);
    if (skill === undefined) {
      continue;
    }
    if (token.start === 0) {
      leadingResolvedCount += 1;
    }
    if (seen.has(skill.name)) {
      continue;
    }
    seen.add(skill.name);
    resolved.push(skill);
  }

  if (resolved.length === 0) {
    return;
  }
  if (
    resolved.length === 1 &&
    leadingResolvedCount === 1 &&
    tokens.length === 1
  ) {
    return;
  }

  const blocks: string[] = [];
  const expanded: string[] = [];
  const failed: string[] = [];
  const reads = await Promise.allSettled(
    resolved.map(async (skill) =>
      buildSkillBlock(skill, await readSkill(skill))
    )
  );
  for (const [index, outcome] of reads.entries()) {
    const skill = resolved[index];
    if (skill === undefined) {
      continue;
    }
    if (outcome.status === "fulfilled") {
      blocks.push(outcome.value);
      expanded.push(skill.name);
    } else {
      failed.push(skill.name);
    }
  }

  if (blocks.length === 0) {
    return;
  }
  return { expanded, failed, text: `${blocks.join("\n\n")}\n\n${text}` };
};
