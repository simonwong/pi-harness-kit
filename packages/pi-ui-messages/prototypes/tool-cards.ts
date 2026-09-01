/**
 * PROTOTYPE — throwaway. Do not ship.
 *
 * One look: Claude-style activity row. Title is a verb template from the
 * builtin + args (not a model-written description). Evidence hangs off an L.
 *
 * Run: pi -e ./packages/pi-ui-messages/prototypes/tool-cards.ts
 * Then ask the model to ls / read / grep / bash.
 */

import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  keyHint,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const WIDGET_ID = "pi-ui:proto:tool-cards";
const EXPAND_LINES = 24;

type RenderCtx = {
  args: Record<string, unknown>;
  isError: boolean;
  lastComponent: unknown;
};

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;

const textContent = (result: AgentToolResult<unknown>): string => {
  const part = result.content[0];
  return part?.type === "text" ? part.text : "";
};

const lineCount = (text: string): number => {
  if (text.length === 0) {
    return 0;
  }
  return text.replace(/\n$/, "").split("\n").length;
};

const diffStats = (diff: string): { added: number; removed: number } => {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed += 1;
    }
  }
  return { added, removed };
};

const paint = (theme: Theme, last: unknown, body: string): Text => {
  const text = last instanceof Text ? last : new Text("", 0, 0);
  text.setText(body);
  return text;
};

const bullet = (theme: Theme, pending: boolean, error: boolean): string => {
  if (error) {
    return theme.fg("error", "●");
  }
  if (pending) {
    return theme.fg("accent", "●");
  }
  return theme.fg("success", "●");
};

const bashTitle = (command: string): string => {
  const head = command.trim().split(/\s+/)[0] ?? "command";
  const base = head.split("/").at(-1) ?? head;
  if (base === "grep" || base === "rg") {
    return "Searching";
  }
  if (base === "ls") {
    return "Listing";
  }
  if (base === "find") {
    return "Finding";
  }
  if (base === "cat" || base === "head" || base === "tail" || base === "sed") {
    return "Reading";
  }
  return `Running ${clip(base, 24)}`;
};

const activity = (
  theme: Theme,
  input: {
    detail?: string;
    error?: string;
    evidence: string;
    expanded: boolean;
    pending: boolean;
    title: string;
  }
): string => {
  const error = input.error !== undefined;
  const head = `${bullet(theme, input.pending, error)} ${theme.fg("text", input.title)}`;
  const evidence = `  ${theme.fg("dim", "L")} ${theme.fg("muted", input.evidence)}`;
  const lines = [head, evidence];
  if (input.error !== undefined) {
    lines.push(`  ${theme.fg("error", input.error)}`);
  }
  if (input.expanded && input.detail !== undefined && input.detail.length > 0) {
    const hint = theme.fg("muted", keyHint("app.tools.expand", "to collapse"));
    lines.push(`  ${hint}`);
    for (const line of input.detail.split("\n").slice(0, EXPAND_LINES)) {
      lines.push(`  ${theme.fg("dim", line)}`);
    }
  }
  return lines.join("\n");
};

const wrapTool = (
  pi: ExtensionAPI,
  original: {
    description: string;
    execute: (...args: never[]) => Promise<AgentToolResult<unknown>>;
    name: string;
    parameters: unknown;
  },
  render: {
    call: (args: Record<string, unknown>) => { evidence: string; title: string };
    result: (
      result: AgentToolResult<unknown>,
      options: { expanded: boolean; isPartial: boolean },
      context: RenderCtx
    ) => { detail: string; error?: string };
  }
): void => {
  pi.registerTool({
    description: original.description,
    execute: original.execute as never,
    label: original.name,
    name: original.name,
    parameters: original.parameters as never,
    renderCall(args, theme, context) {
      const row = render.call(args as Record<string, unknown>);
      return paint(
        theme,
        context.lastComponent,
        activity(theme, {
          evidence: row.evidence,
          expanded: false,
          pending: true,
          title: row.title,
        })
      );
    },
    renderResult(result, options, theme, context) {
      const row = render.call(context.args as Record<string, unknown>);
      const status = render.result(result, options, context);
      return paint(
        theme,
        context.lastComponent,
        activity(theme, {
          detail: status.detail,
          error: status.error,
          evidence: row.evidence,
          expanded: options.expanded,
          pending: options.isPartial,
          title: row.title,
        })
      );
    },
    renderShell: "self",
  });
};

