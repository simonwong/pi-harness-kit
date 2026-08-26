import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const surfaces = ["status", "messages", "input"] as const;
const motionLevels = ["full", "reduced", "off"];

interface ContractCase {
  expected: Record<
    (typeof surfaces)[number],
    {
      diagnosticCount: number;
      enabledCapabilities: string[];
      motion: string;
      native: boolean;
    }
  >;
  globalContents: string | null;
  id: string;
  projectContents: string | null;
  trusted: boolean;
}

const loadCases = async (): Promise<ContractCase[]> =>
  JSON.parse(
    await readFile(new URL("./cases.json", import.meta.url), "utf8")
  ) as ContractCase[];

describe("Pi UI configuration contract fixtures", () => {
  it("provide unique, complete semantic expectations for every Surface", async () => {
    const cases = await loadCases();
    const ids = cases.map((entry) => entry.id);

    expect(cases.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of cases) {
      expect(entry.id).not.toBe("");
      expect(typeof entry.trusted).toBe("boolean");
      expect(
        entry.globalContents === null ||
          typeof entry.globalContents === "string"
      ).toBe(true);
      expect(
        entry.projectContents === null ||
          typeof entry.projectContents === "string"
      ).toBe(true);
      expect(Object.keys(entry.expected).sort()).toEqual([...surfaces].sort());

      for (const surface of surfaces) {
        const expectation = entry.expected[surface];

        expect(typeof expectation.native).toBe("boolean");
        expect(motionLevels).toContain(expectation.motion);
        expect(expectation.diagnosticCount).toBeGreaterThanOrEqual(0);
        expect(new Set(expectation.enabledCapabilities).size).toBe(
          expectation.enabledCapabilities.length
        );
      }
    }
  });
});
