import { describe, expect, it } from "vitest";
import {
  maybeTriggerInlineSlash,
  resolveInlineSlashTrigger,
} from "../src/inline-skill-editor.ts";

const createEditor = (
  lines: string[],
  cursor: { col: number; line: number },
  showing = false
) => ({
  getCursor: () => cursor,
  getLines: () => lines,
  isShowingAutocomplete: () => showing,
});

describe("resolveInlineSlashTrigger", () => {
  it("binds the internal hook when present", () => {
    let calls = 0;
    const editor: ReturnType<typeof createEditor> & {
      tryTriggerAutocomplete: () => void;
    } = {
      ...createEditor([""], { col: 0, line: 0 }),
      tryTriggerAutocomplete() {
        calls += 1;
      },
    };

    const trigger = resolveInlineSlashTrigger(editor);
    trigger?.();

    expect(calls).toBe(1);
  });

  it("returns undefined when the hook is missing or not callable", () => {
    expect(
      resolveInlineSlashTrigger(createEditor([""], { col: 0, line: 0 }))
    ).toBeUndefined();
    const broken: ReturnType<typeof createEditor> & {
      tryTriggerAutocomplete: string;
    } = {
      ...createEditor([""], { col: 0, line: 0 }),
      tryTriggerAutocomplete: "nope",
    };
    expect(resolveInlineSlashTrigger(broken)).toBeUndefined();
  });
});

describe("maybeTriggerInlineSlash", () => {
  it("triggers when a slash lands after whitespace mid-line", () => {
    let calls = 0;
    const editor = createEditor(["hello /"], { col: 7, line: 0 });

    maybeTriggerInlineSlash(editor, "/", () => {
      calls += 1;
    });

    expect(calls).toBe(1);
  });

  it("triggers while typing the query when the popup closed", () => {
    let calls = 0;
    const editor = createEditor(["hello /rev"], { col: 10, line: 0 });

    maybeTriggerInlineSlash(editor, "v", () => {
      calls += 1;
    });

    expect(calls).toBe(1);
  });

  it("triggers at the start of later lines but not the first-line command area", () => {
    let calls = 0;
    const trigger = () => {
      calls += 1;
    };

    maybeTriggerInlineSlash(
      createEditor(["first", "/rev"], { col: 4, line: 1 }),
      "v",
      trigger
    );
    expect(calls).toBe(1);

    maybeTriggerInlineSlash(
      createEditor(["/rev"], { col: 4, line: 0 }),
      "v",
      trigger
    );
    expect(calls).toBe(1);
  });

  it("stays silent without a hook, on paths, during IME commits, and while visible", () => {
    let calls = 0;
    const trigger = () => {
      calls += 1;
    };

    maybeTriggerInlineSlash(
      createEditor(["hello /"], { col: 6, line: 0 }),
      "/",
      undefined
    );
    maybeTriggerInlineSlash(
      createEditor(["hello /home/"], { col: 12, line: 0 }),
      "/",
      trigger
    );
    maybeTriggerInlineSlash(
      createEditor(["hello /"], { col: 6, line: 0 }),
      "你",
      trigger
    );
    maybeTriggerInlineSlash(
      createEditor(["hello /"], { col: 6, line: 0 }, true),
      "/",
      trigger
    );

    expect(calls).toBe(0);
  });
});
