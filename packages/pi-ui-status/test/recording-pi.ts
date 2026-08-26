import type {
  ExtensionAPI,
  ExtensionContext,
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
}

export const createRecordingPi = (): RecordingPi => {
  const handlers = new Map<string, RecordedHandler[]>();
  const api = {
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
  };
};
