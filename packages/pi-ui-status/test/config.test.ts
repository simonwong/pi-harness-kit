import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadStatusConfig, resolveStatusConfig } from "../src/config.ts";

interface ContractCase {
  expected: {
    status: {
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

describe("Status configuration", () => {
  it("implements every canonical Pi UI v1 Status fixture", async () => {
    const cases = await loadContractCases();

    for (const fixture of cases) {
      const snapshot = resolveStatusConfig({
        globalContents: fixture.globalContents,
        projectContents: fixture.projectContents,
        projectTrusted: fixture.trusted,
      });

      expect(
        {
          diagnosticCount: snapshot.diagnostics.length,
          enabledCapabilities: snapshot.enabledCapabilities,
          motion: snapshot.motion,
          native: snapshot.native,
        },
        fixture.id
      ).toEqual(fixture.expected.status);
    }
  });

  it("does not let a later layer re-enable an invalid Capability section", () => {
    const snapshot = resolveStatusConfig({
      globalContents: '{"version":1,"status":{"working":"invalid"}}',
      projectContents: '{"version":1,"status":{"working":{"enabled":true}}}',
      projectTrusted: true,
    });

    expect(snapshot).toMatchObject({
      diagnostics: [expect.stringContaining("status.working")],
      enabledCapabilities: ["statusCues"],
      native: false,
    });
  });

  it("reads trusted project configuration and never reads an untrusted project", async () => {
    const reads: string[] = [];
    const contents = new Map([
      ["/global/pi-ui.json", '{"version":1,"motion":"reduced"}'],
      [
        "/project/.pi/pi-ui.json",
        '{"version":1,"status":{"working":{"enabled":false}}}',
      ],
    ]);
    const readConfig = async (filePath: string): Promise<string | null> => {
      reads.push(filePath);
      return contents.get(filePath) ?? null;
    };

    const trusted = await loadStatusConfig({
      globalPath: "/global/pi-ui.json",
      projectPath: "/project/.pi/pi-ui.json",
      projectTrusted: true,
      readConfig,
    });
    expect(trusted).toMatchObject({
      enabledCapabilities: ["statusCues"],
      motion: "reduced",
      native: false,
    });
    expect(reads).toEqual(["/global/pi-ui.json", "/project/.pi/pi-ui.json"]);

    reads.length = 0;
    await loadStatusConfig({
      globalPath: "/global/pi-ui.json",
      projectPath: "/project/.pi/pi-ui.json",
      projectTrusted: false,
      readConfig,
    });
    expect(reads).toEqual(["/global/pi-ui.json"]);
  });
});
