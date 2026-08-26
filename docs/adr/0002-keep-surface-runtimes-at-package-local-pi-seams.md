# Keep Surface runtimes at package-local pi seams

Each Pi UI Surface package exposes only pi's default extension factory and keeps one internal `create<Surface>Extension(deps)` seam for its entry and tests. Stateful Capabilities produce ordinary state and presentation data that the package-local Surface runtime applies through documented pi interfaces; stateless Markdown, renderer, and autocomplete modules keep the narrow interface pi already provides. Pi UI will not create a generic Capability Host, public plugin interface, or wrapper around the whole `ExtensionAPI`, because those abstractions would mirror pi, create framework tax, and drift independently across packages.

## Consequences

- Configuration, lifecycle, resource ownership, motion cleanup, diagnostics, and native fallback remain local to the owning Surface package.
- Filesystem, clock, Skill catalog, and reporting dependencies are injected only where production and test adapters both exist.
- Tests drive the same internal Surface factory used by the production entry through a recording pi harness.
- A shared runtime is reconsidered only after two Surface packages demonstrate the same substantial implementation and test behavior.
