import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import type { InputEditorFactory } from "../src/input-extension.ts";

export interface ContextRecording {
  autocompleteProviders: AutocompleteProvider[];
  context: ExtensionContext;
  editorFactory: InputEditorFactory | undefined;
  notifications: { message: string; type?: string }[];
}

export const createRecordingContext = (
  mode: "tui" | "rpc" | "print" = "tui"
): ContextRecording => {
  const notifications: ContextRecording["notifications"] = [];
  const autocompleteProviders: AutocompleteProvider[] = [];
  const recording: ContextRecording = {
    autocompleteProviders,
    context: {
      cwd: "/project",
      isProjectTrusted: () => true,
      mode,
      ui: {
        addAutocompleteProvider(
          wrap: (current: AutocompleteProvider) => AutocompleteProvider
        ) {
          autocompleteProviders.push(wrap(baseProvider));
        },
        getEditorComponent() {
          return recording.editorFactory;
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
        setEditorComponent(factory: InputEditorFactory | undefined) {
          recording.editorFactory = factory;
        },
      },
    } as unknown as ExtensionContext,
    editorFactory: undefined,
    notifications,
  };
  return recording;
};

const baseProvider: AutocompleteProvider = {
  applyCompletion(lines, cursorLine, cursorCol) {
    return { cursorCol, cursorLine, lines };
  },
  async getSuggestions() {
    return null;
  },
};
