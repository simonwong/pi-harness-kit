export type WorkingOutcome =
  | { kind: "done" }
  | { kind: "cancelled" }
  | { kind: "error"; message?: string }
  | { kind: "unknown" };

export type WorkingPhase = "inactive" | "active" | "pending" | "settled";

export interface WorkingState {
  activeOutput: number;
  completedOutput: number;
  outcome?: WorkingOutcome;
  outputReported: boolean;
  phase: WorkingPhase;
  startedAt?: number;
}

export type WorkingEvent =
  | { now: number; type: "started" }
  | { output: number; type: "assistantUpdated" }
  | { output: number; type: "assistantEnded" }
  | { outcome: WorkingOutcome; type: "runEnded" }
  | { type: "settled" }
  | { type: "shutdown" };

export interface OutcomeMessage {
  errorMessage?: unknown;
  role: string;
  stopReason?: unknown;
}

export const createWorkingState = (): WorkingState => ({
  activeOutput: 0,
  completedOutput: 0,
  outputReported: false,
  phase: "inactive",
});

const normalizeOutput = (output: number): number => {
  if (!Number.isFinite(output) || output < 0) {
    return 0;
  }
  return Math.floor(output);
};

export const updateWorkingState = (
  state: WorkingState,
  event: WorkingEvent
): WorkingState => {
  switch (event.type) {
    case "started":
      if (state.phase === "inactive" || state.phase === "settled") {
        return {
          ...createWorkingState(),
          phase: "active",
          startedAt: event.now,
        };
      }
      return {
        ...state,
        outcome: undefined,
        phase: "active",
      };
    case "assistantUpdated": {
      if (state.phase !== "active") {
        return state;
      }
      const activeOutput = normalizeOutput(event.output);
      return {
        ...state,
        activeOutput,
        outputReported: state.outputReported || activeOutput > 0,
      };
    }
    case "assistantEnded": {
      if (state.phase !== "active") {
        return state;
      }
      const finalOutput = normalizeOutput(event.output);
      const completedOutput = finalOutput || state.activeOutput;
      return {
        ...state,
        activeOutput: 0,
        completedOutput: state.completedOutput + completedOutput,
        outputReported: state.outputReported || completedOutput > 0,
      };
    }
    case "runEnded":
      if (state.phase === "inactive" || state.phase === "settled") {
        return state;
      }
      return {
        ...state,
        activeOutput: 0,
        outcome: event.outcome,
        phase: "pending",
      };
    case "settled":
      if (state.phase === "inactive") {
        return state;
      }
      return {
        ...state,
        activeOutput: 0,
        outcome: state.outcome ?? { kind: "unknown" },
        phase: "settled",
      };
    case "shutdown":
      return createWorkingState();
    default:
      return state;
  }
};

export const classifyRunOutcome = (
  messages: readonly OutcomeMessage[]
): WorkingOutcome => {
  let assistant: OutcomeMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      assistant = messages[index];
      break;
    }
  }
  if (!assistant) {
    return { kind: "unknown" };
  }
  if (assistant.stopReason === "aborted") {
    return { kind: "cancelled" };
  }
  if (assistant.stopReason === "error") {
    const message =
      typeof assistant.errorMessage === "string"
        ? assistant.errorMessage.trim()
        : undefined;
    return message ? { kind: "error", message } : { kind: "error" };
  }
  return assistant.stopReason === "stop"
    ? { kind: "done" }
    : { kind: "unknown" };
};
