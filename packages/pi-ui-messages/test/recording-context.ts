import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface ContextRecording {
  branch: unknown[];
  context: ExtensionContext;
  hiddenThinkingLabel: string | undefined;
  notifications: { message: string; type?: string }[];
}

export const createRecordingContext = (
  mode: "tui" | "rpc" | "print" = "tui"
): ContextRecording => {
  const notifications: ContextRecording["notifications"] = [];
  const recording: ContextRecording = {
    branch: [],
    context: {
      cwd: "/project",
      isProjectTrusted: () => true,
      mode,
      sessionManager: {
        getBranch() {
          return recording.branch;
        },
      },
      ui: {
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
        setHiddenThinkingLabel(label?: string) {
          recording.hiddenThinkingLabel = label;
        },
      },
    } as unknown as ExtensionContext,
    hiddenThinkingLabel: undefined,
    notifications,
  };
  return recording;
};
