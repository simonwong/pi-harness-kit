import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveInputConfig } from "../src/config.ts";

interface ContractCase {
  expected: {
    input: {
      diagnosticCount: number;
      enabledCapabilities: string[];
      motion: string;
      native: boolean;
    };
  };
  globalContents: string | null;
  id: string;
  projectContents: string | null;
  trusted: boolean;
}

const loadContractCases = async (): Promise<ContractCase[]> =>
  JSON.parse(
    await readFile(
      new URL(
        "../../../tests/contracts/pi-ui-config-v1/cases.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as ContractCase[];

describe("Input configuration", () => {
  it("implements every canonical Pi UI v1 Input fixture", async () => {
    const cases = await loadContractCases();

    for (const fixture of cases) {
      const snapshot = resolveInputConfig({
        globalContents: fixture.globalContents,
        projectContents: fixture.projectContents,
        projectTrusted: fixture.trusted,
      });

      expect(snapshot.native, fixture.id).toBe(fixture.expected.input.native);
      expect(snapshot.motion, fixture.id).toBe(fixture.expected.input.motion);
      expect([...snapshot.enabledCapabilities].sort(), fixture.id).toEqual(
        [...fixture.expected.input.enabledCapabilities].sort()
      );
      expect(snapshot.diagnostics.length, fixture.id).toBe(
        fixture.expected.input.diagnosticCount
      );
    }
  });

  it("disables multiSkill through a trusted project layer", () => {
    const snapshot = resolveInputConfig({
      globalContents: null,
      projectContents: '{"version":1,"input":{"multiSkill":{"enabled":false}}}',
      projectTrusted: true,
    });

    expect(snapshot.native).toBe(false);
    expect(snapshot.enabledCapabilities).toEqual([]);
  });

  it("keeps multiSkill enabled when the project layer is untrusted", () => {
    const snapshot = resolveInputConfig({
      globalContents: null,
      projectContents: '{"version":1,"input":{"multiSkill":{"enabled":false}}}',
      projectTrusted: false,
    });

    expect(snapshot.enabledCapabilities).toEqual(["multiSkill"]);
  });
});
