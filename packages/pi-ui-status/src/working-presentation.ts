import { stripVTControlCharacters } from "node:util";
import type { MotionPreference } from "./config.ts";
import type { WorkingOutcome, WorkingState } from "./working-model.ts";

export type WorkingTone = "accent" | "warning" | "error";

type WorkingColor = WorkingTone | "dim" | "muted" | "success";

export interface WorkingTheme {
  fg: (color: WorkingColor, text: string) => string;
}

export interface IndicatorPresentation {
  frames: string[];
  intervalMs?: number;
}

export type PresentableOutcome = Exclude<WorkingOutcome, { kind: "unknown" }>;

export interface OutcomePresentation {
  text: string;
  tone: "error" | "muted" | "success" | "warning";
}

export const ACTIVITY_WORDS = [
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
] as const;

export type ActivityWord = (typeof ACTIVITY_WORDS)[number];

export const ACTIVITY_INTERVAL_MS = 10_000;

const numberFormatter = new Intl.NumberFormat("en-US");

export const toneForElapsed = (seconds: number): WorkingTone => {
  if (seconds >= 180) {
    return "error";
  }
  if (seconds >= 60) {
    return "warning";
  }
  return "accent";
};

export const createStaticIndicatorPresentation = (
  motion: Exclude<MotionPreference, "full">,
  tone: WorkingTone,
  theme: WorkingTheme
): IndicatorPresentation => ({
  frames: [motion === "reduced" ? theme.fg(tone, "●") : theme.fg("dim", "·")],
});

const elapsedSeconds = (state: WorkingState, now: number): number =>
  Math.max(0, Math.floor((now - (state.startedAt ?? now)) / 1000));

export const formatDuration = (seconds: number): string => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  const parts = hours > 0 ? [`${hours}h`, `${minutes}m`] : [];
  if (hours === 0 && minutes > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${remainder}s`);
  return parts.join(" ");
};

export const selectActivityWord = (
  random: () => number,
  previous?: ActivityWord
): ActivityWord => {
  const previousIndex = previous ? ACTIVITY_WORDS.indexOf(previous) : -1;
  const candidateCount = ACTIVITY_WORDS.length - (previousIndex >= 0 ? 1 : 0);
  const sample = random();
  const normalized = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
    : 0;
  const candidate = Math.floor(normalized * candidateCount);
  const index =
    previousIndex >= 0 && candidate >= previousIndex
      ? candidate + 1
      : candidate;
  return ACTIVITY_WORDS[index] ?? ACTIVITY_WORDS[0];
};

export const formatWorkingMessage = (
  state: WorkingState,
  now: number,
  motion: MotionPreference,
  theme: WorkingTheme,
  activityWord: ActivityWord = ACTIVITY_WORDS[0]
): string => {
  const seconds = elapsedSeconds(state, now);
  const tone = toneForElapsed(seconds);
  const output = state.completedOutput + state.activeOutput;
  const outputText = state.outputReported
    ? `↓ ${numberFormatter.format(output)} `
    : "";

  return [
    theme.fg(tone, motion === "off" ? "Working" : activityWord),
    theme.fg("muted", " ("),
    theme.fg("muted", outputText),
    theme.fg(tone, formatDuration(seconds)),
    theme.fg("muted", ")"),
  ].join("");
};

const safeErrorMessage = (message: string | undefined): string => {
  if (!message) {
    return "Unknown error";
  }
  const normalized = stripVTControlCharacters(message)
    .replaceAll(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Unknown error";
  }
  return normalized;
};

export const createOutcomePresentation = (
  outcome: PresentableOutcome,
  seconds: number
): OutcomePresentation => {
  const duration = formatDuration(seconds);
  switch (outcome.kind) {
    case "done":
      return { text: `Worked for ${duration}`, tone: "muted" };
    case "cancelled":
      return { text: `Cancelled after ${duration}`, tone: "warning" };
    case "error":
      return {
        text: `! Error after ${duration}: ${safeErrorMessage(outcome.message)}`,
        tone: "error",
      };
    default:
      throw new Error("Unsupported Working outcome");
  }
};

export const formatOutcome = (
  outcome: PresentableOutcome,
  seconds: number,
  theme: WorkingTheme
): string => {
  const presentation = createOutcomePresentation(outcome, seconds);
  return theme.fg(presentation.tone, presentation.text);
};
