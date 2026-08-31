# Compact Thinking smoke

Ghostty-class check for `pi-ui-messages` Compact Thinking. Automated tests do not prove spinner cadence, wrap-height jitter, or shortcut feel.

## Setup

1. Use a scratch project whose `.pi/settings.json` loads this repository as a package and sets `"hideThinkingBlock": false`.
2. Drive a model that streams thinking (or a local OpenAI-compatible stub that emits `reasoning_content` deltas).
3. Run Pi in a 200-column TUI.

## Rows

| Step | Expect |
| --- | --- |
| Thinking starts | Header `⠋ Thinking (N lines, alt+t to expand)` plus the latest three thinking lines |
| Deltas continue | Spinner glyph may change; tail window scrolls to the latest wrapped rows; Working line keeps elapsed time |
| Thinking ends | Single line `Thought for Xs (N lines collapsed, alt+t to expand)` |
| `alt+t` | Full thinking text, no header |
| `alt+t` again | Completed single line returns |
| `/compact-thinking` | Same toggle as `alt+t` |
| `ctrl+t` | Native hide/show; hidden label includes latest `Thinking · Xs · N lines` |
| `/reload` then inspect prior thinking | Compact line remains; duration present when the custom entry restored, otherwise line count only |
| `messages.compactThinking.enabled: false` then `/reload` | Native full thinking Markdown |
| RPC / print | Native, no compact header |

## Evidence (2026-08, Pi 0.84.3, tmux 200col)

Production package loaded via the repo aggregate. Stub streamed 60 `reasoning_content` lines:

- streaming: `⠋ Thinking (N lines, alt+t to expand)` + three tail lines
- completed: `Thought for 5s (60 lines collapsed, alt+t to expand)`
- `alt+t` restored the compact single line after expand

## Residual

- Streaming header has no live seconds; Working line owns elapsed time. Spinner only advances on `thinking_delta`.
- Mouse expand/collapse is out of scope.
- Wrap-heavy thinking can make the three source lines taller than three terminal rows; production counts source lines, not wrapped rows.
