import type { SkillEntry } from "./skill-catalog.ts";

/**
 * Fuzzy scoring for skill candidates. Exact match beats prefix, prefix beats
 * substring, substring beats subsequence; ties fall back to shorter names and
 * then alphabetical order. Ported from herbertgao/pi-inline-skills.
 */
export const fuzzyScore = (value: string, query: string): number => {
  const target = value.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) {
    return 1;
  }
  if (target === needle) {
    return 1000;
  }
  if (target.startsWith(needle)) {
    return 800 - target.length;
  }
  if (target.includes(needle)) {
    return 600 - target.indexOf(needle) - target.length;
  }

  let score = 0;
  let lastIndex = -1;
  for (const character of needle) {
    const index = target.indexOf(character, lastIndex + 1);
    if (index === -1) {
      return 0;
    }
    score += index === lastIndex + 1 ? 20 : 5;
    lastIndex = index;
  }
  return score - target.length;
};

export const filterSkills = (
  skills: SkillEntry[],
  query: string
): SkillEntry[] =>
  skills
    .map((skill) => ({ score: fuzzyScore(skill.name, query), skill }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name)
    )
    .map((entry) => entry.skill);
