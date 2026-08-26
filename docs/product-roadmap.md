# Pi UI Product Roadmap

Pi UI advances through finite Release Horizons. The current Wayfinder effort delivers a local, daily-usable v1; npm publication starts as the next effort after that v1 passes its Ghostty acceptance gate.

## Decision rules

Every Capability must satisfy the product principles in [`PRODUCT.md`](../PRODUCT.md): it belongs to a clear Interface Zone, uses documented public pi APIs, reports truthful state, keeps semantic changes visible, and preserves the Native Escape Hatch. Capabilities with clear Surface value proceed from lower to higher implementation and maintenance risk.

Motion is owned by each Capability rather than delivered as a separate package or cross-package implementation. Each Capability specifies its own state transitions and feedback while the shared quality contract limits activity duration, refresh rate, disablement, and terminal degradation.

## Horizon 0 — Foundation

These decisions and tasks gate all feature implementation:

1. [选择公共 API 架构并记录必要 ADR](https://github.com/simonwong/pi-harness-kit/issues/8).
2. [定义 v1 质量门槛与 PR 契约](https://github.com/simonwong/pi-harness-kit/issues/9), recorded in the [Pi UI local-v1 quality contract](./engineering/pi-ui-v1-quality-contract.md).
3. [按需初始化首个扩展子包](https://github.com/simonwong/pi-harness-kit/issues/10), starting with `pi-ui-status`.

The foundation follows [ADR 0001](./adr/0001-organize-pi-ui-as-independent-surface-packages.md): one independent package per selected Surface, one extension entry per package, a shared configuration contract without a shared runtime, and an explicit root development aggregate.

## Horizon 1 — Local daily-usable v1

The v1 Release Scope contains six Capability PRs across three Surfaces. They are implemented sequentially from the latest `main`. Every Capability PR must satisfy the automated, conditional, documentation, and focused Ghostty gates in the [Pi UI local-v1 quality contract](./engineering/pi-ui-v1-quality-contract.md).

| Order | Capability | Surface | Public API seam | Risk | v1 boundary |
| --- | --- | --- | --- | --- | --- |
| 1 | [塑造并实现 Working 状态体验](https://github.com/simonwong/pi-harness-kit/issues/11) | Status | Working message/indicator and lifecycle events | S / low | Truthful run, cancel, completion, and error feedback with Capability-owned motion |
| 2 | [塑造并实现可组合的状态与目标提示](https://github.com/simonwong/pi-harness-kit/issues/19) | Status | Keyed status/widget APIs | M / medium | Useful phase, goal, and warning cues without taking over the singleton footer by default |
| 3 | [塑造并实现 Markdown 阅读体验](https://github.com/simonwong/pi-harness-kit/issues/12) | Messages | Markdown transformer and semantic theme tokens | S–M / low | Better scanning for structure, code, lists, quotes, and streaming without changing stored content |
| 4 | [塑造并实现编辑器内多 Skill 组合](https://github.com/simonwong/pi-harness-kit/issues/14) | Input | Autocomplete, input, and editor APIs | M / medium | Discover, insert, remove, and combine Skills anywhere while preserving IME, undo, and visible submission semantics |
| 5 | [塑造并实现 Compact Thinking](https://github.com/simonwong/pi-harness-kit/issues/13) | Messages | Thinking Markdown transformation and native thinking controls | M–L / medium-high | Improve streaming and compact presentation only where public APIs permit; unsupported behavior stays native |
| 6 | [塑造并实现紧凑工具调用卡](https://github.com/simonwong/pi-harness-kit/issues/15) | Messages | Public built-in tool constructors and custom renderers | L / high | Cover safely replaceable built-in tools; third-party or unsafe-to-decorate tools retain native rendering |

### Motion contract

Each selected Capability owns its motion:

- Working controls its active indicator and terminal state feedback.
- Status cues control their appearance, update, and disappearance.
- Markdown uses motion only for meaningful streaming or state feedback.
- Multi-Skill composition owns autocomplete, selection, insertion, and submission feedback.
- Compact Thinking owns its supported streaming and expand/collapse feedback.
- Tool cards own pending, parallel, success, error, and expansion feedback.

Idle UI remains still. No motion can invent progress, hide evidence, or become required to understand state.

### v1 completion gate

After all selected Capability PRs are merged:

1. [在 Ghostty 中完成集成日用验收](https://github.com/simonwong/pi-harness-kit/issues/17), including streaming, parallel tools, errors, cancellation, thinking, Markdown, complex input, narrow widths, theme changes, and performance.
2. [完成本地 v1 收口与后续路标](https://github.com/simonwong/pi-harness-kit/issues/18), with all selected work on `main`, local enablement instructions, and no unresolved acceptance failures.

## Horizon 2 — Publish the npm v1

Once local v1 acceptance passes, start a fresh publication effort. It should decide and execute:

- the real npm owner scope and exact-name/near-name checks;
- publishable versions and compatibility policy;
- removal of `private` from selected Surface packages;
- correct pi peer dependencies, package manifests, files, licenses, READMEs, and gallery metadata;
- npm-install and git-install smoke tests from clean environments;
- the one-install user journey and whether it proves a public `pi-ui` aggregate package is warranted.

This horizon publishes the already accepted v1; it does not silently expand the v1 Capability scope.

## Horizon 3 — Context and orientation

[塑造并实现 Context Health 检查器](https://github.com/simonwong/pi-harness-kit/issues/20) is deliberately outside the current v1. A later effort may prototype an actionable Inspector that explains context usage and recommends compacting or splitting work without becoming a permanent dashboard.

## Later possibilities

Future Roadmaps may consider deeper Input workflows, fullscreen or mouse-enhanced Transcript interaction, broader terminal compatibility, and third-party tool renderer support if pi gains a clean renderer-only extension seam. These are directions, not commitments.
