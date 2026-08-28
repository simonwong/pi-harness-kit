import { describe, expect, it } from "vitest";
import { createSkillCatalog } from "../src/skill-catalog.ts";
import { filterSkills, fuzzyScore } from "../src/skill-filter.ts";
import { extensionCommand, skillCommand } from "./recording-pi.ts";

describe("createSkillCatalog", () => {
  it("collects skills with paths and base directories from sourceInfo", () => {
    const catalog = createSkillCatalog([
      skillCommand("research"),
      extensionCommand("deploy"),
    ]);

    expect(catalog.skills).toEqual([
      {
        baseDir: "/skills/research",
        description: "research description",
        name: "research",
        path: "/skills/research/SKILL.md",
      },
    ]);
  });

  it("resolves skill: prefixed and bare tokens case-insensitively", () => {
    const catalog = createSkillCatalog([skillCommand("code-review")]);

    expect(catalog.resolve("skill:code-review")?.name).toBe("code-review");
    expect(catalog.resolve("Code-Review")?.name).toBe("code-review");
    expect(catalog.resolve("SKILL:CODE-REVIEW")?.name).toBe("code-review");
  });

  it("refuses bare tokens that collide with a non-skill command", () => {
    const catalog = createSkillCatalog([
      skillCommand("deploy"),
      extensionCommand("deploy"),
    ]);

    expect(catalog.resolve("deploy")).toBeUndefined();
    expect(catalog.resolve("skill:deploy")?.name).toBe("deploy");
  });

  it("refuses unknown tokens", () => {
    const catalog = createSkillCatalog([skillCommand("research")]);

    expect(catalog.resolve("unknown")).toBeUndefined();
    expect(catalog.resolve("skill:unknown")).toBeUndefined();
  });
});

describe("fuzzyScore and filterSkills", () => {
  const { skills } = createSkillCatalog([
    skillCommand("research"),
    skillCommand("code-review"),
    skillCommand("review"),
  ]);

  it("ranks exact, prefix, substring, then subsequence matches", () => {
    expect(fuzzyScore("review", "review")).toBeGreaterThan(
      fuzzyScore("code-review", "review")
    );
    expect(fuzzyScore("review", "rev")).toBeGreaterThan(
      fuzzyScore("code-review", "rev")
    );
    expect(fuzzyScore("code-review", "rev")).toBeGreaterThan(
      fuzzyScore("research", "rr")
    );
    expect(fuzzyScore("research", "xyz")).toBe(0);
  });

  it("filters and orders by score then name", () => {
    expect(filterSkills(skills, "rev").map((skill) => skill.name)).toEqual([
      "review",
      "code-review",
    ]);
  });

  it("returns everything for an empty query", () => {
    expect(filterSkills(skills, "")).toHaveLength(3);
  });
});
