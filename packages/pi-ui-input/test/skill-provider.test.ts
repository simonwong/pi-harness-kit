import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { createSkillCatalog } from "../src/skill-catalog.ts";
import { createSkillAutocompleteProvider } from "../src/skill-provider.ts";
import { skillCommand } from "./recording-pi.ts";

const { skills } = createSkillCatalog([
  skillCommand("research"),
  skillCommand("code-review"),
]);

const createCurrent = (): AutocompleteProvider & {
  applied: AutocompleteItem[];
  calls: number;
} => {
  const state = {
    applied: [] as AutocompleteItem[],
    applyCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: AutocompleteItem
    ) {
      state.applied.push(item);
      return { cursorCol, cursorLine, lines };
    },
    calls: 0,
    async getSuggestions() {
      state.calls += 1;
      return { items: [{ label: "native", value: "native" }], prefix: "/" };
    },
  } satisfies AutocompleteProvider & {
    applied: AutocompleteItem[];
    calls: number;
  };
  return state;
};

const options = { signal: new AbortController().signal };

describe("createSkillAutocompleteProvider", () => {
  it("offers all skills for a bare inline slash", async () => {
    const provider = createSkillAutocompleteProvider({
      current: createCurrent(),
      getSkills: () => skills,
    });

    const result = await provider.getSuggestions(["hello /"], 0, 7, options);

    expect(result?.prefix).toBe("");
    expect(result?.items.map((item) => item.value)).toEqual([
      "skill:code-review",
      "skill:research",
    ]);
  });

  it("filters by the inline query and keeps a slash-free prefix", async () => {
    const provider = createSkillAutocompleteProvider({
      current: createCurrent(),
      getSkills: () => skills,
    });

    const result = await provider.getSuggestions(
      ["hello /rev"],
      0,
      10,
      options
    );

    expect(result?.prefix).toBe("rev");
    expect(result?.items.map((item) => item.value)).toEqual([
      "skill:code-review",
    ]);
  });

  it("triggers at the start of later lines", async () => {
    const provider = createSkillAutocompleteProvider({
      current: createCurrent(),
      getSkills: () => skills,
    });

    const result = await provider.getSuggestions(
      ["first line", "/res"],
      1,
      4,
      options
    );

    expect(result?.items.map((item) => item.value)).toEqual(["skill:research"]);
  });

  it("suppresses suggestions when no skill matches or none exist", async () => {
    const current = createCurrent();
    const provider = createSkillAutocompleteProvider({
      current,
      getSkills: () => skills,
    });

    expect(
      await provider.getSuggestions(["hello /zzz"], 0, 10, options)
    ).toBeNull();

    const empty = createSkillAutocompleteProvider({
      current,
      getSkills: () => [],
    });
    expect(await empty.getSuggestions(["hello /"], 0, 7, options)).toBeNull();
    expect(current.calls).toBe(0);
  });

  it("suppresses suggestions when the request was aborted", async () => {
    const current = createCurrent();
    const provider = createSkillAutocompleteProvider({
      current,
      getSkills: () => skills,
    });
    const controller = new AbortController();
    controller.abort();

    const result = await provider.getSuggestions(["hello /"], 0, 7, {
      signal: controller.signal,
    });

    expect(result).toBeNull();
    expect(current.calls).toBe(0);
  });

  it("delegates non-inline contexts to the previous provider exactly once", async () => {
    const current = createCurrent();
    const provider = createSkillAutocompleteProvider({
      current,
      getSkills: () => skills,
    });

    const result = await provider.getSuggestions(["/res"], 0, 4, options);

    expect(current.calls).toBe(1);
    expect(result?.items.map((item) => item.value)).toEqual(["native"]);
  });

  it("replaces only the query token and appends a trailing space", async () => {
    const provider = createSkillAutocompleteProvider({
      current: createCurrent(),
      getSkills: () => skills,
    });
    const suggestions = await provider.getSuggestions(
      ["hello /rev world"],
      0,
      10,
      options
    );
    const item = suggestions?.items[0];
    if (item === undefined || suggestions === null) {
      throw new Error("expected suggestions");
    }

    const result = provider.applyCompletion(
      ["hello /rev world"],
      0,
      10,
      item,
      suggestions.prefix
    );

    expect(result.lines).toEqual(["hello /skill:code-review world"]);
    expect(result.cursorCol).toBe("hello /skill:code-review".length);
  });

  it("does not double the trailing space before whitespace", async () => {
    const provider = createSkillAutocompleteProvider({
      current: createCurrent(),
      getSkills: () => skills,
    });
    const suggestions = await provider.getSuggestions(
      ["hello /rev"],
      0,
      10,
      options
    );

    const item = suggestions?.items[0];
    if (item === undefined || suggestions === null) {
      throw new Error("expected suggestions");
    }
    const result = provider.applyCompletion(
      ["hello /rev "],
      0,
      10,
      item,
      suggestions.prefix
    );

    expect(result.lines).toEqual(["hello /skill:code-review "]);
  });

  it("delegates applyCompletion for foreign items", async () => {
    const current = createCurrent();
    const provider = createSkillAutocompleteProvider({
      current,
      getSkills: () => skills,
    });
    const foreign: AutocompleteItem = { label: "x", value: "x" };

    provider.applyCompletion(["hello /rev"], 0, 10, foreign, "rev");

    expect(current.applied).toEqual([foreign]);
  });
});
