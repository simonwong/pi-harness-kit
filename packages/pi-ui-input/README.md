# pi-ui-input

Private local-v1 package for the Pi UI Input Surface. Its first Capability composes multiple Skills anywhere inside the editor while preserving IME, undo, paste, and submission semantics, with a Global and Capability-level Native Escape Hatch.

## Multi-Skill composition

Multi-Skill is enabled with zero configuration in Pi TUI mode:

```text
用 /research 调研这个 bug，再 /code-review 审查
```

- Typing `/` after whitespace on any line, or at the start of a later line, opens the skill completion popup. The first-line slash-command area stays owned by Pi's native command menu.
- `/xx` filters skills fuzzily by name; an empty query lists every skill. Paths (`/home/user`), URLs, fractions, and unknown names never open the popup; with no matching skills nothing appears.
- Confirming a candidate only fills text — it never submits. The inserted token is the full `/skill:name` plus one trailing space, so another skill can follow immediately. Inserted tokens are plain text: Backspace, kill-word, and undo behave natively.
- On submission, every known inline skill token expands into a `<skill>` block byte-identical to Pi's native `/skill:` expansion, prepended to the original message. A single leading token delegates to the native path untouched. Unknown tokens, tokens colliding with non-skill commands, and skills whose files fail to load stay literal in the prose.
- Every submission re-expands, so editing a SKILL.md takes effect on the next reference. There is no per-session "already loaded" tracking.
- steer and followUp submissions expand through the same native pipeline.

### Trigger seam and graceful degradation

Pi 0.84.x opens the completion popup programmatically only inside the editor. Following the PRODUCT.md public-first policy, `pi-ui-input` registers a `CustomEditor` subclass through the documented `setEditorComponent()` seam and isolates the undocumented autocomplete-open method in a small adapter with a runtime capability check:

- If the internal hook disappears in a future Pi version, inline `/` auto-popup silently degrades to Tab-forced completion (`/xx` then Tab) plus the native line-start menu. Nothing else changes.
- If another extension already owns the editor, Pi UI keeps that owner, warns once, and its provider and submission expansion stay active.
- The shared `CustomEditor` prototype is never patched, and no `dist/core` path is imported.

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
  "input": {
    "multiSkill": {
      "enabled": true
    }
  }
}
```

- `enabled: false` is the Global Native Escape Hatch and cannot be undone by project configuration.
- `input.multiSkill.enabled: false` disables only Multi-Skill composition.
- Missing files select defaults without a diagnostic.
- Invalid JSON, version, or Input root keeps Input native and reports once. An invalid Multi-Skill section disables only Multi-Skill.
- RPC, JSON, and print modes always behave natively.
