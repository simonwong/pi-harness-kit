import path from "node:path";
import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";

export interface SkillEntry {
  baseDir: string;
  description?: string;
  /** Skill name without the `skill:` command prefix. */
  name: string;
  /** Absolute path of the SKILL.md file. */
  path: string;
}

export type SkillResolver = (tokenName: string) => SkillEntry | undefined;

export interface SkillCatalog {
  resolve: SkillResolver;
  skills: SkillEntry[];
}

const SKILL_COMMAND_PREFIX = "skill:";

/**
 * Build the skill catalog from pi's public command list. Skill commands are
 * named `skill:<name>` and carry the SKILL.md path and base directory in
 * `sourceInfo`, which is enough to reproduce native skill expansion blocks
 * without re-walking the filesystem.
 */
export const createSkillCatalog = (
  commands: SlashCommandInfo[]
): SkillCatalog => {
  const skills: SkillEntry[] = [];
  const byName = new Map<string, SkillEntry>();
  const nonSkillNames = new Set<string>();

  for (const command of commands) {
    if (
      command.source === "skill" &&
      command.name.startsWith(SKILL_COMMAND_PREFIX)
    ) {
      const name = command.name.slice(SKILL_COMMAND_PREFIX.length);
      const entry: SkillEntry = {
        // Match native expansion, which uses dirname(filePath); the
        // sourceInfo.baseDir field follows package roots instead.
        baseDir: path.dirname(command.sourceInfo.path),
        name,
        path: command.sourceInfo.path,
      };
      if (command.description !== undefined) {
        entry.description = command.description;
      }
      if (!byName.has(name.toLowerCase())) {
        byName.set(name.toLowerCase(), entry);
        skills.push(entry);
      }
      continue;
    }
    if (command.source !== "skill") {
      nonSkillNames.add(command.name.toLowerCase());
    }
  }

  const resolve: SkillResolver = (tokenName) => {
    const lower = tokenName.toLowerCase();
    if (lower.startsWith(SKILL_COMMAND_PREFIX)) {
      return byName.get(lower.slice(SKILL_COMMAND_PREFIX.length));
    }
    // A bare token only resolves when no non-skill command could mean it.
    if (nonSkillNames.has(lower)) {
      return;
    }
    return byName.get(lower);
  };

  return { resolve, skills };
};
