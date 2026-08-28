import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import extension from "../src/index.ts";
import { createInputExtension } from "../src/input-extension.ts";
import { createRecordingPi } from "./recording-pi.ts";

describe("pi-ui-input extension entry", () => {
  it("loads through the package-local factory", () => {
    const recording = createRecordingPi();
    const factoryResult: ExtensionFactory = createInputExtension();

    expect(extension).toBeTypeOf("function");
    expect(factoryResult).toBeTypeOf("function");
    expect(() => factoryResult(recording.api)).not.toThrow();
  });

  it("records documented pi event registrations for future behavior tests", () => {
    const recording = createRecordingPi();
    const fixture: ExtensionFactory = (pi) => {
      pi.on("session_start", () => undefined);
    };

    fixture(recording.api);

    expect(recording.eventNames()).toEqual(["session_start"]);
  });
});
