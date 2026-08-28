import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import extension from "../src/index.ts";
import { createMessagesExtension } from "../src/messages-extension.ts";
import { createRecordingPi } from "./recording-pi.ts";

describe("pi-ui-messages extension entry", () => {
  it("loads through the package-local factory", () => {
    const recording = createRecordingPi();
    const factoryResult: ExtensionFactory = createMessagesExtension();

    expect(extension).toBeTypeOf("function");
    expect(factoryResult).toBeTypeOf("function");
    expect(() => factoryResult(recording.api)).not.toThrow();
    expect(recording.transformers).toHaveLength(1);
  });
});
