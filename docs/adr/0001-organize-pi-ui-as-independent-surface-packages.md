# Organize Pi UI as independent Surface packages

Pi UI will use one independently installable package per selected user-visible Surface, created only when that Surface enters a Release Scope. Each package owns one extension entry and keeps its Capabilities configurable inside that entry. Surface packages do not depend directly on one another; they share a configuration contract rather than a runtime library. The `pi-harness-kit` root is an explicit local development aggregate, while public core and aggregate packages remain deferred until real consumers or installation demand justify them.

## Considered Options

- **One Pi UI package with multiple Surface entries:** lower initial maintenance, but it hides the independent installation boundary the product wants users to recognize.
- **One package per Capability:** maximizes optionality but fragments installation, compatibility, documentation, and release management before those boundaries are real.
- **Shared core or aggregate package from the start:** centralizes code and installation, but creates version and dependency contracts without proven consumers.

## Consequences

- A Surface package is added just in time under `packages/pi-ui-<surface>`, with one extension entry, `version: 0.0.0`, and `private: true` during local v1 development.
- Capabilities spanning multiple Surfaces are owned by their primary user-entry Surface and use public pi APIs for secondary presentation.
- Every package reads its section of the shared Pi UI configuration contract and recognizes the global Native Escape Hatch.
- The root manifest lists Release Scope entries explicitly; local settings load the root aggregate, never the same Surface package a second time.
- Extracting a Capability package, shared runtime, public core, or public aggregate requires a new decision backed by a real installation, dependency, compatibility, or release boundary.
