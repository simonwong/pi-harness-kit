import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { extractInlineSkillQuery } from "./inline-skill-tokens.ts";

/**
 * Editor surface the trigger logic relies on. Matches the public
 * `CustomEditor` API (`getLines`, `getCursor`, `isShowingAutocomplete`);
 * the autocomplete-open hook is the only internal seam, isolated in
 * `resolveInlineSlashTrigger` below.
 */
export interface InlineSlashEditorSurface {
  getCursor: () => { col: number; line: number };
  getLines: () => string[];
  isShowingAutocomplete: () => boolean;
}

const TRIGGER_CHARACTERS = /^[a-zA-Z0-9:/_-]$/;

/**
 * Resolve pi-tui's internal autocomplete-open hook with a runtime capability
 * check. pi 0.84.x has no public seam for opening the completion popup at an
 * inline `/`; every known implementation (Kimi's fork, datspike, herbertgao)
 * reaches this same method. The shared prototype is never patched — the hook
 * is bound to the subclass instance only. When the hook disappears in a
 * future pi version this returns undefined and callers silently degrade to
 * Tab-forced completion plus the native line-start menu.
 */
export const resolveInlineSlashTrigger = (
  editor: InlineSlashEditorSurface
): (() => void) | undefined => {
  const candidate = (editor as unknown as { tryTriggerAutocomplete?: unknown })
    .tryTriggerAutocomplete;
  if (typeof candidate !== "function") {
    return;
  }
  return () => {
    (candidate as () => void).call(editor);
  };
};

/**
 * After a printable character was handled, open the completion popup when
 * the caret now sits on an inline `/query` token. No-ops while the popup is
 * already visible (pi-tui refreshes it through updateAutocomplete), on
 * multi-character input such as IME commits and pastes, and whenever the
 * internal hook is unavailable.
 */
export const maybeTriggerInlineSlash = (
  editor: InlineSlashEditorSurface,
  data: string,
  trigger: (() => void) | undefined
): void => {
  if (trigger === undefined) {
    return;
  }
  if (!TRIGGER_CHARACTERS.test(data)) {
    return;
  }
  if (editor.isShowingAutocomplete()) {
    return;
  }
  const { line, col } = editor.getCursor();
  const currentLine = editor.getLines()[line] ?? "";
  const query = extractInlineSkillQuery(currentLine.slice(0, col), line);
  if (query === undefined) {
    return;
  }
  trigger();
};

/**
 * The pi-ui-input editor: pi's public `CustomEditor` plus inline-slash
 * autocomplete triggering. All editing behavior stays native; the subclass
 * only adds the post-input trigger check.
 */
export class InlineSkillEditor extends CustomEditor {
  override handleInput(data: string): void {
    super.handleInput(data);
    maybeTriggerInlineSlash(this, data, resolveInlineSlashTrigger(this));
  }
}
