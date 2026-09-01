## Ghostty smoke

- Environment: Ghostty, truecolor, active pi theme
- Load path: root aggregate `packages/pi-ui-messages/src/index.ts` (loaded once)
- Exercised: `ls`, `read`, `grep`/`find`, `bash` success and `exit 2`, `edit`/`write` under `/tmp`, parallel two tools, native expand, cancel
- Fallback: `messages.toolCards.enabled: false` then `/reload`; non-TUI unchanged
- Width/content: normal and ~20 cols; CJK path
- Motion: N/A — no card timer
- Result: pending
- Known/deferred: no model-written titles; thinking+tool count summary is not merged
