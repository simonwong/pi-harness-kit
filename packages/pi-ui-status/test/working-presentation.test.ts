import { stripVTControlCharacters } from "node:util";
import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { WorkingState } from "../src/working-model.ts";
import {
  ACTIVITY_INTERVAL_MS,
  ACTIVITY_WORDS,
  createStaticIndicatorPresentation,
  formatDuration,
  formatOutcome,
  formatWorkingMessage,
  selectActivityWord,
  toneForElapsed,
} from "../src/working-presentation.ts";

const colorCodes = {
  accent: 32,
  dim: 90,
  error: 31,
  muted: 90,
  success: 32,
  warning: 33,
} as const;

const theme = {
  fg(color: keyof typeof colorCodes, text: string) {
    return `\u001B[${colorCodes[color]}m${text}\u001B[39m`;
  },
};

const activeState = (overrides: Partial<WorkingState> = {}): WorkingState => ({
  activeOutput: 0,
  completedOutput: 0,
  outputReported: false,
  phase: "active",
  startedAt: 0,
  ...overrides,
});

describe("Working presentation", () => {
  it("uses only the selected whimsical Claude Code spinner verbs", () => {
    expect(ACTIVITY_WORDS).toEqual([
      "Vibing",
      "Honking",
      "Cooking",
      "Concocting",
      "Moseying",
      "Finagling",
      "Lollygagging",
      "Noodling",
      "Booping",
      "Brewing",
      "Canoodling",
      "Caramelizing",
      "Doodling",
      "Fermenting",
      "Frolicking",
      "Gallivanting",
      "Jitterbugging",
      "Marinating",
      "Moonwalking",
      "Percolating",
      "Puttering",
      "Razzmatazzing",
      "Recombobulating",
      "Scampering",
      "Shimmying",
      "Simmering",
      "Skedaddling",
      "Smooshing",
    ]);
    expect(ACTIVITY_WORDS).not.toEqual(
      expect.arrayContaining([
        "Analyzing",
        "Checking",
        "Processing",
        "Thinking",
        "Working",
      ])
    );
  });

  it("wraps ANSI and CJK safely at required widths", () => {
    const message = formatWorkingMessage(
      activeState({
        activeOutput: 9999,
        completedOutput: 999_999,
        outputReported: true,
      }),
      179_000,
      "full",
      theme
    );
    const workingLine = message;
    const errorLine = formatOutcome(
      { kind: "error", message: "连接失败，请检查 provider 配置" },
      299,
      theme
    );

    for (const width of [20, 40, 80]) {
      for (const input of [workingLine, errorLine]) {
        const lines = wrapTextWithAnsi(input, width);
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it("uses one truthful static frame for reduced and off motion", () => {
    const reduced = createStaticIndicatorPresentation(
      "reduced",
      "accent",
      theme
    );
    const off = createStaticIndicatorPresentation("off", "accent", theme);

    expect(reduced.intervalMs).toBeUndefined();
    expect(reduced.frames).toHaveLength(1);
    expect(stripVTControlCharacters(reduced.frames[0] ?? "")).toBe("●");
    expect(off.intervalMs).toBeUndefined();
    expect(off.frames).toHaveLength(1);
    expect(stripVTControlCharacters(off.frames[0] ?? "")).toBe("·");
  });

  it("selects random words without an immediate repeat", () => {
    expect(ACTIVITY_INTERVAL_MS).toBe(10_000);
    expect(selectActivityWord(() => 0)).toBe("Vibing");
    expect(selectActivityWord(() => 1)).toBe("Smooshing");
    expect(selectActivityWord(() => Number.NaN)).toBe("Vibing");
    expect(selectActivityWord(() => 0, "Vibing")).toBe("Honking");
    expect(selectActivityWord(() => 1, "Smooshing")).toBe("Skedaddling");
  });

  it("renders the selected word while off motion stays stable", () => {
    expect(
      stripVTControlCharacters(
        formatWorkingMessage(
          activeState(),
          20_000,
          "full",
          theme,
          "Moonwalking"
        )
      )
    ).toBe("Moonwalking (20s)");
    expect(
      stripVTControlCharacters(
        formatWorkingMessage(activeState(), 20_000, "off", theme, "Moonwalking")
      )
    ).toBe("Working (20s)");
  });

  it("formats reported output and omits output that has not been reported", () => {
    expect(
      stripVTControlCharacters(
        formatWorkingMessage(activeState(), 20_000, "full", theme)
      )
    ).toBe("Vibing (20s)");
    expect(
      stripVTControlCharacters(
        formatWorkingMessage(
          activeState({
            activeOutput: 159,
            completedOutput: 1125,
            outputReported: true,
          }),
          20_000,
          "full",
          theme
        )
      )
    ).toBe("Vibing (↓ 1,284 20s)");
  });

  it("formats elapsed time as compact English duration parts", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(299)).toBe("4m 59s");
    expect(formatDuration(3899)).toBe("1h 4m 59s");
  });

  it("escalates elapsed tone at one and three minutes", () => {
    expect(toneForElapsed(59)).toBe("accent");
    expect(toneForElapsed(60)).toBe("warning");
    expect(toneForElapsed(179)).toBe("warning");
    expect(toneForElapsed(180)).toBe("error");
  });

  it("rebuilds semantic ANSI for a different theme without changing visible copy", () => {
    const alternateTheme = {
      fg(color: keyof typeof colorCodes, text: string) {
        const code = color === "dim" || color === "muted" ? 37 : 36;
        return `\u001B[${code}m${text}\u001B[39m`;
      },
    };
    const first = formatWorkingMessage(activeState(), 70_000, "full", theme);
    const second = formatWorkingMessage(
      activeState(),
      70_000,
      "full",
      alternateTheme
    );

    expect(first).not.toBe(second);
    expect(stripVTControlCharacters(first)).toBe(
      stripVTControlCharacters(second)
    );
    expect(
      createStaticIndicatorPresentation("reduced", "warning", theme).frames[0]
    ).not.toBe(
      createStaticIndicatorPresentation("reduced", "warning", alternateTheme)
        .frames[0]
    );
  });

  it("renders duration-bearing English outcomes and safe error information", () => {
    const done = formatOutcome({ kind: "done" }, 299, theme);
    expect(done).toContain("\u001B[90m");
    expect(stripVTControlCharacters(done)).toBe("Worked for 4m 59s");
    expect(
      stripVTControlCharacters(formatOutcome({ kind: "cancelled" }, 18, theme))
    ).toBe("Cancelled after 18s");
    expect(
      stripVTControlCharacters(
        formatOutcome(
          {
            kind: "error",
            message: "\u001B[31mprovider\u001B[0m\n request   failed",
          },
          12,
          theme
        )
      )
    ).toBe("! Error after 12s: provider request failed");
    expect(
      stripVTControlCharacters(formatOutcome({ kind: "error" }, 12, theme))
    ).toBe("! Error after 12s: Unknown error");

    const longError = stripVTControlCharacters(
      formatOutcome({ kind: "error", message: "x".repeat(200) }, 12, theme)
    );
    expect(longError).toBe(`! Error after 12s: ${"x".repeat(200)}`);
  });
});
