export type MotionPreference = "full" | "reduced" | "off";

export type MessagesCapability = "markdown" | "compactThinking" | "toolCards";

export interface MessagesConfigSnapshot {
  diagnostics: string[];
  enabledCapabilities: MessagesCapability[];
  motion: MotionPreference;
  native: boolean;
  shortcut: string;
}

export interface MessagesConfigInput {
  globalContents: string | null;
  projectContents: string | null;
  projectTrusted: boolean;
}

export interface MessagesConfigLoaderInput {
  globalPath: string;
  projectPath: string;
  projectTrusted: boolean;
  readConfig: (filePath: string) => Promise<string | null>;
}

interface ParsedLayer {
  capabilityEnabled: Partial<Record<MessagesCapability, boolean>>;
  diagnostics: string[];
  enabled?: boolean;
  fatal: boolean;
  invalidCapabilities: Set<MessagesCapability>;
  motion?: MotionPreference;
  shortcut?: string;
}

const capabilities = ["markdown", "compactThinking", "toolCards"] as const;
const motionRank: Record<MotionPreference, number> = {
  full: 0,
  off: 2,
  reduced: 1,
};

export const DEFAULT_SHORTCUT = "alt+t";

const emptyLayer = (): ParsedLayer => ({
  capabilityEnabled: {},
  diagnostics: [],
  fatal: false,
  invalidCapabilities: new Set(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseGlobalControls = (
  document: Record<string, unknown>,
  label: string,
  layer: ParsedLayer
): void => {
  if (document.enabled !== undefined) {
    if (typeof document.enabled === "boolean") {
      layer.enabled = document.enabled;
    } else {
      layer.diagnostics.push(`${label} enabled must be a boolean`);
      layer.fatal = true;
    }
  }

  if (document.motion === undefined) {
    return;
  }
  if (
    document.motion === "full" ||
    document.motion === "reduced" ||
    document.motion === "off"
  ) {
    layer.motion = document.motion;
    return;
  }
  layer.diagnostics.push(`${label} motion must be full, reduced, or off`);
  layer.fatal = true;
};

const parseCapabilities = (
  input: Record<string, unknown>,
  label: string,
  layer: ParsedLayer
): void => {
  for (const capability of capabilities) {
    const section = input[capability];
    if (section === undefined) {
      continue;
    }
    if (
      !isRecord(section) ||
      (section.enabled !== undefined && typeof section.enabled !== "boolean")
    ) {
      layer.diagnostics.push(
        `${label} messages.${capability} must contain a boolean enabled value`
      );
      layer.invalidCapabilities.add(capability);
      continue;
    }
    if (section.enabled !== undefined) {
      layer.capabilityEnabled[capability] = section.enabled;
    }
    if (capability === "compactThinking" && section.shortcut !== undefined) {
      if (typeof section.shortcut === "string" && section.shortcut.length > 0) {
        layer.shortcut = section.shortcut;
      } else {
        layer.diagnostics.push(
          `${label} messages.compactThinking.shortcut must be a non-empty string`
        );
      }
    }
  }
};

const parseLayer = (contents: string | null, label: string): ParsedLayer => {
  if (contents === null) {
    return emptyLayer();
  }

  let document: unknown;
  try {
    document = JSON.parse(contents);
  } catch {
    return {
      ...emptyLayer(),
      diagnostics: [`${label} pi-ui.json is not valid JSON`],
      fatal: true,
    };
  }

  if (!isRecord(document) || document.version !== 1) {
    return {
      ...emptyLayer(),
      diagnostics: [`${label} pi-ui.json must use version 1`],
      fatal: true,
    };
  }

  const layer = emptyLayer();
  parseGlobalControls(document, label, layer);
  if (document.messages === undefined) {
    return layer;
  }
  if (!isRecord(document.messages)) {
    layer.diagnostics.push(`${label} messages must be an object`);
    layer.fatal = true;
    return layer;
  }
  parseCapabilities(document.messages, label, layer);
  return layer;
};

const mostRestrictiveMotion = (
  left: MotionPreference,
  right: MotionPreference | undefined
): MotionPreference => {
  if (right === undefined || motionRank[left] >= motionRank[right]) {
    return left;
  }
  return right;
};

export const loadMessagesConfig = async (
  input: MessagesConfigLoaderInput
): Promise<MessagesConfigSnapshot> => {
  const globalContents = await input.readConfig(input.globalPath);
  const projectContents = input.projectTrusted
    ? await input.readConfig(input.projectPath)
    : null;
  return resolveMessagesConfig({
    globalContents,
    projectContents,
    projectTrusted: input.projectTrusted,
  });
};

export const resolveMessagesConfig = (
  input: MessagesConfigInput
): MessagesConfigSnapshot => {
  const globalLayer = parseLayer(input.globalContents, "Global");
  const projectLayer = input.projectTrusted
    ? parseLayer(input.projectContents, "Project")
    : emptyLayer();
  const layers = [globalLayer, projectLayer];
  const diagnostics = layers.flatMap((layer) => layer.diagnostics);
  let motion: MotionPreference = "full";
  for (const layer of layers) {
    motion = mostRestrictiveMotion(motion, layer.motion);
  }

  const native =
    layers.some((layer) => layer.fatal || layer.enabled === false) ||
    globalLayer.enabled === false;
  if (native) {
    return {
      diagnostics,
      enabledCapabilities: [],
      motion,
      native: true,
      shortcut: DEFAULT_SHORTCUT,
    };
  }

  const enabled = new Map<MessagesCapability, boolean>(
    capabilities.map((capability) => [capability, true])
  );
  let shortcut = DEFAULT_SHORTCUT;
  for (const layer of layers) {
    for (const capability of capabilities) {
      const configured = layer.capabilityEnabled[capability];
      if (configured !== undefined) {
        enabled.set(capability, configured);
      }
    }
    if (layer.shortcut !== undefined) {
      ({ shortcut } = layer);
    }
  }
  for (const layer of layers) {
    for (const capability of layer.invalidCapabilities) {
      enabled.set(capability, false);
    }
  }

  return {
    diagnostics,
    enabledCapabilities: capabilities.filter(
      (capability) => enabled.get(capability) === true
    ),
    motion,
    native: false,
    shortcut,
  };
};
