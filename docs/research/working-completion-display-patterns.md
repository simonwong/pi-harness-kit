# Research: Working completion display patterns in terminal coding agents

## Summary

Two strong patterns exist. Codex and OpenCode convert work into durable transcript metadata; Gemini CLI and Pi remove the editor-adjacent working row when the turn becomes idle. Claude Code documents a post-response duration line, but its renderer is proprietary, so exact anchoring and replacement behavior cannot be verified from primary source code.

For Pi UI, prefer **latest outcome persistent above the editor until the next task**, but keep it terse and state-specific: `Completed · 4m 59s`, `Cancelled · 18s`, or `Failed · 12s`. This fills Pi’s current missing “done” signal without adding one permanent row per turn. Do not use `Worked for 4m 59s`: that wording is now shared by Codex and Claude Code, but remains a product-style phrase rather than an established terminal-agent convention.

## Product decision after research

The maintainer selected the recommended persistence model but deliberately chose the more personable `Worked for 4m 59s` success copy. Active elapsed time uses the same `4m 59s` grammar. Cancellation and error keep state-specific wording, and exact provider error evidence remains available in Pi's native Transcript.

## Scope and evidence rules

“Observed” means directly established by official source, official tests/snapshots, first-party docs, changelog, or official-repo assets. “Inference” means the source establishes state and rendering structure but not every terminal-frame detail. Repository issue reports are used only when they contain first-party code paths or official product screenshots/maintainer statements; user reports alone are not treated as normative behavior.

## Comparison

| Product | Active row | Successful completion | Persistence / next turn | Duration, tokens, cost | Cancellation / error |
|---|---|---|---|---|---|
| **OpenAI Codex CLI** | Fixed above composer: `Working (0s • esc to interrupt)`; animated when enabled. | Active row stops. For turns with recorded work, a `Worked for …` final separator is inserted into transcript history; short durations under 60s may omit the label. | Durable history/scrollback cell. Later turns append their own user/work/output/history cells; old separator remains in transcript. | Duration yes. No token or cost in this separator; runtime timing metrics may join it in diagnostic configurations. Tokens/cost can live in separate configurable status surfaces. | Esc sends interrupt. Primary evidence confirms an interrupted-conversation history message exists, but exact completion-separator copy after interruption is not established here. |
| **Anthropic Claude Code** | Live spinner with configurable present-tense verbs; exact renderer unavailable. | Official docs: post-response turn-duration message, e.g. `Cooked for 1m 6s`; changelog examples include `Worked for 5s` and `✻ Sautéed for 23s · done 6:05 PM`. | Docs say “after responses,” strongly suggesting transcript placement. Exact lifetime, scrollback semantics, and what replaces it next turn are **not verifiable** from the proprietary renderer. | Duration yes; recent changelog adds completion clock time. No primary evidence that token or cost is in this line; cost/duration can appear in separate status line. | Not established from primary renderer evidence. |
| **Google Gemini CLI** | `LoadingIndicator` near composer only when `StreamingState.Responding`; hidden while confirmation/action is pending. Copy derives from thought/loading phrase, so not one fixed completion phrase. | No completion row. Indicator disappears as state becomes `Idle`; editor/footer affordances return. | Zero persistence. Next turn recreates loading indicator only while responding. Transcript retains assistant/tool output, not a turn-outcome line. | Active elapsed time exists in UI state; no completion duration/token/cost line. | Full cancellation writes durable `Request cancelled.` info into history; cancelled tools are recorded with cancelled state. Errors are added as error history items. |
| **OpenCode** | Thinking/tool spinners are transcript-local and/or session-running UI; current TUI tracks incomplete assistant messages and tool states. | Durable assistant footer/header: `▣ Build · gpt-5 · 2.8s` (agent, model, duration). One summary is emitted for the final assistant message of a multi-step turn. | Written to scrollback/transcript and replayed on resume. Next turn appends another user turn and later another summary; earlier summary remains. | Duration yes. Default assistant summary shown by primary tests has no token/cost. Prompt/footer separately shows token context and aggregate cost. | Existing header can append `· interrupted`; first-party PR documents abnormal variants such as `· truncated by length limit`, `· stopped by content filter`, and `· ended with error`. |
| **Pi** | Dedicated `statusContainer` immediately above widgets/editor; default live copy is `Working...`. Extension API can customize or hide it. | No completion row. Core creates/clears the loader around agent lifecycle; final assistant/tool messages remain in transcript. | Zero persistence for working outcome. On next turn `Working...` is created again. Footer may continue to show session/model/context data, but not a turn outcome. | No duration/token/cost in the working row or a completion row. | Escape aborts and restores queued messages to editor. Assistant/tool error rendering persists in transcript, but Pi does not turn the working row into a cancellation/error outcome. |

## Findings

### 1. OpenAI Codex CLI: active fixed row, then durable transcript separator

