# Product

<!-- impeccable:product-schema 1 -->

## Platform

terminal

## Stack

A TypeScript multi-package repository built against the documented `@earendil-works/pi-coding-agent` Extension and TUI APIs. Pi UI is composed of independently installable Surface packages; the repository root is the local development aggregate. The package-local runtime architecture is defined in [`docs/architecture/pi-ui-public-api.md`](docs/architecture/pi-ui-public-api.md).

## Users

The primary user is a pi user working through long, tool-heavy coding sessions in a terminal. The local v1 is evaluated in the maintainer's Ghostty and truecolor workflow before any public release commitment.

## Product Purpose

Make pi easier and more pleasant to operate by improving how users compose requests, scan conversation evidence, understand current activity, and inspect context. Success means a local v1 that feels calmer, clearer, and faster without turning pi into a clone of another coding agent.

## Positioning

Pi UI is a lightweight, pi-native UI/UX extension family: it borrows proven information architecture from Claude Code, Codex, and existing pi extensions while remaining incremental, reversible, theme-native, and public-first in its use of pi APIs.

## Operating Context

The product runs inside pi's terminal interface during streaming responses, parallel tool calls, long outputs, errors, cancellation, context growth, and complex prompt composition. Initial acceptance targets Ghostty with truecolor and includes graceful behavior at narrower terminal widths.

## Capabilities and Constraints

- Product capabilities are organized into Composer, Transcript, Activity, and Inspector zones; Host Chrome is a scarce host surface, not a product zone.
- The product family is **Pi UI** within the multi-product `pi-harness-kit` repository. The v1 Release Scope and implementation order are defined in [`docs/product-roadmap.md`](docs/product-roadmap.md).
- Each selected Surface is created just in time as one `packages/pi-ui-<surface>` package with one extension entry, `version: 0.0.0`, and `private: true`; empty Surface packages are not pre-created.
- `pi-ui-messages`, `pi-ui-input`, `pi-ui-status`, and `pi-ui-inspector` are default Surface forms. An owner scope and publishable versions are chosen only in a future npm publication effort.
- Capabilities remain independently configurable inside their owning Surface package. A Capability becomes its own package only when independent installation, dependencies, compatibility risk, or release cadence creates a real boundary.
- Surface packages do not directly depend on one another. Cross-Surface Capabilities belong to their primary user-entry Surface and may render in secondary Surfaces through public pi APIs.
- Surface packages share a versioned, two-layer `pi-ui.json` contract, including a global `enabled` escape hatch and motion preference, but no shared runtime. Each package exposes only pi's default extension entry and keeps its runtime/test seam package-local. A core or internal shared package requires at least two real, non-trivial consumers.
- The root `pi-harness-kit` manifest explicitly aggregates only entries in the current Release Scope, and `.pi/settings.json` loads that root. A Surface entry must not also be loaded directly in the same environment.
- No public `pi-ui` aggregate/meta package exists until a publication effort proves a one-install user journey.
- The local v1 is public-first and never forks pi. When no public seam exists for an accepted product behavior, a narrowly scoped internal (undocumented) call is allowed: it must be isolated in a small adapter module, guarded by a runtime capability check, degrade gracefully to native/public behavior when the seam disappears, and be re-verified on every pi upgrade because packages upgrade in lockstep with pi. Monkey-patching shared prototypes and deep-importing `dist/core` paths remain forbidden. TUI is the only enhanced mode in v1; RPC, JSON, and print modes safely preserve native behavior.
- npm publication is the Release Horizon immediately after local v1 acceptance. A public stability promise and broad terminal compatibility matrix must be decided in that fresh publication effort.
- Every selected feature is developed as an atomic commit and independent PR, in sequence from the latest `main`; it must satisfy the [Pi UI local-v1 quality contract](docs/engineering/pi-ui-v1-quality-contract.md), and merge requires maintainer confirmation.

## Brand Commitments

The experience is pi-native rather than a pixel-level Claude Code or Codex imitation. It uses the active pi theme's semantic language; personality comes from hierarchy, rhythm, copy, and restrained motion rather than a forced brand palette.

Naming is descriptive and Surface-first: **Pi UI** is the product family, `pi-ui-*` is the package family token, and `better-*` is excluded. Exact package names are chosen only when a package boundary is real, followed by an npm registry and near-name check.

## Evidence on Hand

- [Pi UI public-API architecture](docs/architecture/pi-ui-public-api.md)
- [Pi UI local-v1 quality contract](docs/engineering/pi-ui-v1-quality-contract.md)
- [Pi extension testing-practices research](docs/research/pi-extension-testing-practices.md)
- [Pi UI Product Roadmap](docs/product-roadmap.md)
- [Pi UI/UX extension landscape research](https://github.com/simonwong/pi-harness-kit/blob/research/pi-ui-ux-landscape/docs/research/pi-ui-ux-landscape.md)
- [Extension naming and package topology research](https://github.com/simonwong/pi-harness-kit/blob/research/pi-extension-naming/docs/research/pi-extension-naming-and-topology.md)
- No user study, benchmark, public compatibility evidence, or stable release evidence exists yet; future work must not fabricate it.

## Product Principles

- **Do not interrupt expression:** Composer enhancements reduce syntax recall and mode switching while preserving understandable, reversible user intent.
- **Scan first, then inspect evidence:** Transcript defaults to compact, truthful summaries whose underlying evidence remains losslessly recoverable.
- **Stay calm and truthful:** Activity reflects real state, never invented progress; continuous ambient motion exists only while the agent is active.
- **Make depth actionable:** Inspector reveals detail on demand so the user can compact, expand, configure, or troubleshoot.
- **Enhance incrementally:** Capabilities have useful defaults, remain individually reversible, and retain a clear escape hatch back to native pi behavior.

## Accessibility & Inclusion

Primary actions remain keyboard-reachable, motion can be disabled, and idle UI remains still. Composer work must preserve terminal IME behavior; rendered output must account for narrow widths and wide CJK characters.
