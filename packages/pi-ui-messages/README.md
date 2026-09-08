# pi-ui-messages

Private local-v1 package for the Pi UI Messages Surface. It folds multi-step thinking and suite-controlled builtin tool evidence in place without changing stored assistant/tool content.

## Work Trace

Compact Thinking and Tool Cards combine into a first-thinking anchored Work Trace in Pi TUI mode.

- While the first thinking block streams, `⠋ Thinking · 17s (56 lines, alt+t to expand)` redraws every 100ms and shows the latest three wrapped rows.
- When later thinking follows tool use, the first block becomes the cumulative `Thought` summary and later thinking blocks stay hidden.
- Observed builtin and third-party calls contribute to the cumulative tool count.
- The seven builtins (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) fold only when `getAllTools()` still reports `source: builtin`. A pure-tool trace stays native because it has no Thought anchor.
- `alt+t` toggles compact form and restores original thinking plus complete builtin call/result evidence in its original Transcript positions. `/compact-thinking` does the same. `ctrl+t` keeps Pi's native thinking hide/show.
- Third-party, Todo, Subagent, and already-overridden tool renderers are best-effort: calls count toward the summary, but native UI remains when Pi exposes no safe renderer seam.
- Duration and trace metadata persist as custom session entries and restore on session start and tree navigation. Version 2 trace records identify thinking by message timestamp and content position, including consecutive blocks rendered together. Legacy version 1 records and history without identity metadata keep per-block thinking and native tool evidence.
- Stored messages, tool definitions, execution, model context, `/export`, `/share`, and session jsonl content stay unchanged.

On Pi 0.84.2, an isolated, guarded Transcript adapter associates native Markdown components with their message positions and folds the complete builtin component, including inline images. It changes only instance rendering and restores it on shutdown; no shared prototype is patched. If the host shape is unsupported, or Pi's native `ctrl+t` hides the Thought anchor, tools remain visible. Recheck the host-component tests and Ghostty smoke when upgrading Pi.

Standalone Tool Cards display an explicit `failed` marker for errors. Native renderer components remain separate from compact rows, so expansion preserves wrapped output, diffs, and native result state.

Assistant Reply bullets preserve structured Markdown. Headings, lists, links, emphasis, and fenced code are not pre-wrapped or indented.

## Configuration

Pi UI is zero-config by default. Optional versioned configuration is loaded once per extension instance from:

```text
<agent-dir>/pi-ui.json
<project>/.pi/pi-ui.json
```

Project configuration is read only when Pi trusts the project. Changes take effect after `/reload`.

```json
{
  "version": 1,
  "enabled": true,
  "messages": {
    "compactThinking": {
      "enabled": true,
      "shortcut": "alt+t"
    },
    "toolCards": {
      "enabled": true
    }
  }
}
```

- `enabled: false` is the Global Native Escape Hatch and cannot be undone by project configuration.
- `messages.compactThinking.enabled: false` disables Work Trace thinking grouping.
- `messages.compactThinking.shortcut` overrides the in-place expand/collapse key.
- `messages.toolCards.enabled: false` leaves all tool renderers native while retaining Compact Thinking. When Tool Cards is enabled alone, builtin calls use standalone compact rows and Pi's native expand control restores full evidence.
- Missing files select defaults without a diagnostic.
- Invalid JSON, version, or Messages root keeps Messages native and reports once. An invalid Compact Thinking section disables only Compact Thinking.
- RPC, JSON, and print modes always behave natively.
