# Pi UI public-API architecture

Pi UI implements each selected Surface as an independent package whose only package interface is pi's default extension factory. Each package hides configuration, lifecycle, Capability state, rendering, motion, cleanup, and failure isolation behind one package-local Surface runtime.

## Goals

- Use only documented pi Extension and TUI interfaces.
- Keep Surface packages independently installable with no direct dependencies on one another.
- Give callers and tests one small, deep interface per Surface.
- Keep state decisions pure where practical and concentrate pi side effects at one seam.
- Preserve native behavior through the Native Escape Hatch when disabled, unsupported, invalid, or in conflict.
- Make reload and session replacement safe without file watchers or invented unregister operations.

## Non-goals

- A shared `pi-ui-core` runtime or generic Capability plugin framework.
- A wrapper that mirrors the whole `ExtensionAPI`.
- Live configuration mutation without `/reload`.
- Equivalent UI behavior in RPC, JSON, or print modes during v1.
- Arbitrary third-party tool decoration.

## Package interface and internal test seam

Every Surface package exports one extension entry:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function extension(pi: ExtensionAPI): void;
```

Its implementation delegates to one package-internal factory:

```ts
const extension = createStatusExtension(productionDependencies);
export default extension;

// Package-internal: imported by the entry and tests, not exported publicly.
function createStatusExtension(deps: StatusDependencies): ExtensionFactory;
```

The factory accepts only dependencies that genuinely vary:

- configuration source backed by the local filesystem or in-memory data;
- clock backed by system timers or a manual test clock;
- Skill catalog backed by pi commands/resources or an in-memory catalog;
- error reporter backed by one pi notification or a recording test sink.

Pi's documented `ExtensionAPI` and `ExtensionContext` remain the framework interface. Pi UI does not create a shallow facade that repeats their methods. Tests use a purpose-built recording pi harness at that same interface.

## Internal module shape

A Surface runtime directly composes narrow, Surface-specific deep modules. It does not expose a generic Capability contribution registry.

```text
pi event / renderer call / autocomplete request
                    │
                    ▼
          package-local Surface runtime
        ┌───────────┼────────────┐
        ▼           ▼            ▼
  config snapshot  Capability   effect/presentation
                  deep modules      application
