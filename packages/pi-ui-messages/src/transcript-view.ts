import {
  AssistantMessageComponent,
  type ToolDefinition,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { type Component, Container, Markdown } from "@earendil-works/pi-tui";

interface TranscriptViewOptions {
  anchorForTool: (callId: string) => string | undefined;
  collapsed: () => boolean;
  isOwnedTool: (definition: ToolDefinition) => boolean;
  revision: () => number;
}

interface Binding {
  original: Component["render"];
  render: Component["render"];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const consecutiveThinking = (
  content: readonly unknown[],
  start: number,
  timestamp: number
) => {
  const keys: string[] = [];
  let index = start;
  for (; index < content.length; index += 1) {
    const block = content[index];
    if (!isRecord(block) || block.type !== "thinking") {
      break;
    }
    if (typeof block.thinking === "string" && block.thinking.trim()) {
      keys.push(`${timestamp}:${index}`);
    }
  }
  return { end: index - 1, keys };
};

const contentGroups = (content: readonly unknown[], timestamp: number) => {
  const groups: (string[] | undefined)[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (!isRecord(block)) {
      return [];
    }
    if (
      block.type === "text" &&
      typeof block.text === "string" &&
      block.text.trim()
    ) {
      groups.push(undefined);
    } else if (block.type === "thinking") {
      const run = consecutiveThinking(content, index, timestamp);
      index = run.end;
      if (run.keys.length > 0) {
        groups.push(run.keys);
      }
    }
  }
  return groups;
};

// Pi 0.84.2 supplies no message identity to Markdown transformers or whole-tool visibility hook.
// Keep the guarded instance-field adapter here; unsupported host shapes remain native.
const thinkingGroups = (component: AssistantMessageComponent) => {
  const host = component as unknown as Record<string, unknown>;
  const message = host.lastMessage;
  if (
    host.hideThinkingBlock !== false ||
    !(host.contentContainer instanceof Container) ||
    !isRecord(message) ||
    typeof message.timestamp !== "number" ||
    !Array.isArray(message.content)
  ) {
    return [];
  }
  const groups = contentGroups(message.content, message.timestamp);
  const markdown = host.contentContainer.children.filter(
    (child): child is Markdown => child instanceof Markdown
  );
  if (markdown.length !== groups.length) {
    return [];
  }
  return markdown.flatMap((node, index) => {
    const keys = groups[index];
    return keys === undefined ? [] : [{ keys, node }];
  });
};

export const attachTranscriptView = (
  tui: { children?: Component[] },
  options: TranscriptViewOptions
) => {
  let disposed = false;
  let structureRevision = 0;
  let currentThinkingKeys: readonly string[] | undefined;
  const bindings = new WeakMap<Component, Binding>();
  const roots = new Map<Container, { keys: Set<string>; tools: Set<string> }>();

  const hasThinkingKey = (key: string): boolean =>
    !disposed && [...roots.values()].some((root) => root.keys.has(key));

  const canFoldTool = (callId: string): boolean => {
    if (disposed) {
      return false;
    }
    const anchor = options.anchorForTool(callId);
    return (
      anchor !== undefined &&
      [...roots.values()].some(
        (root) => root.keys.has(anchor) && root.tools.has(callId)
      )
    );
  };

  const bindThinking = (node: Markdown, keys: string[]): boolean => {
    const previous = bindings.get(node);
    if (previous !== undefined) {
      return node.render === previous.render;
    }
    if (!Object.isExtensible(node)) {
      return false;
    }
    const original = node.render;
    let revision: number | undefined;
    let structure: number | undefined;
    const render = (width: number): string[] => {
      if (disposed) {
        return original.call(node, width);
      }
      if (revision !== options.revision() || structure !== structureRevision) {
        revision = options.revision();
        structure = structureRevision;
        node.invalidate();
      }
      const previousKeys = currentThinkingKeys;
      currentThinkingKeys = keys;
      try {
        return original.call(node, width);
      } finally {
        currentThinkingKeys = previousKeys;
      }
    };
    bindings.set(node, { original, render });
    node.render = render;
    return true;
  };

  const bindTool = (node: ToolExecutionComponent): string | undefined => {
    const host = node as unknown as Record<string, unknown>;
    const callId = host.toolCallId;
    if (
      typeof callId !== "string" ||
      !isRecord(host.toolDefinition) ||
      !options.isOwnedTool(host.toolDefinition as unknown as ToolDefinition)
    ) {
      return;
    }
    const previous = bindings.get(node);
    if (previous !== undefined) {
      return node.render === previous.render ? callId : undefined;
    }
    if (!Object.isExtensible(node)) {
      return;
    }
    const original = node.render;
    let previousMode: string | undefined;
    const render = (width: number): string[] => {
      let mode = "native";
      if (canFoldTool(callId)) {
        mode = options.collapsed() ? "hidden" : "expanded";
      }
      if (mode !== previousMode) {
        previousMode = mode;
        node.invalidate();
      }
      return mode === "hidden" ? [] : original.call(node, width);
    };
    bindings.set(node, { original, render });
    node.render = render;
    return callId;
  };

  const walk = (
    node: Component,
    visit: (component: Component) => void
  ): void => {
    visit(node);
    if (node instanceof Container) {
      for (const child of node.children) {
        walk(child, visit);
      }
    }
  };

  const prepareNode = (
    node: Component,
    state: { keys: Set<string>; tools: Set<string> }
  ): void => {
    if (node instanceof AssistantMessageComponent) {
      for (const { keys, node: markdown } of thinkingGroups(node)) {
        if (bindThinking(markdown, keys)) {
          for (const key of keys) {
            state.keys.add(key);
          }
        }
      }
    } else if (node instanceof ToolExecutionComponent) {
      const callId = bindTool(node);
      if (callId !== undefined) {
        state.tools.add(callId);
      }
    }
  };

  for (const root of tui.children ?? []) {
    if (!(root instanceof Container && Object.isExtensible(root))) {
      continue;
    }
    const state = { keys: new Set<string>(), tools: new Set<string>() };
    roots.set(root, state);
    const original = root.render;
    const render = (width: number): string[] => {
      const previousKeys = state.keys;
      state.keys = new Set();
      state.tools.clear();
      if (!disposed) {
        walk(root, (node) => prepareNode(node, state));
      }
      if (
        previousKeys.size !== state.keys.size ||
        [...previousKeys].some((key) => !state.keys.has(key))
      ) {
        structureRevision += 1;
      }
      return original.call(root, width);
    };
    bindings.set(root, { original, render });
    root.render = render;
  }

  return {
    canFoldTool,
    dispose(): void {
      disposed = true;
      for (const root of roots.keys()) {
        walk(root, (node) => {
          const binding = bindings.get(node);
          if (binding !== undefined && node.render === binding.render) {
            node.render = binding.original;
            node.invalidate();
          }
        });
      }
      roots.clear();
    },
    hasThinkingKey,
    thinkingKeys: (): readonly string[] | undefined => currentThinkingKeys,
  };
};

export type TranscriptView = ReturnType<typeof attachTranscriptView>;
