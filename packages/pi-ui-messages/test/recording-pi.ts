import type {
  ExtensionAPI,
  ExtensionContext,
  MarkdownTransformer,
  ToolDefinition,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";

type RecordedHandler = (
  event: unknown,
  context: ExtensionContext
) => Promise<unknown> | unknown;

export interface RecordedShortcut {
  handler: (ctx: ExtensionContext) => Promise<void> | void;
  shortcut: string;
}

export interface RecordedCommand {
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  name: string;
}

export interface RecordingPi {
  allTools: ToolInfo[];
  api: ExtensionAPI;
  commands: RecordedCommand[];
  emit: (
    eventName: string,
    event: unknown,
    context: ExtensionContext
  ) => Promise<unknown[]>;
  entries: { customType: string; data: unknown }[];
  eventNames: () => string[];
  shortcuts: RecordedShortcut[];
  tools: ToolDefinition[];
  transformers: MarkdownTransformer[];
}

export const createRecordingPi = (): RecordingPi => {
  const handlers = new Map<string, RecordedHandler[]>();
  const recording: RecordingPi = {
    allTools: [],
    api: {
      appendEntry(customType: string, data?: unknown) {
        recording.entries.push({ customType, data });
      },
      getAllTools() {
        return recording.allTools;
      },
      on(eventName: string, handler: RecordedHandler) {
        const eventHandlers = handlers.get(eventName) ?? [];
        eventHandlers.push(handler);
        handlers.set(eventName, eventHandlers);
      },
      registerCommand(
        name: string,
        options: { handler: RecordedCommand["handler"] }
      ) {
        recording.commands.push({ handler: options.handler, name });
      },
      registerMarkdownTransformer(transformer: MarkdownTransformer) {
        recording.transformers.push(transformer);
      },
      registerShortcut(
        shortcut: KeyId,
        options: { handler: RecordedShortcut["handler"] }
      ) {
        recording.shortcuts.push({ handler: options.handler, shortcut });
      },
      registerTool(definition: ToolDefinition) {
        recording.tools.push(definition);
      },
    } as unknown as ExtensionAPI,
    commands: [],
    async emit(eventName, event, context) {
      const eventHandlers = handlers.get(eventName) ?? [];
      return Promise.all(
        eventHandlers.map((handler) => handler(event, context))
      );
    },
    entries: [],
    eventNames: () => [...handlers.keys()],
    shortcuts: [],
    tools: [],
    transformers: [],
  };
  return recording;
};
