# Compact Thinking smoke

Ghostty-class check for `pi-ui-messages` Compact Thinking. Automated tests do not prove spinner cadence, wrap-height jitter, or shortcut feel.

## Setup

1. Use a scratch project whose `.pi/settings.json` loads this repository as a package and sets `"hideThinkingBlock": false`.
2. Drive a model that streams thinking (or a local OpenAI-compatible stub that emits `reasoning_content` deltas).
3. Run Pi in a 200-column TUI.

## Rows

| Step | Expect |
| --- | --- |
| Thinking starts | Header `⠋ Thinking · Xs (N lines, alt+t to expand)` plus the latest three wrapped thinking rows |
| Deltas continue | Header updates on the 100ms loop; tail follows the latest wrapped rows |
| First thinking ends, then tools/later thinking run | First block carries cumulative duration/line/tool facts; later thinking stays hidden |
| First non-empty assistant text arrives | Single settled `Thought for Xs, used N tools` when tools were observed; empty/whitespace-only segments do not split the trace |
| `alt+t` | All original thinking text returns in its original Transcript positions |
| `alt+t` again | Completed single line returns |
| `/compact-thinking` | Same toggle as `alt+t` |
| `ctrl+t` | Native hide/show; hidden label includes latest `Thinking · Xs · N lines` |
| `/reload` then inspect prior thinking | Compact line remains; duration present when the custom entry restored, otherwise line count only |
| `messages.compactThinking.enabled: false` then `/reload` | Native full thinking Markdown |
| RPC / print | Native, no compact header |

## Evidence

Current Ghostty acceptance is pending. Record the environment and result in the [Work Trace smoke matrix](./pi-ui-messages-tool-cards-smoke.md).

## Residual

- Mouse expand/collapse is out of scope.
- Identity requires the guarded Pi host adapter. Unsupported host shapes keep per-block thinking and native tool evidence.
