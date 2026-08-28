import { describe, expect, it } from "vitest";
import { createSkillCatalog } from "../src/skill-catalog.ts";
import { buildSkillBlock, expandInlineSkills } from "../src/skill-expansion.ts";
import { extensionCommand, skillCommand } from "./recording-pi.ts";

const commands = [
  skillCommand("research"),
  skillCommand("code-review"),
  extensionCommand("deploy"),
];
const catalog = createSkillCatalog(commands);

const bodies: Record<string, string> = {
  "code-review": "Review the code carefully.\n",
  research: "---\nname: research\n---\n\nResearch the topic.\n",
};

const readSkill = (skill: { name: string }): string => {
  const body = bodies[skill.name];
  if (body === undefined) {
    throw new Error(`missing ${skill.name}`);
  }
  return body;
};

describe("buildSkillBlock", () => {
  it("matches the native expansion format byte for byte", () => {
    const skill = catalog.resolve("research");
    if (skill === undefined) {
      throw new Error("expected research skill");
    }
    expect(buildSkillBlock(skill, bodies.research)).toBe(
      '<skill name="research" location="/skills/research/SKILL.md">\nReferences are relative to /skills/research.\n\nResearch the topic.\n</skill>'
    );
  });
});

describe("expandInlineSkills", () => {
  it("returns undefined without tokens", async () => {
    expect(
      await expandInlineSkills("hello world", catalog.resolve, readSkill)
    ).toBeUndefined();
  });

  it("delegates a single leading token to the native path", async () => {
    expect(
      await expandInlineSkills(
        "/skill:research do it",
        catalog.resolve,
        readSkill
      )
    ).toBeUndefined();
  });

  it("expands a mid-text token into a native block plus the original text", async () => {
    const result = await expandInlineSkills(
      "用 /research 调研这个 bug",
      catalog.resolve,
      readSkill
    );

    expect(result?.expanded).toEqual(["research"]);
    expect(result?.failed).toEqual([]);
    expect(result?.text).toBe(
      '<skill name="research" location="/skills/research/SKILL.md">\nReferences are relative to /skills/research.\n\nResearch the topic.\n</skill>\n\n用 /research 调研这个 bug'
    );
  });

  it("expands multiple tokens once each in first-mention order", async () => {
    const result = await expandInlineSkills(
      "用 /research 调研，再 /code-review 审查，重复 /research",
      catalog.resolve,
      readSkill
    );
    if (result === undefined) {
      throw new Error("expected expansion");
    }

    expect(result.expanded).toEqual(["research", "code-review"]);
    expect(result.text.match(/<skill name=/g)).toHaveLength(2);
    expect(
      result.text.endsWith(
        "用 /research 调研，再 /code-review 审查，重复 /research"
      )
    ).toBe(true);
  });

  it("expands a leading skill together with later inline tokens", async () => {
    const result = await expandInlineSkills(
      "/skill:research 调查 /code-review",
      catalog.resolve,
      readSkill
    );

    expect(result?.expanded).toEqual(["research", "code-review"]);
  });

  it("ignores unknown and command-colliding tokens", async () => {
    expect(
      await expandInlineSkills(
        "看 /unknown 和 /deploy",
        catalog.resolve,
        readSkill
      )
    ).toBeUndefined();
  });

  it("keeps failed skills literal and expands the rest", async () => {
    const broken = createSkillCatalog([
      skillCommand("research"),
      skillCommand("missing"),
    ]);
    const result = await expandInlineSkills(
      "用 /research 和 /missing",
      broken.resolve,
      readSkill
    );

    expect(result?.expanded).toEqual(["research"]);
    expect(result?.failed).toEqual(["missing"]);
  });

  it("does not expand a path prefix that collides with a skill name", async () => {
    const withHome = createSkillCatalog([skillCommand("home")]);
    expect(
      await expandInlineSkills("cat /home/user", withHome.resolve, readSkill)
    ).toBeUndefined();
  });

  it("returns undefined when every resolved skill fails to load", async () => {
    const broken = createSkillCatalog([skillCommand("missing")]);
    expect(
      await expandInlineSkills("用 /missing", broken.resolve, readSkill)
    ).toBeUndefined();
  });
});
