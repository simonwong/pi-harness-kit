import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface ContextRecording {
  branch: unknown[];
  context: ExtensionContext;
  hiddenThinkingLabel: string | undefined;
  notifications: { message: string; type?: string }[];
  widgets: Record<string, unknown>;
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
        setWidget(
          key: string,
          content:
            | ((tui: { requestRender: (force?: boolean) => void }) => unknown)
            | string[]
            | undefined
        ) {
          if (content === undefined) {
            delete recording.widgets[key];
            return;
          }
          recording.widgets[key] = content;
          if (typeof content === "function") {
            content({
              requestRender() {
                // Recording harness has no TUI frame loop.
              },
            });
          }
        },
      },
    } as unknown as ExtensionContext,
    hiddenThinkingLabel: undefined,
    notifications,
    widgets: {},
  };
  return recording;
};
