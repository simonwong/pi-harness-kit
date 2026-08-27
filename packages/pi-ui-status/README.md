# pi-ui-status

Private local-v1 package for the Pi UI Status Surface. Its first Capability enhances Pi's transient Working experience while preserving a Global and Capability-level Native Escape Hatch.

## Working

Working is enabled with zero configuration in Pi TUI mode. During one truthful operation it shows:

```text
<indicator> Cooking (↓ 1,284 1m 42s)
```

- Full motion uses Pi's official default Working Loader and its host-owned cadence. Pi UI does not imitate or replace that animation.
- Each operation chooses randomly from 28 whimsical verbs curated from Claude Code 2.1.233's built-in spinner table, then chooses another every ten seconds without an immediate repeat. Literal phase words such as `Thinking`, `Checking`, and `Processing` are excluded; the copy is ambient personality, not a progress claim.
- Elapsed time uses compact English units such as `42s`, `4m 59s`, or `1h 4m 59s`. Tone uses the active theme: accent before one minute, warning through `2m 59s`, and error from three minutes.
- Output usage is rendered as `↓ 1,284` from the exact cumulative `usage.output` reported by the provider. Until Pi receives usage, the output metric is omitted; Pi UI never estimates it from text.
- `agent_end` records only a pending low-level result. The elapsed operation spans retries, compaction, and queued continuation until `agent_settled`.

After final settlement, the latest outcome remains fixed above the editor in a muted tone until the next operation or session-surface replacement:

```text
Worked for 4m 59s
Cancelled after 18s
! Error after 12s: provider request failed
```

A new operation clears the prior outcome and reuses Pi's native Working row. The persistent outcome owns no timer. Error copy uses the final public assistant `errorMessage`, strips terminal control sequences, collapses whitespace, and uses `Unknown error` only when Pi has no error information. If settlement lacks a normal assistant `stop`, explicit cancellation, or explicit error, Pi UI remains neutral and publishes no outcome instead of guessing success. Native Transcript evidence remains authoritative.

## Configuration

Pi UI is zero-config by default. Optional versioned configuration is loaded once per extension instance from:

```text
<agent-dir>/pi-ui.json
<project>/.pi/pi-ui.json
```

Project configuration is read only when Pi trusts the project. Changes take effect after `/reload`.

```json
{
  "version": 1,
  "enabled": true,
  "motion": "full",
  "status": {
    "working": {
      "enabled": true
    }
  }
}
```

- `enabled: false` is the Global Native Escape Hatch and cannot be undone by project configuration.
- `status.working.enabled: false` disables only Working.
- `motion` accepts `full`, `reduced`, or `off`; layered configuration uses the most restrictive value.
- `reduced` replaces the animated Loader with a static `●`; random activity words keep the ten-second interval.
- `off` uses a faint static `·` and stable `Working` copy with no repeating Pi UI timer. Elapsed time can still refresh when Pi delivers provider events.
- Missing files select defaults without a diagnostic.
- Invalid JSON, version, or Status root keeps Status native and reports once. An invalid Working section disables only Working.

## Native behavior and limits

- RPC, JSON, and print modes are unchanged.
- Session shutdown and replacement clear owned timers/widgets and restore Pi's default Working message, visibility, and indicator.
- Pi exposes no ownership getter for the Working singleton. Compatibility with another Working extension therefore follows extension load order; Pi UI does not inspect private state or monkey patch the host.
- Full-motion Loader rendering, glyph selection, and animation timing belong to Pi. Pi UI customizes only the adjacent truthful activity message.

## Development

Load the root `pi-harness-kit` aggregate through `.pi/settings.json`. Do not also load this package directly in the same Pi session.

Run all gates with:

```sh
pnpm verify
```