```

Stateful Capabilities return ordinary state and presentation data:

```ts
const transition = working.update(previousState, event);
applyWorkingPresentation(ctx.ui, transition.presentation);
```

Stateless Capabilities keep the interface pi already provides:

- Markdown readability and Compact Thinking are synchronous transformers.
- Tool cards are complete built-in tool definitions that delegate execution and own renderers.
- Multi-Skill composition is an autocomplete/input module behind one composite provider.

`ExtensionContext`, TUI components, timer handles, and hard-coded ANSI strings never enter durable Capability state.

## Lifecycle

### Extension load

The factory may register inert event dispatchers and synchronous Markdown transformers. It starts no timer, watcher, process, terminal listener, or session-bound UI.

A transformer closes over the current runtime generation and returns its input unchanged before activation, while disabled, after shutdown, or on failure.

### `session_start`

The Surface runtime:

1. idempotently disposes any previous generation;
2. increments a generation token;
3. loads one immutable configuration snapshot;
4. exits without UI mutation when `ctx.mode !== "tui"`;
5. activates enabled Capabilities in explicit package order;
6. registers session-dependent resources such as autocomplete providers or supported built-in tool replacements;
7. applies initial presentation through documented `ctx.ui` methods.

Async work captures the generation token. A completion from an older generation is a no-op.

### Active session

- Pi events are normalized into the owning Surface's small event vocabulary.
- Stateful Capability transitions are synchronous; effects run after state replacement.
- Motion starts only for a truthful active state and stops on settle, cancel, error, disablement, or shutdown.
- Markdown transformations remain synchronous and inexpensive.
- UI writes are reconciled so unchanged keyed status/widget values are not written repeatedly.

### `session_shutdown`

Cleanup is idempotent and Capability-scoped:

- clear every owned timer and generation callback;
- invoke terminal-input unsubscribe functions;
- dispose owned TUI components;
- clear namespaced status and widget keys;
- restore default working message, visibility, indicator, or hidden-thinking label only when the Capability used that singleton;
- clear in-memory session state.

Pi owns event-handler and transformer registration for the extension instance. Pi UI does not invent unregister interfaces that pi does not expose; `/reload` and session replacement create a new extension runtime.

## Versioned configuration contract

Pi UI is zero-config by default. Optional files are loaded from:

```text
<getAgentDir()>/pi-ui.json
<ctx.cwd>/<CONFIG_DIR_NAME>/pi-ui.json
```

Project configuration is considered only when `ctx.isProjectTrusted()` is true.

```json
{
  "version": 1,
  "enabled": true,
  "motion": "full",
  "status": {
    "working": { "enabled": true },
    "statusCues": { "enabled": true }
  },
  "messages": {
    "markdown": { "enabled": true },
    "compactThinking": { "enabled": true },
    "toolCards": { "enabled": true }
  },
  "input": {
    "multiSkill": { "enabled": true }
  }
}
```

Each package independently parses only `version`, global controls, and its own Surface section. Unknown sections owned by other or future packages are ignored.

### Merge and safety rules

- Precedence is built-in defaults, then Global, then trusted project configuration.
- `enabled: false` at either configured layer disables the Surface; a project cannot override a Global kill switch.
- Motion uses the most restrictive configured value: `full` → `reduced` → `off`.
- A missing file selects defaults without notification.
- Invalid JSON, unsupported `version`, or an invalid relevant Surface root leaves that Surface native and reports once.
- An invalid Capability section disables only that Capability and reports once.
- Unknown fields and unrelated Surface sections are ignored for forward compatibility.
- The snapshot is immutable for one extension instance. Configuration changes require `/reload`.

The JSON contract is shared documentation, not imported runtime code. Repository contract tests run the same fixtures against every package-local parser to detect drift.

## Surface-specific pi seams

### Status

Uses documented lifecycle events and:

- `ctx.ui.setWorkingMessage()`;
- `ctx.ui.setWorkingVisible()`;
- `ctx.ui.setWorkingIndicator()`;
- namespaced `ctx.ui.setStatus()` and `ctx.ui.setWidget()`.

Pi's Working indicator animation is preferred over a custom timer when it can express the intended motion.

### Messages

Registers one ordered Markdown transformer. Markdown readability and Compact Thinking receive the previous transformer's output and return original input on failure. Stored session and model content remain unchanged.

Built-in tool cards:

1. inspect `pi.getAllTools()` and proceed only when the current tool source is builtin;
2. construct the original implementation through documented `create*Tool(ctx.cwd)` functions;
3. preserve schema, description, execution, updates, cancellation, result details, and error behavior;
4. replace only supported render slots and shell behavior;
5. leave third-party or already-overridden tools native.

### Input

Installs one composite autocomplete provider through `ctx.ui.addAutocompleteProvider()` during `session_start`. The provider gives explicit Pi UI triggers deterministic priority and delegates to the previous provider exactly once when no Pi UI syntax matches.

Multi-Skill insertion and submission transformations remain visible, understandable, and undoable.

Inline skill auto-popup needs an editor trigger that pi 0.84.x exposes only inside the editor implementation. `pi-ui-input` therefore claims the main editor component through the documented `ctx.ui.setEditorComponent()` seam: it subclasses the public `CustomEditor`, keeps every editing behavior native, and adds exactly one post-input check that opens the completion popup at inline `/` tokens. The undocumented autocomplete-open method is isolated in a small adapter with a runtime capability check; when it disappears, the editor silently degrades to Tab-forced completion plus the native line-start menu. The shared `CustomEditor` prototype is never patched. When another extension already owns the editor, `pi-ui-input` keeps that owner, warns once, and its autocomplete provider and submission expansion remain active.

## Resource ownership and conflicts

| Resource | Composition rule |
| --- | --- |
| status/widget | Keyed with `pi-ui:<surface>:<capability>` and cleared by owner |
| Markdown | Ordered chain; failure returns previous Markdown |
| autocomplete | Wrap current provider and delegate exactly once |
| built-in tool | Exclusive; override only when current source is builtin |
| custom editor | Claimed only by `pi-ui-input` via a `CustomEditor` subclass; an existing non-native owner wins and inline auto-popup degrades to Tab |
| footer/header | Not claimed in v1 |
| Working singleton | Owned only while Status Capability is enabled; unresolved ownership follows documented load order |
| hidden-thinking label | Touched only by Compact Thinking when needed; restore native default on shutdown |

When ownership can be detected, Pi UI yields to an existing non-native owner. For singleton setters without an ownership getter, load order remains an explicit compatibility limit rather than a private-API workaround.

## Rendering and motion

- State stores semantic tones such as `muted`, `accent`, `success`, and `error`, never pre-baked ANSI.
- Renderers use the current pi theme at render/application time.
- Theme-dependent cached content rebuilds during `invalidate()`.
- Every rendered line respects the supplied width, ANSI visible width, and wide CJK characters.
- Capability-owned clocks are injected and testable.
- Idle UI has no Pi UI timer.
- Reduced motion preserves state meaning with fewer/static frames; off uses static state.
- Unsupported repaint or mode behavior degrades to a static presentation.

## Error and native-fallback policy

- A Surface configuration failure leaves that Surface native.
- A Capability failure disables only that Capability for the runtime generation.
- Markdown failure returns the previous Markdown.
- Autocomplete failure delegates to the previous provider.
- Status/widget failure clears only owned keys.
- Built-in tool-card registration failure keeps the original tool.
- Renderer failure uses a lossless fallback where possible; delegated tool execution remains unchanged.
- Diagnostics are actionable and emitted once per package/runtime generation.

## Test architecture

The main integration test surface is `create<Surface>Extension(deps)` driven through a recording pi harness. Tests observe registered handlers, transformers, providers, tools, and UI writes at the same seam callers use.

Pure modules are also tested directly where their interface carries meaningful behavior:

- lifecycle and presentation transitions;
- configuration parsing, merge precedence, trust, and error isolation;
- Markdown transformation order and identity fallback;
- autocomplete trigger priority, delegation, insertion, removal, and IME-safe behavior;
- built-in tool execution/update/cancellation parity and rendering states;
- narrow widths, ANSI, CJK, semantic themes, and invalidation;
- full/reduced/off motion, fake-clock advancement, and zero idle timers;
- repeated start/shutdown/reload and stale-generation protection;
- TUI activation and non-TUI no-op behavior.

Filesystem configuration tests use temporary directories or in-memory sources. Motion uses a manual clock. Tool implementations use documented local-substitutable operations where available.

## Revisit triggers

Reconsider this architecture only when evidence provides a real second adapter or consumer:

- two Surface runtimes contain the same substantial implementation and tests;
- pi adds a renderer-only tool seam;
- RPC becomes a committed product Surface rather than a no-op mode;
- live configuration unloading gains documented unregister handles;
- a public aggregate or core package is justified by the npm installation journey.
