import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionContext,
  type ExtensionFactory,
  getAgentDir,
  type InputEvent,
  type InputEventResult,
  type SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { type InputConfigSnapshot, loadInputConfig } from "./config.ts";
import { InlineSkillEditor } from "./inline-skill-editor.ts";
import { createSkillCatalog } from "./skill-catalog.ts";
import { expandInlineSkills } from "./skill-expansion.ts";
import { createSkillAutocompleteProvider } from "./skill-provider.ts";

export type InputEditorFactory = NonNullable<
  Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]
>;

export interface InputDependencies {
  editorFactory: InputEditorFactory;
  loadConfig: (context: ExtensionContext) => Promise<InputConfigSnapshot>;
  readSkillFile: (filePath: string) => Promise<string> | string;
}

const productionDependencies: InputDependencies = {
  editorFactory: (tui, theme, keybindings) =>
    new InlineSkillEditor(tui, theme, keybindings),
  loadConfig: async (context) => {
    const readOptionalFile = async (
      filePath: string
    ): Promise<string | null> => {
      try {
        return await readFile(filePath, "utf8");
      } catch {
        return null;
      }
    };
    return loadInputConfig({
      globalPath: path.join(getAgentDir(), "pi-ui.json"),
      projectPath: path.join(context.cwd, CONFIG_DIR_NAME, "pi-ui.json"),
      projectTrusted: context.isProjectTrusted(),
      readConfig: readOptionalFile,
    });
  },
  readSkillFile: async (filePath) => readFile(filePath, "utf8"),
};

const STARTING_COMMAND_PATTERN =
  /^\/([a-z0-9][a-z0-9-]{0,63})(?![a-z0-9-]|[:/])/i;

const hasStartingCommandConflict = (
  text: string,
  commands: SlashCommandInfo[]
): boolean => {
  const startingCommand = STARTING_COMMAND_PATTERN.exec(text);
  const name = startingCommand?.[1]?.toLowerCase();
  if (name === undefined) {
    return false;
  }
  return commands.some(
    (command) =>
      command.source !== "skill" && command.name.toLowerCase() === name
  );
};

const CONTINUE: InputEventResult = { action: "continue" };

export const createInputExtension =
  (
    dependencies: InputDependencies = productionDependencies
  ): ExtensionFactory =>
  (pi) => {
    let configSnapshot: Promise<InputConfigSnapshot> | undefined;
    let providerInstalled = false;

    const loadConfig = (context: ExtensionContext) => {
      configSnapshot ??= dependencies.loadConfig(context);
      return configSnapshot;
    };

    const multiSkillEnabled = async (
      context: ExtensionContext
    ): Promise<boolean> => {
      const config = await loadConfig(context);
      return (
        !config.native && config.enabledCapabilities.includes("multiSkill")
      );
    };

    pi.on("session_start", async (_event, context) => {
      if (context.mode !== "tui") {
        return;
      }
      const config = await loadConfig(context);
      for (const diagnostic of config.diagnostics) {
        context.ui.notify(`pi-ui input: ${diagnostic}`, "warning");
      }
      if (config.native || !config.enabledCapabilities.includes("multiSkill")) {
        return;
      }

      if (!providerInstalled) {
        providerInstalled = true;
        context.ui.addAutocompleteProvider((current) =>
          createSkillAutocompleteProvider({
            current,
            getSkills: () => createSkillCatalog(pi.getCommands()).skills,
          })
        );
      }

      const currentEditor = context.ui.getEditorComponent();
      if (
        currentEditor !== undefined &&
        currentEditor !== dependencies.editorFactory
      ) {
        context.ui.notify(
          "pi-ui input: another extension owns the editor; inline `/` auto-popup is off, Tab still completes skills",
          "warning"
        );
        return;
      }
      context.ui.setEditorComponent(dependencies.editorFactory);
    });

    pi.on("session_shutdown", async () => {
      providerInstalled = false;
    });

    pi.on(
      "input",
      async (event: InputEvent, context): Promise<InputEventResult> => {
        if (
          event.source === "extension" ||
          !event.text.includes("/") ||
          context.mode !== "tui"
        ) {
          return CONTINUE;
        }
        if (!(await multiSkillEnabled(context))) {
          return CONTINUE;
        }

        const commands = pi.getCommands();
        if (hasStartingCommandConflict(event.text, commands)) {
          return CONTINUE;
        }

        const expansion = await expandInlineSkills(
          event.text,
          createSkillCatalog(commands).resolve,
          (skill) => dependencies.readSkillFile(skill.path)
        );
        if (expansion === undefined) {
          return CONTINUE;
        }
        if (expansion.failed.length > 0) {
          context.ui.notify(
            `pi-ui input: failed to load skill: ${expansion.failed.join(", ")}`,
            "error"
          );
        }
        return {
          action: "transform",
          text: expansion.text,
          ...(event.images ? { images: event.images } : {}),
        };
      }
    );
  };
