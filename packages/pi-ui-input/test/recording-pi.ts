import type {
  ExtensionAPI,
  ExtensionContext,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";

type RecordedHandler = (
  event: unknown,
  context: ExtensionContext
) => Promise<unknown> | unknown;

export interface RecordingPi {
  api: ExtensionAPI;
  emit: (
    eventName: string,
    event: unknown,
    context: ExtensionContext
  ) => Promise<unknown[]>;
  eventNames: () => string[];
  setCommands: (commands: SlashCommandInfo[]) => void;
}

export const createRecordingPi = (): RecordingPi => {
  const handlers = new Map<string, RecordedHandler[]>();
  let commands: SlashCommandInfo[] = [];
  const api = {
    getCommands() {
      return commands;
    },
    on(eventName: string, handler: RecordedHandler) {
      const eventHandlers = handlers.get(eventName) ?? [];
      eventHandlers.push(handler);
      handlers.set(eventName, eventHandlers);
    },
  } as unknown as ExtensionAPI;

  return {
    api,
    async emit(eventName, event, context) {
      const eventHandlers = handlers.get(eventName) ?? [];
      return Promise.all(
        eventHandlers.map((handler) => handler(event, context))
      );
    },
    eventNames: () => [...handlers.keys()],
    setCommands(next) {
      commands = next;
    },
  };
};

export const skillCommand = (
  name: string,
  overrides?: Partial<SlashCommandInfo>
): SlashCommandInfo => ({
  description: `${name} description`,
  name: `skill:${name}`,
  source: "skill",
  sourceInfo: {
    baseDir: `/skills/${name}`,
    origin: "top-level",
    path: `/skills/${name}/SKILL.md`,
    scope: "project",
    source: "test",
  } as SlashCommandInfo["sourceInfo"],
  ...overrides,
});

export const extensionCommand = (name: string): SlashCommandInfo => ({
  description: `${name} description`,
  name,
  source: "extension",
  sourceInfo: {
    origin: "top-level",
    path: `/extensions/${name}.ts`,
    scope: "project",
    source: "test",
  } as SlashCommandInfo["sourceInfo"],
});
