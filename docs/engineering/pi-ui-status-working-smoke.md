# Pi UI Status Working smoke

## Environment

- Date: 2026-08-27
- Terminal: Ghostty 1.3.1 (`TERM_PROGRAM=ghostty`, `TERM=xterm-256color`, `COLORTERM=truecolor`)
- Pi runtime: 0.84.3 interactive TUI; implementation compatibility target: public 0.84.x APIs, repository types pinned at 0.84.2
- Themes: current truecolor dark theme and `cc-light`
- Load path: `pi --no-extensions -e ./packages/pi-ui-status/src/index.ts ...`; loaded exactly once
- Capture: isolated `expect` and bounded `tmux` PTYs rendered from the Ghostty development terminal

## Exercised

- **Full / normal completion:** OpenAI Codex used Pi's official default Working Loader. PTY capture observed the host's full `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏` loop and confirmed that custom frames were absent. Pi UI supplied only whimsical activity/elapsed copy. Injected-RNG tests cover both ends of the 28-word pool, random first selection, the exact ten-second change boundary, and immediate-repeat exclusion; literal phase words are rejected. Final assistant output was followed by muted `Worked for 2s`; the settled row retained Pi's one-cell left inset, remained above the editor during a three-second idle observation, and owns no timer.
- **Cancellation:** An xhigh prompt was interrupted with Escape while `Vibing` was visible. Native abort evidence remained in the Transcript and settlement showed `Cancelled after 0s`; no success state appeared.
- **Controlled error:** DeepSeek was launched with a deliberately invalid API key. Native 401 evidence remained visible and settlement showed `! Error after 0s:` followed by the complete normalized public error information; `Unknown error` was not used. A local OpenAI-compatible smoke provider returned `连接失败，请检查 provider 配置` under `cc-light` at 40 columns; the CJK error, semantic theme ANSI, persistent outcome, and `visibleWidth <= 40` all passed.
- **Motion fallback:** Reduced motion was exercised in real TUI sessions at 20, 40, and 80 columns. Every capture contained static `●`, settled cancellation, and no line wider than the host width. Off used faint static `·`, stable `Working` copy, and no repeating Pi UI timer.
- **Capability disablement:** Trusted project configuration set `status.working.enabled: false`. The controlled provider error retained native behavior: no Pi UI activity word and no Pi UI outcome widget.
- **Retry and queued continuation:** A local smoke provider returned one 429, then successful SSE responses; a public-API smoke driver queued one follow-up. Pi made three requests, showed native retry evidence and the queued prompt, preserved one truthful operation, and published `Worked for …` only after final settlement.
- **Reload/replacement:** `/reload` produced a clean resource redraw with no stale Working row. Active-generation replacement, stale async activation, owned UI restoration, persistent-widget removal, and timer cleanup are covered deterministically at the Surface-factory seam.
- **Width/content:** Real TUI sessions covered 20, 40, and 80 columns. The owning outcome component is also exercised directly at 0, 1, 20, 40, and 80 columns with its native-aligned left inset, long durations, ANSI resets, current-theme rerendering, and CJK error information.
- **Timer cleanup:** Surface tests assert zero timers after success, cancellation, error, unknown settlement, shutdown, replacement, and UI-write fallback.

## Result

Pass for the implementation boundary: public Pi seams only, truthful lifecycle through `agent_settled`, complete error information, neutral unknown settlement, native fallback, one persistent latest-outcome row, host-owned official animation, and zero idle timers. Raw captures under `/tmp/pi-ui-*` are intentionally not repository artifacts.

## Known limit

Full-motion Loader appearance and cadence belong to Pi. Pi UI owns only adjacent factual copy and the settled outcome.
