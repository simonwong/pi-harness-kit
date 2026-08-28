import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveMessagesConfig } from "../src/config.ts";

interface ContractCase {
  expected: {
    messages: {
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

describe("Messages configuration", () => {
  it("implements every canonical Pi UI v1 Messages fixture", async () => {
    const cases = await loadContractCases();

    for (const fixture of cases) {
      const snapshot = resolveMessagesConfig({
        globalContents: fixture.globalContents,
        projectContents: fixture.projectContents,
        projectTrusted: fixture.trusted,
      });

      expect(snapshot.native, fixture.id).toBe(
        fixture.expected.messages.native
      );
      expect(snapshot.motion, fixture.id).toBe(
        fixture.expected.messages.motion
      );
      expect([...snapshot.enabledCapabilities].sort(), fixture.id).toEqual(
        [...fixture.expected.messages.enabledCapabilities].sort()
      );
      expect(snapshot.diagnostics.length, fixture.id).toBe(
        fixture.expected.messages.diagnosticCount
      );
    }
  });

  it("disables compactThinking through a trusted project layer", () => {
    const snapshot = resolveMessagesConfig({
      globalContents: null,
      projectContents:
        '{"version":1,"messages":{"compactThinking":{"enabled":false}}}',
      projectTrusted: true,
    });

    expect(snapshot.native).toBe(false);
    expect(snapshot.enabledCapabilities).toEqual(["markdown", "toolCards"]);
    expect(snapshot.shortcut).toBe("alt+t");
  });

  it("reads a custom shortcut from the trusted project layer", () => {
    const snapshot = resolveMessagesConfig({
      globalContents: null,
      projectContents:
        '{"version":1,"messages":{"compactThinking":{"shortcut":"alt+o"}}}',
      projectTrusted: true,
    });

    expect(snapshot.shortcut).toBe("alt+o");
    expect(snapshot.enabledCapabilities).toContain("compactThinking");
  });
});
