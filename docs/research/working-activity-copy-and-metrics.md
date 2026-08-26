# Research: Working activity copy and metrics

## Summary

For Claude Code, Anthropic documents a configurable pool of in-progress `spinnerVerbs`, but publishes neither the built-in word list nor rotation cadence/selection algorithm. `Cooking` and six peers are directly attested by a user report in Anthropic's own issue tracker, not by an Anthropic-maintained canonical list.

For `@earendil-works/pi-coding-agent` 0.84.2, an in-process extension can read the current assistant message's cumulative `usage.output` on `message_update` and repaint the built-in Working row with public `ctx.ui` setters. This is provider-reported, per assistant message, and may stay zero until completion; a 1 Hz elapsed timer and threshold-based colors are supported without private imports.

## Findings

1. **Claude live copy: exact evidence, medium confidence.** Anthropic's settings reference defines `spinnerVerbs` as action words shown while a turn is in progress; `replace` uses only supplied words and `append` adds supplied words to defaults. This verifies a default pool and user control, but not its contents or algorithm. An Anthropic issue report explicitly identifies these observed defaults: **Vibing, Honking, Cooking, Concocting, Moseying, Sussing, Finagling**. Treat these seven as **first-party-tracker-attested observations**, not an official exhaustive list. [Official settings reference](https://code.claude.com/docs/en/settings-reference) · [Anthropic issue #41585](https://github.com/anthropics/claude-code/issues/41585)

