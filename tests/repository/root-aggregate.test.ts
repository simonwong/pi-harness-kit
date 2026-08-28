import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readJson = async (url: URL): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(url, "utf8")) as Record<string, unknown>;

describe("Pi UI development aggregate", () => {
  it("loads every v1 Surface exactly once through the repository root", async () => {
    const rootManifest = await readJson(
      new URL("../../package.json", import.meta.url)
    );
    const localSettings = await readJson(
      new URL("../../.pi/settings.json", import.meta.url)
    );

    expect(rootManifest.pi).toMatchObject({
      extensions: [
        "./packages/pi-ui-status/src/index.ts",
        "./packages/pi-ui-input/src/index.ts",
      ],
    });
    expect(localSettings).toEqual({ packages: [".."] });
  });

  it.each(["pi-ui-status", "pi-ui-input"])(
    "keeps %s private and independently loadable",
    async (surface) => {
      const manifest = await readJson(
        new URL(`../../packages/${surface}/package.json`, import.meta.url)
      );

      expect(manifest).toMatchObject({
        name: surface,
        pi: { extensions: ["./src/index.ts"] },
        private: true,
        version: "0.0.0",
      });
    }
  );
});
