# pi-ui-messages

Private local-v1 package for the Pi UI Messages Surface. It compactly presents thinking and builtin tool activity in the TUI without changing stored session or export content.

## Compact Thinking

Compact Thinking is enabled with zero configuration in Pi TUI mode.

- While thinking streams, the header `⠋ Thinking · 17s (56 lines, alt+t to expand)` redraws every 80ms (Pi Loader cadence). The three lines below are the latest wrapped rows and only change when thinking text arrives.
- After the run ends, the block collapses to `Thought for 5s (60 lines collapsed, alt+t to expand)`.
- `alt+t` toggles compact form and the original thinking text (shown as `option+t` on macOS, `alt+t` on Windows/Linux). `/compact-thinking` does the same if the shortcut cannot be registered. `ctrl+t` keeps Pi's native hide/show.
- Durations persist as custom session entries and restore on session start and tree navigation. After a restore miss, the line still reports line count and omits duration rather than inventing one.
- Stored messages, `/export`, `/share`, and session jsonl stay full thinking text.

## Tool Cards

Enabled with zero configuration in Pi TUI mode. Wraps the seven builtins (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) only when `getAllTools()` still reports `source: builtin`. Execution, schema, and details stay native. Third-party or already-overridden tools stay native.

```text
● Reading package.json
  L package.json

● Searching
  L $ grep -rn toolCards .
```

Titles are verb templates from the tool and args, not model-written descriptions. Expand uses the native tools.expand key (often `ctrl+o`). Disable with `messages.toolCards.enabled: false`.

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
- `messages.compactThinking.enabled: false` disables only Compact Thinking.
- `messages.compactThinking.shortcut` overrides the expand/collapse key.
- `messages.toolCards.enabled: false` disables only tool activity rows.
- Missing files select defaults without a diagnostic.
- Invalid JSON, version, or Messages root keeps Messages native and reports once. An invalid Compact Thinking section disables only Compact Thinking.
- RPC, JSON, and print modes always behave natively.
