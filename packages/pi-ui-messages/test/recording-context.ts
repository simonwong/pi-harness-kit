import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";

export interface ContextRecording {
  branch: unknown[];
  context: ExtensionContext;
  hiddenThinkingLabel: string | undefined;
  notifications: { message: string; type?: string }[];
  transcript: Container;
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
            | ((tui: {
                children: Container[];
                requestRender: (force?: boolean) => void;
              }) => unknown)
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
              children: [recording.transcript],
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
    transcript: new Container(),
    widgets: {},
  };
  return recording;
};
