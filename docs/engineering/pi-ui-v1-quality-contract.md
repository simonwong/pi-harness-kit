# Pi UI local-v1 quality contract

This standard defines when a Pi UI Capability PR is complete during the local daily-usable v1 Horizon. It is intentionally stronger than a lint-only gate and lighter than a publication-grade compatibility program.

The contract applies to the six Capability PRs in [`docs/product-roadmap.md`](../product-roadmap.md). It evolves as implementation evidence appears; it is an engineering standard, not an ADR.

## Definition of Done

A Capability PR is complete only when all of the following are true:

1. It starts from the latest `main` and contains one Capability, one atomic commit, and one independent PR.
2. Its acceptance scenarios and owning Surface/public pi seam are explicit.
3. Implementation proceeds in behavior-first vertical slices at the agreed test seams.
4. Primary behavior, disablement, native fallback, and relevant failure paths have automated evidence.
5. Every applicable conditional gate in this document has evidence. An inapplicable gate is marked **N/A** in the PR with a seam-specific reason.
6. `pnpm verify` passes locally and in the repository quality CI job.
7. A focused Ghostty/truecolor smoke is recorded for the user-visible Capability.
8. User-visible configuration or usage changes update the owning package documentation.
9. Residual limitations are explicit. A known failure inside the ticket boundary is merge-blocking rather than silently deferred.
10. The maintainer confirms merge after tests and review pass.

## Executable baseline

