# Use a layered, versioned Pi UI configuration contract

Pi UI uses optional versioned `pi-ui.json` files at the user agent directory and trusted project config directory. Packages independently parse global controls and their own Surface section, merging built-in defaults, Global settings, then trusted project settings without importing a shared runtime. Global disablement is a hard Native Escape Hatch, motion uses the most restrictive configured level, unrelated Surface keys are ignored, and configuration changes take effect through `/reload` rather than watchers or polling.

## Consequences

- Missing files use zero-config defaults; invalid JSON, version, or Surface roots leave only that Surface native and emit one actionable diagnostic.
- Invalid Capability sections disable only that Capability.
- The project layer is ignored unless pi reports the project trusted.
- Repository contract fixtures run against every package-local parser to detect schema drift.
- Live Capability unloading is not promised until pi provides documented registration disposal interfaces.