2. **Do not mix live and completion words.** Anthropic documents `showTurnDuration` with the post-response example `Cooked for …`; issue evidence distinguishes present-tense live spinner words from past-tense completion text. Reports of `Baked`, `Brewed`, `Churned`, `Cogitated`, `Cooked`, `Crunched`, `Sautéed`, and `Worked` concern the completion pool, not proof of live words. [Official settings reference](https://code.claude.com/docs/en/settings-reference) · [Anthropic issue #24968](https://github.com/anthropics/claude-code/issues/24968) · [Anthropic issue #23347](https://github.com/anthropics/claude-code/issues/23347)

3. **Cadence and selection remain undocumented, high residual uncertainty.** Official docs only imply pool use through `append`/`replace`. No official doc, changelog entry, public source file, or distributed-package documentation found states random vs sequential selection, anti-repeat behavior, or rotation interval. User phrases such as “rotation” or “random” are observations, not a contract. Community-extracted “185/187 verb” lists and cadence claims are excluded as community guesses. Product copy should therefore use a small intentional local pool, not claim exact Claude parity.

4. **Pi's supported in-process observation point is `message_update`.** The public root exports `MessageStartEvent`, `MessageUpdateEvent`, `MessageEndEvent`, `AgentStartEvent`, `AgentEndEvent`, and `AgentSettledEvent`. `MessageUpdateEvent` has `message: AgentMessage` plus `assistantMessageEvent`; after `event.message.role === "assistant"`, `event.message.usage.output` is accessible. `message_start`/`message_end` cover all message roles; `message_update` is assistant-only. `agent_end` includes messages but can precede retry/compaction/follow-up; `agent_settled` is the reliable final cleanup point. [Pinned extension docs](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/docs/extensions.md) · [Pinned extension types](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/src/core/extensions/types.ts)

5. **Usage semantics: cumulative per streamed assistant message, not cumulative per run.** `AssistantMessage.usage` fields are `input`, `output`, `cacheRead`, `cacheWrite`, optional `cacheWrite1h`, optional `reasoning`, `totalTokens`, and `cost.{input,output,cacheRead,cacheWrite,total}`. Stream events carry a partial assistant message, whose `usage` is the latest cumulative provider report for that one response. `message_end` is authoritative. Across tool-driven turns, sum finalized assistant `usage.output` values and add—not re-sum—the current message's latest `usage.output`. [Pinned AI types](https://github.com/earendil-works/pi/blob/v0.84.2/packages/ai/src/types.ts) · [0.84.2 release](https://github.com/earendil-works/pi/releases/tag/v0.84.2)

6. **Live exact output count is conditional, medium product risk.** Pi 0.84.2 explicitly says cumulative usage “may remain zero when a provider only reports usage at completion.” Thus a Working row can show live output usage when the selected provider updates it, but no documented extension API can force exact live tokenization. Use `0`/omit/“—” until nonzero, then update; finalize from `message_end`. Do not derive exact token count from text deltas. [Pinned JSON-mode docs](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/docs/json.md) · [Pinned 0.84.2 changelog](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/CHANGELOG.md)

7. **Working row updates use documented public APIs.** `ctx.ui.setWorkingMessage(message?)` changes the row text; `setWorkingVisible(boolean)` shows/hides it; `setWorkingIndicator({frames, intervalMs})` configures its glyph animation. `ctx.ui.theme.fg(themeKey, text)` provides current-theme ANSI styling, so elapsed thresholds can change the row from e.g. `muted` to `warning` to `error`. These methods are TUI features; RPC implementations do not provide the loader row. [Pinned extension docs, Custom UI](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/docs/extensions.md#custom-ui) · [Pinned extension types](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/src/core/extensions/types.ts)

8. **A 1 Hz elapsed timer needs no private import.** On the first `agent_start` of a still-active operation, record `Date.now()` and start `setInterval(..., 1000)`; do not reset it on retry `agent_start`. Repaint from both the timer and `message_update`. Commit current-message output at assistant `message_end`; clear timer/state and restore setters at `agent_settled`; also clear on `session_shutdown`. This spans automatic retries/compaction/follow-ups correctly because `agent_end` is only a low-level boundary. Guard with `ctx.mode === "tui"`. Standard Node timers plus public lifecycle/UI APIs suffice.

9. **Root-export limitation, low severity.** Coding-agent's root exports the extension event types and `Theme`, but does **not** re-export `AssistantMessage` or `Usage`; its declaration file imports those from `@earendil-works/pi-ai` internally. An extension does not need either named type: role narrowing on `event.message` exposes `usage`. Avoid private `dist/...` imports. Importing `Usage` directly from `@earendil-works/pi-ai` is public for that package but should be a declared direct dependency if used. [Pinned root declaration source](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/src/index.ts)

10. **Thinking Orbs is a canvas reference, not a terminal-ready implementation.** The open-source `thinking-orbs` package describes its 20px inline preset as a separately tuned dotted animation rendered with plain 2D canvas. Its `working` mode uses particles moving on tilted orbits; reduced-motion renders a static representative frame. Pi's public Working indicator accepts single-line string frames, so production can borrow the orbit rhythm only through a compact terminal-native braille approximation—it cannot reproduce the canvas particle field without replacing the host component, which is outside v1. [Thinking Orbs README](https://github.com/Jakubantalik/Libraries/blob/main/packages/thinking-orbs/README.md) · [Working orbit engine](https://github.com/Jakubantalik/Libraries/blob/main/packages/thinking-orbs/src/engine/orbits.ts)

## Recommended state model

```ts
// Shape only; all used Pi members are public in 0.84.2.
let startedAt: number | undefined;
let completedOutput = 0;
let activeOutput = 0;
let timer: ReturnType<typeof setInterval> | undefined;

// first agent_start: start timer; message_update: activeOutput = usage.output
// assistant message_end: completedOutput += usage.output; activeOutput = 0
// display: completedOutput + activeOutput
// agent_settled/session_shutdown: clear timer and restore Working setters
```

Use the last reported value, not delta addition, during `message_update`: the value is cumulative for the active assistant message.

## Local official evidence (installed 0.84.2)

- `node_modules/@earendil-works/pi-coding-agent/package.json` — installed version `0.84.2`; public exports are `.`, `./rpc-entry`, and `./client`.
- `node_modules/@earendil-works/pi-coding-agent/dist/index.d.ts` — public root exports extension events and Working types; no `AssistantMessage`/`Usage` re-export.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` — exact event shapes; `setWorkingMessage`, `setWorkingVisible`, `setWorkingIndicator`; `ctx.ui.theme`.
- `node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — lifecycle guarantees and public Working UI examples.
- `node_modules/@earendil-works/pi-coding-agent/docs/json.md` — cumulative provider usage caveat and final-authoritative `message_end`.
- `node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md` — 0.84.2 streaming-usage fix.
- `pnpm-lock.yaml` — root and capability workspace resolve coding-agent to `0.84.2`.

## Sources

- **Kept:** Anthropic settings reference — official behavior contract for `spinnerVerbs` and duration display.
- **Kept:** Anthropic issue #41585 — direct report naming seven observed live words.
- **Kept:** Anthropic issues #24968 and #23347 — evidence separating live and completion pools.
- **Kept:** Pi v0.84.2 tagged docs, source/types, release, changelog, and installed package files — exact target-version API evidence.
- **Kept:** Thinking Orbs public demo and MIT-licensed source — exact reference behavior and implementation boundary for the requested orbit effect.
- **Dropped:** Community spinner-word repositories, gists, blogs, npm spinner clones, and “187 words” lists — not primary/first-party and often extracted from changing binaries.
- **Dropped:** Unpinned Pi `main` where a v0.84.2 tag exists — target requires 0.84.2.

## Gaps

Anthropic publishes no canonical live default list or cadence/selection contract. Exact live output usage cannot be guaranteed for providers that report usage only at stream completion. Validate visual repaint behavior in Pi TUI and define a product fallback for unknown live token counts; no private API can close the provider-reporting gap.