Issue [#10](https://github.com/simonwong/pi-harness-kit/issues/10) establishes the baseline before the first Capability implementation:

- directly pinned TypeScript, Vitest, and Node type development dependencies;
- one root `pnpm verify` command that runs static checks, TypeScript typechecking, and the complete test suite;
- one reproducible Linux quality CI job that performs a frozen pnpm install and runs `pnpm verify`;
- no Node, operating-system, or terminal matrix during local v1;
- no `--passWithNoTests`, focused tests, or skipped merge-gate tests;
- the first package-local recording pi harness and versioned configuration-contract fixtures.

The CI command is the same command developers run locally. Separate required lint/type/test statuses, coverage services, and benchmark jobs are not part of the v1 gate.

## Test layers

Pi's v0.84.2 documentation explicitly recommends `pi -e ./extension.ts` as a quick extension test, but does not prescribe an automated runner or third-party test harness. Pi UI follows the layered first-party patterns summarized in [`docs/research/pi-extension-testing-practices.md`](../research/pi-extension-testing-practices.md).

### 1. Pure behavior

Test pure state transitions, Markdown transformations, autocomplete edits, frame selection, width allocation, and result mapping directly when their interface carries meaningful behavior.

Do not test private helper call order or mirror implementation branches.

### 2. Surface factory

The primary integration seam is the package-internal `create<Surface>Extension(deps)` factory from the [public-API architecture](../architecture/pi-ui-public-api.md). A package-local recording `ExtensionAPI` captures registrations and invokes callbacks through documented types.

Observe behavior callers and pi can see:

- event and transformer registration;
- UI writes and cleanup;
- transformed Markdown;
- autocomplete results and delegation;
- tool execution, updates, cancellation, results, and rendering;
- diagnostics and native fallback.

Keep the recording harness narrow. Do not build a complete fake pi API or ship a shared production runtime for tests.

### 3. Public pi runtime

Use root-exported `createExtensionRuntime` or `ExtensionRunner` selectively when recording callbacks cannot prove event chaining, context mode, middleware order, or session behavior. Do not force every test through a real runtime.

Never deep-import pi's upstream `test/` helpers or private `dist/core` paths. First-party test code is a pattern to reproduce locally, not a supported dependency.

### 4. Component contract

Call custom renderers/components directly, then exercise `render(width)`, `handleInput()` where present, and `invalidate()` where theme-dependent content is cached. Use public TUI width helpers for terminal-cell assertions.

A headless xterm or PTY harness is introduced only after a concrete compositing, cursor, resize, or regression case proves the need.

### 5. Real TUI

Run the extension through `pi -e` or the root development aggregate in Ghostty. Automated tests do not claim to prove font-dependent cell widths, IME candidate behavior, terminal resize races, flicker, perceived motion quality, or visual hierarchy.

## Required automated evidence

Every Capability PR includes:

- a primary behavior test through the owning Surface factory;
- default-enabled and Capability-disabled behavior;
- the Global Native Escape Hatch;
- the relevant native/delegated fallback;
- errors and cancellation introduced or handled by the Capability;
- configuration parsing or merge cases added by the Capability;
- no changed enhanced behavior in non-TUI modes;
- full repository regression through `pnpm verify`.

The first Capability in a new Surface additionally establishes its Surface baseline:

- extension load creates no session-bound resource;
- TUI `session_start` activates the configured runtime;
- shutdown is idempotent;
- repeated start disposes the prior generation;
- stale async completions cannot mutate the current generation;
- diagnostics are emitted once per runtime generation.

Later Capability PRs extend that baseline and do not need to duplicate unaffected tests.

## Conditional gates

| Implementation touches | Required evidence |
| --- | --- |
| Stateful lifecycle | Complete transition table for touched states; settle, cancellation, error, shutdown, replacement, and stale-generation behavior |
| Custom renderer or component | Width/ANSI/CJK/theme contract below; semantic assertions for all meaningful render states |
| Streaming or incremental updates | Safe partial inputs, deterministic final state, no redundant unchanged writes, and stale update rejection |
| Capability-owned motion or delay | Full/reduced/off, manual clock, zero idle timers, cadence/duration limits, and cleanup on every terminal path |
| Markdown transformer | Previous-output composition, synchronous identity fallback, partial constructs, stored-content immutability, and no hot-path I/O |
| Autocomplete/input | Deterministic priority, previous-provider delegation exactly once, insertion/removal/undo/dismissal, and failure delegation |
| Tool replacement | Builtin-source guard plus execution, update, cancellation, error, result/detail, and renderer fallback parity |
| Configuration parser | Canonical shared fixtures for missing/valid/malformed/version/trust/precedence/kill-switch/motion/Capability isolation behavior |
| Theme-dependent cached output | Two distinct semantic test themes and `invalidate()` rebuilding without stale theme data |

A pure-module test may supplement these gates but does not replace observable proof at the owning seam.

## Rendering contract

When Pi UI owns a custom renderer or component, automated tests render at widths **1, 20, 40, and 80** and assert:

- rendering does not throw, loop, or produce a negative allocation;
- every line satisfies `visibleWidth(line) <= width`;
- truncation/wrapping preserves ANSI resets and does not split terminal control sequences;
- fixtures include wide CJK text as well as styled ANSI text;
- state meaning remains clear without relying only on color;
- semantic theme changes are reflected after rerender/invalidation;
- omitted compact detail remains losslessly recoverable through expansion or native fallback.

When Pi owns the component and Pi UI supplies only plain strings, do not fabricate a renderer contract. Assert semantic string content and the absence of hard-coded layout/ANSI assumptions, then verify host wrapping in the focused Ghostty smoke.

Snapshots may supplement stable multiline output, but a snapshot approval alone is not evidence of width, semantics, fallback, or accessibility.

## Motion and structural performance

Capability-owned motion follows deterministic, testable limits:

- extension load and idle state have zero Pi UI-owned repeating timers;
- a real ongoing state may remain visible for its truthful lifetime, but motion stops immediately when that state ends;
- custom periodic motion updates no faster than **10 Hz** (`interval >= 100 ms`);
- pi-hosted animation is exempt when pi owns its cadence;
- a decorative terminal-state transition is deterministic and ends within **2 seconds**;
- `motion: reduced` has a smaller/static transition and `motion: off` has no Capability-owned timer;
- no state meaning depends on animation;
- unchanged presentation is not written repeatedly;
- synchronous transform, render, and autocomplete paths perform no filesystem or network I/O;
- session state does not accumulate unbounded event or render history.

Tests use an injected manual clock rather than wall-clock sleeps. Local v1 has no CI latency budget or benchmark suite. A numerical performance claim requires its own measured baseline, method, environment, and result.

## Focused Ghostty smoke

Every user-visible Capability PR records a brief real-terminal result. Screenshots or recordings are optional and do not replace scenario evidence.

```md
## Ghostty smoke

- Environment: Ghostty <version>, truecolor, <pi theme>
- Load path: <root aggregate or pi -e path; loaded exactly once>
- Exercised: <primary active and settled states>
- Fallback: <Capability disabled/native/error path and /reload>
- Width/content: <normal width, constrained width, relevant CJK/ANSI>
- Motion: <full/reduced/off, or N/A with reason>
- Result: <pass/fail and observations>
- Known/deferred: <none or ticket-boundary item>
```

The focused scenario depends on the Capability:

- Working and status cues cover success, cancellation, error, settlement, disablement, and stale-state absence.
- Markdown, thinking, and tool cards cover streaming/partial content, narrow output, and lossless detail/fallback.
- Multi-Skill input uses a real IME and covers composition, discovery, combination, removal, undo, dismissal, submission, and native completion delegation.
- Tool cards invoke at least one real supported builtin; the final integration gate exercises the full parallel/error/cancellation mix.

## Pi UI Capability PR evidence

Copy this section into a Capability PR body:

```md
## Capability

- Issue:
- Surface:
- Capability:
- Public pi seam:

## Behavioral contract

| Input/event | Expected presentation or action | Native/failure fallback |
| --- | --- | --- |
|  |  |  |

## Automated evidence

- [ ] `pnpm verify`
- [ ] Surface-factory vertical slice
- [ ] Capability disablement and Global Native Escape Hatch
- [ ] Relevant native/delegated failure fallback
- [ ] Relevant lifecycle/reload/non-TUI checks
- [ ] Renderer/ANSI/CJK/theme: pass or N/A — <reason>
- [ ] Motion/full-reduced-off: pass or N/A — <reason>
- [ ] Input/delegation/IME automation: pass or N/A — <reason>
- [ ] Tool execution/update/cancellation parity: pass or N/A — <reason>
- [ ] Configuration contract fixtures: pass or N/A — <reason>

## Ghostty smoke

- Environment:
- Load path:
- Exercised:
- Fallback:
- Width/content:
- Motion:
- Result:

## Documentation and limits

- Documentation changed:
- Residual limitations:
- Deferred only outside this ticket:
```

## Final local-v1 integration boundary

Issue [#17](https://github.com/simonwong/pi-harness-kit/issues/17), not every Capability PR, owns the complete integrated matrix:

- all three Surface packages and six Capabilities enabled together;
- complex real-IME input and multiple Skills;
- streaming thinking and structured Markdown;
- Working and keyed status cues;
- parallel tools with updates, success, failure, and cancellation;
- expansion and native evidence recovery;
- runtime resize, constrained widths, CJK, theme invalidation, and `/reload`;
- aggregate full/reduced/off behavior and still idle UI;
- long-session observation for typing lag, repaint flicker, stalls, duplicated updates, and accumulating resources;
- the complete Global and per-Capability Native Escape Hatch.

A reproducible interaction-blocking stall or accumulating timer/listener/state behavior is an acceptance failure. Subjective concerns without reproduction are recorded as follow-up evidence rather than converted into fabricated benchmark numbers.

## Deferred beyond local v1

The following are deliberately not merge gates for this Horizon:

- line/branch coverage percentages or mutation testing;
- mandatory screenshots, full-conversation golden ANSI snapshots, or automated visual regression;
- Node, operating-system, or terminal CI matrices;
- broad terminal, font, mouse, image, hyperlink, or accessibility certification;
- npm tarball and clean npm/git installation tests;
- semver, public stability, and compatibility guarantees;
- benchmark suites without a demonstrated regression or hot path.

These belong to a later publication or evidence-driven effort rather than hidden v1 requirements.