**Observed.** Codex describes `StatusIndicatorWidget` as “a live task status row rendered above the composer.” Its default header is `Working`; the non-animated snapshot assertion is exactly `Working (0s • esc to interrupt)`. [Official source](https://github.com/openai/codex/blob/2230d644/codex-rs/tui/src/status_indicator_widget.rs)

**Observed.** On task completion, Codex finalizes streams, constructs `FinalMessageSeparator`, and sends it through `add_to_history`; only afterward does it finish turn lifecycle and update the task-running state. The completion separator is gated to turns that performed work such as commands, MCP calls, or patches, not purely conversational turns. [Official source](https://github.com/openai/codex/blob/27c05a52/codex-rs/tui/src/chatwidget/turn_runtime.rs) [State documentation](https://github.com/openai/codex/blob/178c3d30/codex-rs/tui/src/chatwidget.rs)

**Observed.** OpenAI’s completion-timing change names the final display `Worked for ...`, uses protocol `duration_ms` for cumulative turn duration, and keeps mid-turn separators unclocked. [Official PR](https://github.com/openai/codex/pull/19929) A separate first-party change hides the label below one minute, so `Worked for …` is not guaranteed on every completed work turn. [Official PR](https://github.com/openai/codex/pull/10452)

**Inference.** Because this is inserted as a history cell in an inline-viewport TUI whose history is written to normal terminal scrollback, it persists as transcript/scrollback rather than staying attached above the editor. [History event](https://github.com/openai/codex/blob/fbe65995/codex-rs/tui/src/app_event.rs) [TUI scrollback source](https://github.com/openai/codex/blob/31519549/codex-rs/tui/src/tui.rs)

**Cancellation/error.** Esc dispatches interrupt from the live row. An OpenAI manual validation records that interruption shows an “interrupted-conversation message,” but the exact copy is not exposed in that source. [Official PR](https://github.com/openai/codex/pull/28813) Therefore: interrupt state is durable, exact wording unresolved.

### 2. Claude Code: documented post-response line; proprietary placement remains unverifiable

**Observed.** Claude Code’s official settings define `showTurnDuration` as showing turn-duration messages “after responses,” default `true`, example `Cooked for 1m 6s`. `spinnerVerbs` now applies only while a turn is in progress. [First-party settings](https://code.claude.com/docs/en/settings)

**Observed.** Official changelog entries establish several exact variants over time:

- `Cooked for 1m 6s` as the duration-line example. [Official changelog snapshot](https://github.com/anthropics/claude-code/blob/74cc597e/CHANGELOG.md)
- Built-in post-turn past tense such as `Worked for 5s`. [Official changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- `✻ Sautéed for 23s · done 6:05 PM`, adding wall-clock completion time. [Official changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

**Unverified proprietary behavior.** Claude Code’s official repository does not publish its interactive renderer source. “After responses” establishes semantic order, not whether the row is a durable scrollback entry, a pinned editor-adjacent row, or a retained virtual transcript node. It also does not establish exact next-turn replacement, cancellation, or error behavior. Those questions cannot be answered confidently from primary evidence and should not be normalized from user issue reports.

### 3. Gemini CLI: disappearance, not completion transformation

**Observed.** Composer computes `showLoadingIndicator` only when streaming state equals `Responding` and no action-required UI is pending. When idle, it does not render the indicator and instead renders passive/editor affordances. [Official source](https://github.com/google-gemini/gemini-cli/blob/ce84b3cb/packages/cli/src/ui/components/Composer.tsx) Official tests confirm it renders while responding and does not render while waiting for confirmation. [Official tests](https://github.com/google-gemini/gemini-cli/blob/f8541cf7/packages/cli/src/ui/components/Composer.test.tsx)

**Observed.** No terminal-success history item is added merely because streaming becomes idle; the code clears per-turn tracking. Thus success has no exact completion copy, duration, token count, or cost. [Official stream source](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/hooks/useGeminiStream.ts)

**Observed.** Full cancellation adds the exact history info item `Request cancelled.`; pending shell/tool rows become `Cancelled`. Error events become durable error history items. [Official stream source](https://github.com/google-gemini/gemini-cli/blob/e9171fd7/packages/cli/src/ui/hooks/useGeminiStream.ts) [Agent-stream error source](https://github.com/google-gemini/gemini-cli/blob/f8541cf7/packages/cli/src/ui/hooks/useAgentStream.ts)

**Inference.** The next turn does not “replace” a success row because none exists. It re-enters `Responding`, recreating the active indicator in the same composer region.

### 4. OpenCode: transcript footer per completed turn

**Observed.** Official replay tests require a final system scrollback commit with exact text `▣ Build · gpt-5 · 2.8s`; it carries structured agent, model, and duration. Tests also require only one summary for the final assistant in a multi-step turn. [Official tests](https://github.com/anomalyco/opencode/blob/e23586af/packages/opencode/test/cli/run/session-replay.test.ts)

**Observed.** Because the same summary is generated during session replay, it is durable session/transcript metadata, not a transient editor row. Next turns append; old summaries replay and remain.

**Observed.** Token context and cost are separate prompt/footer data. The prompt computes last-message tokens/context and aggregate session cost; those do not appear in the default `▣ …` summary proven above. [Official source](https://github.com/anomalyco/opencode/blob/b6478dce/packages/tui/src/component/prompt/index.tsx)

**Observed.** OpenCode already adds `· interrupted` for `MessageAbortedError`. A first-party TUI change specifies other exact abnormal endings: `· truncated by length limit`, `· stopped by content filter`, and `· ended with error`. [Official PR](https://github.com/anomalyco/opencode/pull/25557)

### 5. Pi: live row cleared, no outcome artifact

**Observed.** Pi’s interactive layout puts `statusContainer` in the dock immediately above widgets and editor. The default working message is exactly `Working...`. [Official source](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/modes/interactive/interactive-mode.ts)

**Observed.** The extension contract calls this the “built-in interactive working loader row during streaming”; it can be hidden or have its indicator/message changed. [Official API source](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) Pi maintainers and implementation discussion identify the lifecycle as direct create/clear on `agent_start`/`agent_end`. [Official issue and maintainer resolution](https://github.com/badlogic/pi-mono/issues/2977)

**Observed.** Pi’s lifecycle docs distinguish `agent_end` from true `agent_settled` because retry, compaction, or queued follow-up may continue automatically. This is important for Pi UI: an outcome must use settled semantics, not simply the low-level `agent_end` event. [Official lifecycle docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)

**Observed.** Escape aborts active work and restores queued messages to the editor. [Official README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md) No primary source shows Pi replacing `Working...` with completed/cancelled/failed copy, duration, tokens, or cost.

## Recommendation for Pi UI

### Option A — no completion row

**Pros:** Native Pi behavior; zero idle clutter; no lifecycle ambiguity. Gemini validates this minimal pattern.

**Cons:** Weak done signal after long output; users must infer completion from spinner disappearance and editor readiness. This is exactly the ambiguity completion lines solve in Codex, Claude Code, and OpenCode.

### Option B — transient outcome

**Pros:** Strong momentary feedback; low long-term clutter.

**Cons:** Timeout is arbitrary, disappears when user looks away, causes redraw/layout churn, and gives poor accessibility unless announcements are carefully controlled. None of the products with strongly evidenced completion artifacts uses a timed-only success outcome as its defining pattern.

### Option C — latest outcome persistent above editor until next task — recommended

**Pros:** Clear idle truth at the point of next action; no transcript spam; only one row; next task naturally replaces outcome with live working state. It combines Pi/Gemini’s single editor-adjacent activity surface with Codex/OpenCode’s explicit terminal state.

**Design:** Treat Activity as one state machine:

- active: `Working · 4m 59s` plus interrupt affordance
- settled success: `Completed · 4m 59s`
- settled cancel: `Cancelled · 18s`
- settled failure: `Failed · 12s`
- next task: immediately replace prior outcome with active state

Persist only until next task starts, session surface changes, or user explicitly clears UI. Do not put token/cost in this row; those are ongoing inspector/status concerns and would make a simple outcome noisy. Derive success only at Pi’s true `agent_settled` boundary. For retries/compaction, keep Activity active and truthfully label the phase rather than flashing a false completion.

## Is `Worked for 4m 59s` established language?

**Not a general convention.** It is directly established in Codex and now appears as a Claude Code built-in example, so it is not exclusively Codex anymore. But Gemini, OpenCode, and Pi use different grammar: no success phrase, metadata footer, and row disappearance respectively. `Worked for` also describes effort rather than terminal outcome; it can be misread after cancel/error and requires separate grammar for abnormal endings.

Use neutral outcome-first copy in Pi UI: `Completed · 4m 59s`. This scales cleanly to `Cancelled` and `Failed`, localizes well, and avoids borrowing Codex/Claude personality language.

## Sources

### Kept

- OpenAI Codex `status_indicator_widget.rs` — exact active placement and copy.
- OpenAI Codex `turn_runtime.rs`, app event/TUI sources, and PR #19929 — completion timing, history insertion, scrollback architecture.
- Anthropic settings and official changelog — only authoritative public evidence for proprietary Claude Code.
- Gemini CLI Composer, tests, and stream hooks — direct conditional rendering and cancellation history behavior.
- OpenCode replay tests, prompt source, and PR #25557 — exact durable summary and abnormal-end copy.
- Pi interactive mode, extension API/docs, and README — exact native placement, lifecycle, and abort semantics.

### Dropped

- Third-party blog posts and comparison videos — not primary evidence.
- Unofficial screenshots — version and rendering path uncertain.
- Claude Code user issue claims about exact persistence — proprietary renderer prevents code-level verification.
- OpenCode feature-request mockups — proposals, not shipped behavior.
- Future-looking/unclear branch results without immutable or official-main support — avoided where they were not necessary.

## Gaps

- Claude Code’s exact row anchoring, scrollback lifetime, next-turn replacement, and cancel/error rendering remain unknowable from published primary renderer evidence. Manual capture against a pinned Claude Code release is the next step, but it would be observation rather than source verification.
- Codex changes quickly. The duration threshold and diagnostic runtime-metric additions may differ by release; pin implementation work to the target Codex release if pixel-level parity matters.
- Pi’s current main branch confirms no native success row, but the installed `@earendil-works/pi-coding-agent` fork/version may differ slightly. Validate final capability against the repository’s pinned package version before implementation.
