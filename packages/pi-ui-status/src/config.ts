export type MotionPreference = "full" | "reduced" | "off";

export type StatusCapability = "working" | "statusCues";

export interface StatusConfigSnapshot {
  diagnostics: string[];
  enabledCapabilities: StatusCapability[];
  motion: MotionPreference;
  native: boolean;
}

export interface StatusConfigInput {
  globalContents: string | null;
  projectContents: string | null;
  projectTrusted: boolean;
}

export interface StatusConfigLoaderInput {
  globalPath: string;
  projectPath: string;
  projectTrusted: boolean;
  readConfig: (filePath: string) => Promise<string | null>;
}

interface ParsedLayer {
  capabilityEnabled: Partial<Record<StatusCapability, boolean>>;
  diagnostics: string[];
  enabled?: boolean;
  fatal: boolean;
  invalidCapabilities: Set<StatusCapability>;
  motion?: MotionPreference;
}

const capabilities = ["working", "statusCues"] as const;
const motionRank: Record<MotionPreference, number> = {
  full: 0,
  off: 2,
  reduced: 1,
};

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
  status: Record<string, unknown>,
  label: string,
  layer: ParsedLayer
): void => {
  for (const capability of capabilities) {
    const section = status[capability];
    if (section === undefined) {
      continue;
    }
    if (
      !isRecord(section) ||
      (section.enabled !== undefined && typeof section.enabled !== "boolean")
    ) {
      layer.diagnostics.push(
        `${label} status.${capability} must contain a boolean enabled value`
      );
      layer.invalidCapabilities.add(capability);
      continue;
    }
    if (section.enabled !== undefined) {
      layer.capabilityEnabled[capability] = section.enabled;
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
  if (document.status === undefined) {
    return layer;
  }
  if (!isRecord(document.status)) {
    layer.diagnostics.push(`${label} status must be an object`);
    layer.fatal = true;
    return layer;
  }
  parseCapabilities(document.status, label, layer);
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

export const loadStatusConfig = async (
  input: StatusConfigLoaderInput
): Promise<StatusConfigSnapshot> => {
  const globalContents = await input.readConfig(input.globalPath);
  const projectContents = input.projectTrusted
    ? await input.readConfig(input.projectPath)
    : null;
  return resolveStatusConfig({
    globalContents,
    projectContents,
    projectTrusted: input.projectTrusted,
  });
};

export const resolveStatusConfig = (
  input: StatusConfigInput
): StatusConfigSnapshot => {
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
    };
  }

  const enabled = new Map<StatusCapability, boolean>(
    capabilities.map((capability) => [capability, true])
  );
  for (const layer of layers) {
    for (const capability of capabilities) {
      const configured = layer.capabilityEnabled[capability];
      if (configured !== undefined) {
        enabled.set(capability, configured);
      }
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
  };
};
