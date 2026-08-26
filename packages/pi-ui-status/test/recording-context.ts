import type {
  ExtensionContext,
  WorkingIndicatorOptions,
} from "@earendil-works/pi-coding-agent";

export interface WidgetWrite {
  content: string[] | undefined;
  key: string;
  placement?: string;
}

export interface ContextRecording {
  context: ExtensionContext;
  notifications: { message: string; type?: string }[];
  renderWidgetComponents: (width: number) => string[][];
  rerenderWidgets: () => void;
  setColorCode: (color: string, code: number) => void;
  widgets: WidgetWrite[];
  workingIndicators: (WorkingIndicatorOptions | undefined)[];
  workingMessages: (string | undefined)[];
  workingVisibility: boolean[];
}

interface RecordedWidgetComponent {
  invalidate: () => void;
  render: (width: number) => string[];
}

const defaultColorCodes: Record<string, number> = {
  accent: 32,
  dim: 90,
  error: 31,
  muted: 90,
  success: 32,
  warning: 33,
};

export const createRecordingContext = (
  mode: "tui" | "rpc" | "print" = "tui"
): ContextRecording => {
  const colorCodes = { ...defaultColorCodes };
  const notifications: ContextRecording["notifications"] = [];
  const widgets: WidgetWrite[] = [];
  const workingIndicators: ContextRecording["workingIndicators"] = [];
  const workingMessages: ContextRecording["workingMessages"] = [];
  const workingVisibility: boolean[] = [];
  const theme = {
    fg(color: string, text: string) {
      const code = colorCodes[color] ?? 37;
      return `\u001B[${code}m${text}\u001B[39m`;
    },
  };
  const widgetComponents = new Map<
    string,
    { component: RecordedWidgetComponent; placement?: string }
  >();

  const context = {
    cwd: "/project",
    isProjectTrusted: () => true,
    mode,
    ui: {
      notify(message: string, type?: string) {
        notifications.push({ message, type });
      },
      setWidget(
        key: string,
        content: unknown,
        options?: { placement?: string }
      ) {
        if (typeof content === "function") {
          const factory = content as (
            tui: unknown,
            activeTheme: typeof theme
          ) => RecordedWidgetComponent;
          const component = factory({}, theme);
          widgetComponents.set(key, {
            component,
            placement: options?.placement,
          });
          widgets.push({
            content: component.render(80),
            key,
            placement: options?.placement,
          });
          return;
        }
        widgetComponents.delete(key);
        widgets.push({
          content: Array.isArray(content) ? (content as string[]) : undefined,
          key,
          placement: options?.placement,
        });
      },
      setWorkingIndicator(options?: WorkingIndicatorOptions) {
        workingIndicators.push(options);
      },
      setWorkingMessage(message?: string) {
        workingMessages.push(message);
      },
      setWorkingVisible(visible: boolean) {
        workingVisibility.push(visible);
      },
      theme,
    },
  } as unknown as ExtensionContext;

  return {
    context,
    notifications,
    renderWidgetComponents(width) {
      return [...widgetComponents.values()].map(({ component }) =>
        component.render(width)
      );
    },
    rerenderWidgets() {
      for (const [key, { component, placement }] of widgetComponents) {
        component.invalidate();
        widgets.push({ content: component.render(80), key, placement });
      }
    },
    setColorCode(color, code) {
      colorCodes[color] = code;
    },
    widgets,
    workingIndicators,
    workingMessages,
    workingVisibility,
  };
};
