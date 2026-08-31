# pi-ui-messages

Private local-v1 package for the Pi UI Messages Surface. Its first Capability compactly presents model thinking in the TUI without changing stored session or export content.

## Compact Thinking

Compact Thinking is enabled with zero configuration in Pi TUI mode.

- While thinking streams, the block shows `⠋ Thinking (56 lines, alt+t to expand)` plus the latest three wrapped lines. The spinner advances when thinking text arrives. Live elapsed seconds stay on Pi's Working line.
- After the run ends, the block collapses to `Thought for 5s (60 lines collapsed, alt+t to expand)`.
- `alt+t` toggles compact form and the original thinking text (shown as `option+t` on macOS, `alt+t` on Windows/Linux). `/compact-thinking` does the same if the shortcut cannot be registered. `ctrl+t` keeps Pi's native hide/show.
- Durations persist as custom session entries and restore on session start and tree navigation. After a restore miss, the line still reports line count and omits duration rather than inventing one.
- Stored messages, `/export`, `/share`, and session jsonl stay full thinking text.

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
    }
  }
}
```

- `enabled: false` is the Global Native Escape Hatch and cannot be undone by project configuration.
- `messages.compactThinking.enabled: false` disables only Compact Thinking.
- `messages.compactThinking.shortcut` overrides the expand/collapse key.
- Missing files select defaults without a diagnostic.
- Invalid JSON, version, or Messages root keeps Messages native and reports once. An invalid Compact Thinking section disables only Compact Thinking.
- RPC, JSON, and print modes always behave natively.
