# Pi UI Input Multi-Skill smoke evidence

Focused Ghostty-class terminal smoke for the `pi-ui-input` Multi-Skill Capability (#33). Environment: macOS, tmux PTY at 200 columns, Pi 0.84.3, local OpenAI-compatible recording server, project skill `smoke-skill` plus user skills. The repo aggregate loaded `pi-ui-input` and `pi-ui-status` together.

Harness (intentionally outside the repo):

- `/tmp/pi-ui-input-smoke/` — scratch project trusting the repository root package, with `.pi/skills/smoke-skill/SKILL.md` and a `pi-ui-smoke` provider extension.
- `/tmp/pi-ui-input-smoke-server.py` — records every request body to `/tmp/pi-ui-input-smoke-request-N.json` and answers SSE completions; first request sleeps six seconds so followUp queueing is observable.

## Editor behavior (tmux captures)

| Scenario | Evidence | Result |
| --- | --- | --- |
| Mid-text `/` auto-popup | `hello /` opened the skill-only popup listing all seven skills | Pass |
| `/xx` fuzzy filter | `hello /smo` reduced to `skill:smoke-skill` | Pass |
| Enter fills, never submits | Confirm inserted `hello /skill:smoke-skill ` (trailing space, caret after it); editor stayed open | Pass |
| Chained composition | `再 /coun` + Enter produced `hello /skill:smoke-skill 再 /skill:council-mode` | Pass |
| Path suppression | `cat /tmp/logs` opened no popup | Pass |
| First-line delegation | `/skill:smoke-skill` at message start opened the native command menu with scope tags and non-skill commands | Pass |
| Later-line head | `abc` + Ctrl+J + `/smo` opened the skill-only popup on line two | Pass |
| Dismissal | `hello /smo` + Escape closed the popup and left the typed text intact | Pass |
| Removal | after completing to `hello /skill:smoke-skill `, two Ctrl+W presses removed the token word-wise as plain text | Pass |
| Undo | Ctrl+- after a completion restored `hello /smo` as one native undo unit | Pass |
| Disabled escape hatch | `pi-ui.json` `input.multiSkill.enabled:false` + `/reload`; `hello /` opened nothing | Pass |

## Submission expansion (recorded request bodies)

- Two chained skills submitted as one message: the recorded user message is `<skill name="smoke-skill" …>…</skill>` + `<skill name="council-mode" …>…</skill>` + the literal original text — block format, `location`, and `References are relative to <dirname(SKILL.md)>.` byte-identical to native `/skill:` expansion.
- Single inline skill (`用 /skill:smoke-skill 测试`): recorded body shows one native block plus the literal text; the transcript rendered the native collapsible `✓ Skill smoke-skill` card because the transformed message matches Pi's single-block parser.
- followUp while busy: during the six-second first request, `追问 /skill:smoke-skill` queued and the second recorded request carried the expanded block, proving transform runs before native steer/followUp queueing.
- The run ended cleanly (`SMOKE_OK`, `Worked for 6s` from `pi-ui-status`), confirming both Surface packages coexist on one aggregate.

## Notes and limits

- Real IME composition cannot be simulated through tmux keystrokes; CJK prose around tokens (`用`, `再`, `追问`) was exercised directly. The provider is synchronous and performs no I/O, so composition latency is unaffected; Enter-during-composition remains native editor behavior. A manual Ghostty IME pass remains part of maintainer acceptance.
- Tab-forced degradation is unit-tested through the adapter's capability check (`resolveInlineSlashTrigger` returning undefined); it was not forced in the live session because the internal hook is present in Pi 0.84.3.
- Narrow-width behavior inherits the native autocomplete list rendering; no custom painting exists in this Capability.