const registerCards = (pi: ExtensionAPI, cwd: string): void => {
  wrapTool(pi, createReadTool(cwd), {
    call: (args) => ({
      evidence: String(args.path ?? ""),
      title: `Reading ${clip(String(args.path ?? "file"), 56)}`,
    }),
    result: (result, _options, context) => {
      if (context.isError) {
        return {
          detail: textContent(result),
          error: clip(textContent(result).split("\n")[0] ?? "error", 60),
        };
      }
      const part = result.content[0];
      if (part?.type === "image") {
        return { detail: "image loaded" };
      }
      const text = textContent(result);
      return { detail: `${lineCount(text)} lines\n${text}` };
    },
  });

  wrapTool(pi, createBashTool(cwd), {
    call: (args) => {
      const command = String(args.command ?? "");
      return {
        evidence: `$ ${command}`,
        title: bashTitle(command),
      };
    },
    result: (result, _options, context) => {
      const output = textContent(result);
      if (context.isError) {
        return { detail: output, error: clip(output.split("\n")[0] ?? "error", 60) };
      }
      const exitMatch = output.match(/exit code: (\d+)/);
      const code = exitMatch?.[1];
      if (code !== undefined && code !== "0") {
        return { detail: output, error: `exit ${code}` };
      }
      return { detail: output };
    },
  });

  wrapTool(pi, createEditTool(cwd), {
    call: (args) => ({
      evidence: String(args.path ?? ""),
      title: `Editing ${clip(String(args.path ?? "file"), 56)}`,
    }),
    result: (result, _options, context) => {
      const output = textContent(result);
      if (context.isError || output.startsWith("Error")) {
        return { detail: output, error: clip(output.split("\n")[0] ?? "error", 60) };
      }
      const details = result.details as { diff?: string } | undefined;
      const diff = details?.diff ?? "";
      const stats = diffStats(diff);
      return { detail: `+${stats.added} / -${stats.removed}\n${diff}` };
    },
  });

  wrapTool(pi, createWriteTool(cwd), {
    call: (args) => ({
      evidence: String(args.path ?? ""),
      title: `Writing ${clip(String(args.path ?? "file"), 56)}`,
    }),
    result: (result, _options, context) => {
      const output = textContent(result);
      if (context.isError || output.startsWith("Error")) {
        return { detail: output, error: clip(output.split("\n")[0] ?? "error", 60) };
      }
      return { detail: output };
    },
  });

  wrapTool(pi, createGrepTool(cwd), {
    call: (args) => ({
      evidence: [args.path, args.glob].filter(Boolean).map(String).join(" ") || ".",
      title: `Searching for ${clip(String(args.pattern ?? "pattern"), 40)}`,
    }),
    result: (result, _options, context) => {
      const output = textContent(result);
      if (context.isError) {
        return { detail: output, error: clip(output.split("\n")[0] ?? "error", 60) };
      }
      return { detail: `${lineCount(output)} matches\n${output}` };
    },
  });

  wrapTool(pi, createFindTool(cwd), {
    call: (args) => ({
      evidence: String(args.path ?? "."),
      title: `Finding ${clip(String(args.pattern ?? "files"), 40)}`,
    }),
    result: (result, _options, context) => {
      const output = textContent(result);
      if (context.isError) {
        return { detail: output, error: clip(output.split("\n")[0] ?? "error", 60) };
      }
      return { detail: `${lineCount(output)} files\n${output}` };
    },
  });

  wrapTool(pi, createLsTool(cwd), {
    call: (args) => ({
      evidence: String(args.path ?? "."),
      title: `Listing ${clip(String(args.path ?? "."), 56)}`,
    }),
    result: (result, _options, context) => {
      const output = textContent(result);
      if (context.isError) {
        return { detail: output, error: clip(output.split("\n")[0] ?? "error", 60) };
      }
      return { detail: `${lineCount(output)} entries\n${output}` };
    },
  });
};

const showBanner = (context: ExtensionContext): void => {
  context.ui.setWidget(WIDGET_ID, [
    "PROTO tool-cards  ● title / L evidence  ·  ask the model: ls this directory",
  ]);
};

export default function (pi: ExtensionAPI): void {
  registerCards(pi, process.cwd());

  pi.on("session_start", (_event, context) => {
    if (context.mode !== "tui") {
      return;
    }
    registerCards(pi, context.cwd);
    showBanner(context);
    context.ui.notify(
      "tool-card proto: activity rows on. 对模型说「用 ls 列出当前目录」，看 ● Listing 不是 thinking。"
    );
  });

  pi.on("session_shutdown", (_event, context) => {
    if (context.mode === "tui") {
      context.ui.setWidget(WIDGET_ID, undefined);
    }
  });

  pi.registerCommand("tool-card-proto", {
    description: "How to exercise the tool-card prototype",
    handler: async (_args, context) => {
      context.ui.notify(
        "Ask for ls / read / grep / bash. Expect ● Reading|Searching|Listing plus L evidence. Expand often ctrl+o."
      );
    },
  });
}
