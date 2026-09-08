# Work Trace tool folding smoke

Ghostty-class check for first-thinking anchored Work Trace behavior. Automated tests do not prove host spacing, historical component invalidation, or native renderer fidelity.

## Setup

1. Load the repository root package in Pi TUI with `hideThinkingBlock: false`.
2. Use a model/provider that emits `thinking → tool → thinking → tool → text`.
3. Start at 80 columns; repeat width-sensitive checks near 20 columns.

## Matrix

| Step | Expect |
| --- | --- |
| First thinking streams | One `Thinking` header plus latest three wrapped rows |
| First builtin starts | Existing first block remains the visual anchor; builtin component folds after call ID joins the trace |
| Second thinking streams | First block updates; second thinking component contributes no compact rows |
| More tools complete | First summary accumulates observed tool count; no completion-order jump |
| First non-empty assistant text arrives | One settled `Thought for …, used N tools` before the reply; empty text does not split the trace |
| Tool call precedes text in one assistant message | Later execution-start events do not recount the call or move it under a new anchor |
| `alt+t` | Every original thinking block and full builtin call/result evidence returns in original order |
| `alt+t` again | First Thought returns; later thinking and controlled builtin evidence hide again |
| Pure builtin call without thinking | Native tool component remains visible |
| Todo | Call counts toward Thought; Todo native renderer may remain |
| Subagent | Call counts toward Thought; Subagent native renderer may remain |
| Unknown/custom tool | Call counts toward Thought; extension-owned renderer remains native |
| Parallel builtins | Expanded order matches invocation order |
| Failed/cancelled builtin | Expanded evidence preserves native error/cancellation copy |
| Assistant list/heading/link/emphasis/fence | White reply bullet appears without exposing Markdown tokens or flattening code |
| `/reload` and session-tree switch | First/later visibility and builtin fold membership restore |
| Identical thinking in separate messages | Each block retains its own trace, duration, and visibility after reload |
| Consecutive thinking blocks in one message | The joined section shows one cumulative summary with the full tool count |
| Read an image, then `alt+t` twice | Image and native call/result evidence expand and fold together |
| Expand a completed builtin with long output | Full output wraps without truncation; native diff/result renderers remain intact |
| Compact Thinking disabled, builtin fails | The standalone row includes `failed`, even without color |
| Width near 20 + CJK | No crash or unbounded custom summary rows |
| `messages.toolCards.enabled: false` | Thinking may compact, but every tool stays native |
| Global Native Escape Hatch | Entire Transcript stays native |
| RPC / print | Native output only |

## Environment

- Pi version: pending
- Ghostty version: pending
- Theme: pending
- Result: pending

## Automated host evidence

`tool-cards.test.ts`, `transcript-view.test.ts`, and `messages-extension.test.ts` exercise Pi's root-exported native components. They cover cached fold/expand transitions, native result parity, inline images, message identity, combined thinking runs, disposal, unsupported-host fallback, and native renderer timer cleanup. These checks do not replace the real-terminal matrix above.

## Accepted limitation

Pi exposes no renderer replacement seam for tools owned by another extension. Todo, Subagent, and arbitrary third-party native UI may remain beside the first Thought. No Gateway or package-specific patch is used.
