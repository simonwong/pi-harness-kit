import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "@earendil-works/pi-tui";
import { extractInlineSkillQuery } from "./inline-skill-tokens.ts";
import type { SkillEntry } from "./skill-catalog.ts";
import { filterSkills } from "./skill-filter.ts";

export const MAX_SUGGESTIONS = 30;

export interface SkillProviderOptions {
  /** The previously registered provider; delegated to exactly once. */
  current: AutocompleteProvider;
  /** Live skill catalog, re-read per query so newly added skills appear. */
  getSkills: () => SkillEntry[];
}

/**
 * Composite autocomplete provider for inline multi-Skill composition.
 * Inline `/query` tokens (after whitespace on any line, or at the start of
 * later lines) yield skill-only suggestions; every other context delegates
 * to the previous provider exactly once. The returned prefix is the bare
 * query without `/` so pi-tui never treats completion confirmation as a
 * slash-command submission.
 */
export const createSkillAutocompleteProvider = (
  options: SkillProviderOptions
): AutocompleteProvider => {
  const ownItems = new WeakSet<AutocompleteItem>();

  return {
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      const currentLine = lines[cursorLine] ?? "";
      const slashIndex = cursorCol - prefix.length - 1;
      if (
        !ownItems.has(item) ||
        slashIndex < 0 ||
        currentLine[slashIndex] !== "/"
      ) {
        return options.current.applyCompletion(
          lines,
          cursorLine,
          cursorCol,
          item,
          prefix
        );
      }

      const beforePrefix = currentLine.slice(0, slashIndex);
      const afterCursor = currentLine.slice(cursorCol);
      const suffix = afterCursor.startsWith(" ") ? "" : " ";
      const nextLines = [...lines];
      nextLines[cursorLine] =
        `${beforePrefix}/${item.value}${suffix}${afterCursor}`;
      return {
        cursorCol: beforePrefix.length + 1 + item.value.length + suffix.length,
        cursorLine,
        lines: nextLines,
      };
    },
    async getSuggestions(lines, cursorLine, cursorCol, suggestionOptions) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const query = extractInlineSkillQuery(textBeforeCursor, cursorLine);

      if (query === undefined) {
        return options.current.getSuggestions(
          lines,
          cursorLine,
          cursorCol,
          suggestionOptions
        );
      }

      const skills = options.getSkills();
      if (suggestionOptions.signal.aborted || skills.length === 0) {
        // A mid-text `/` with no skills must not surface path completion.
        return null;
      }

      const matches = filterSkills(skills, query).slice(0, MAX_SUGGESTIONS);
      if (matches.length === 0) {
        return null;
      }

      const items: AutocompleteItem[] = matches.map((skill) => {
        const item: AutocompleteItem = {
          label: `skill:${skill.name}`,
          value: `skill:${skill.name}`,
        };
        if (skill.description !== undefined) {
          item.description = skill.description;
        }
        ownItems.add(item);
        return item;
      });
      return { items, prefix: query };
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return (
        options.current.shouldTriggerFileCompletion?.(
          lines,
          cursorLine,
          cursorCol
        ) ?? true
      );
    },
  };
};
