# Research: open-source Markdown options for Pi UI issue #12

Accessed: **2026-08-27**. Primary sources only. Local evidence inspected: `docs/product-roadmap.md`, `docs/engineering/pi-ui-v1-quality-contract.md`, `PRODUCT.md`, `package.json`, `pnpm-lock.yaml`, and installed Pi 0.84.2 package manifests, declarations, docs, and compiled source.

## Summary

Do **not** replace Pi's renderer for issue #12. Pi 0.84.2 already exposes the right low-risk seam—`registerMarkdownTransformer()`—and its native `Markdown` component already owns Marked parsing, partial-fence stabilization, tables/lists/quotes, ANSI-safe CJK-aware wrapping, OSC 8 links, LaTeX, semantic themes, highlighting, caching, and width fallback. Prototype a small synchronous, source-preserving display transformer first; reuse Pi's public renderer/theme/width primitives rather than adding a second terminal rendering stack.

If structural rewriting proves too fragile without parsing, shortlist **Pi-exported `Marked` tokens** first, then **micromark/mdast** only for a proven AST requirement. Keep **Shiki**, `marked-terminal`, Ink renderers, `cli-markdown`, Glow/Glamour, and mdcat as design/reference material, not runtime dependencies.

## Findings

### 1. Product and public-seam constraints

1. **Issue boundary is incremental Messages enhancement, not stored-content conversion.** Roadmap defines issue #12 as better scanning for structure, code, lists, quotes, and streaming, using the “Markdown transformer and semantic theme tokens,” without changing stored content; risk S–M/low. The quality contract requires previous-transformer composition, synchronous identity fallback, safe partial constructs, stored-content immutability, no hot-path I/O, and unchanged non-TUI behavior. Local files: `docs/product-roadmap.md`, `docs/engineering/pi-ui-v1-quality-contract.md`, `PRODUCT.md`. Issue URL: [#12](https://github.com/simonwong/pi-harness-kit/issues/12).
2. **Pinned host is Pi 0.84.2.** Root has `@earendil-works/pi-coding-agent: ^0.84.2`; lockfile resolves 0.84.2. `@earendil-works/pi-tui` is directly pinned 0.84.2. TUI 0.84.2 requires Node `>=22.19.0` and depends only on `marked@18.0.5` and `get-east-asian-width@1.6.0`; coding-agent 0.84.2 includes `highlight.js@10.7.3`. Official manifests: [pi-tui package](https://www.npmjs.com/package/@earendil-works/pi-tui/v/0.84.2), [pi-coding-agent package](https://www.npmjs.com/package/@earendil-works/pi-coding-agent/v/0.84.2), [upstream repository](https://github.com/earendil-works/pi).
3. **Transformer is a documented root-exported synchronous API.** `MarkdownTransformer` receives `(markdown, { messageType, isStreaming, availableWidth })` and returns a string; registration order composes transformers. It affects user, assistant, and assistant-thinking transcript Markdown, while custom message/entry renderers are separate APIs. Source: [Pi extension docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [public extension types](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts).
4. **Severity: high—custom full-renderer path would exceed the supported seam.** The public API does not offer replacement of built-in assistant-message rendering. `registerMessageRenderer()` applies to extension-owned `CustomMessage`, not native assistant messages. Replacing transcript Markdown would therefore require private internals or content substitution, violating Product's public-API/native-fallback rules. Reuse native Markdown via transformer; do not deep-import `dist/core`.

### 2. Pi's existing renderer is already the strongest architecture fit

Pi TUI publicly exports `Markdown`, `MarkdownTheme`, `MarkdownOptions`, `Marked`, token types, `visibleWidth`, `wrapTextWithAnsi`, `truncateToWidth`, `sliceByColumn`, and `stripTerminalSequences`. Coding-agent publicly exports `Theme`, `getMarkdownTheme`, `highlightCode`, and `getLanguageFromPath`. Sources: [TUI exports](https://github.com/earendil-works/pi/blob/main/packages/tui/src/index.ts), [Markdown source](https://github.com/earendil-works/pi/blob/main/packages/tui/src/components/markdown.ts), [TUI README](https://github.com/earendil-works/pi/blob/main/packages/tui/README.md), [theme source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/theme/theme.ts).

| Concern | Pi 0.84.2 behavior | Implication for #12 |
|---|---|---|
| Parser/full renderer | `Marked` lexer plus terminal renderer for headings, paragraphs, nested lists/tasks, blockquotes, code, tables, links, HTML-as-text, rules, and LaTeX | Buy/reuse host; no second parser unless transformer needs structure |
| Streaming | Re-lexes current text; recognizes pending LaTeX and trims partial closing fences to stop code-block shrink/flicker | Test transformations on incomplete fences/emphasis/lists; transformer itself is stateless and synchronous |
| Width/CJK | `Intl.Segmenter`, `get-east-asian-width`, grapheme width, CJK break regex; tables wrap cells and fall back to raw Markdown when too narrow | Use public `visibleWidth`/`wrapTextWithAnsi` only in owned components/tests; transformer should normally let host wrap |
| ANSI/links | Tracks SGR state and OSC 8 across wrapping; closes underline/hyperlinks at line ends; strips CSI/OSC/APC for width | Avoid emitting ANSI from transformer; return Markdown only |
| Theme/highlighting | `MarkdownTheme` semantic functions; coding-agent maps `md*` and `syntax*` theme tokens; optional `highlightCode` callback | Reuse host semantic colors. Hard-coded Chalk/Shiki themes would break active-theme behavior |
| Cache/invalidation | Cache keyed by text and width; `setText()`/`invalidate()` clear it | Native streaming updates and theme invalidation already have ownership |
| Public compatibility | All named APIs above are root exports; transformer and context types are root exports | Compatible with Product rule; still pin/test against 0.84.x because no publication stability promise exists |

**Risk:** Pi's exported `Marked` is still host-version-coupled. Use it only through the root export and only if the prototype needs token awareness; avoid relying on private token-render methods or exact token quirks.

### 3. Parser / AST candidates

| Candidate | Activity / license | Architecture and streaming | Width/theme/API implications | Reusable part / verdict |
|---|---|---|---|---|
| **Pi-exported Marked 18.0.5** | Marked is actively released; MIT; zero runtime dependencies in upstream manifest. [Repo](https://github.com/markedjs/marked), [manifest](https://github.com/markedjs/marked/blob/master/package.json), [releases](https://github.com/markedjs/marked/releases) | Already loaded by Pi and exactly matches native parsing. Lexer accepts partial buffers but is not an incremental AST; Pi reruns it on each text update | No width/theme handling itself. Root-exported by Pi TUI, so public-compatible. Token rewrites followed by hand serialization can alter source semantics | **First parser prototype.** Reuse lexer/tokens for detection only; preserve untouched `token.raw`. Do not add another `marked` dependency unless version isolation is intentional |
| **micromark 4.x + mdast utilities** | Active unified collective; MIT; 4.0.2 published 2025-02-27. [Repo/readme](https://github.com/micromark/micromark/tree/main/packages/micromark), [manifest](https://github.com/micromark/micromark/blob/main/packages/micromark/package.json), [license](https://github.com/micromark/micromark/blob/main/license) | CommonMark state machine with concrete positional tokens; ESM fits project. It exposes a Node stream, but docs explicitly say final buffering is required—does not solve token-by-token transcript presentation | Parser only: no ANSI, CJK width, terminal theme, or renderer. mdast conversion adds package graph and reserialization risk | **Conditional buy.** Best if exact source positions or robust AST transforms become essential. Too much architecture for simple scanning cues |
| **remark / unified / mdast** | Active collective/monorepo; MIT; `remark@15.0.1`; recent repo pushes, though core release cadence is conservative. [Repo](https://github.com/remarkjs/remark), [releases](https://github.com/remarkjs/remark/releases), [package](https://github.com/remarkjs/remark/tree/main/packages/remark), [license](https://github.com/remarkjs/remark/blob/main/license) | Strong plugin AST pipeline (`remark-parse`, mdast, `remark-stringify`), ESM. Whole-document parse/process; no terminal-stream advantage | No ANSI/width/theme. Several runtime packages. Parse→stringify normalizes bullets/fences/spacing and conflicts with source-preserving transformer requirements | **Reference/last resort.** Good for complex semantic transforms, poor fit for a tiny display-only synchronous seam |
| **markdown-it 14/15** | Maintained; MIT; CommonMark-focused plugin system. [Repo](https://github.com/markdown-it/markdown-it), [changelog](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md), [manifest](https://github.com/markdown-it/markdown-it/blob/master/package.json), [license](https://github.com/markdown-it/markdown-it/blob/master/LICENSE) | Fast token parser, but duplicate parser versus Pi/Marked; whole-current-buffer parsing, not incremental transcript rendering | No terminal width/theme. Plugins largely target HTML output; adds dependencies/types and dialect drift | **Do not buy for v1.** No advantage over host-exported Marked for this seam |

### 4. Highlighting candidates

| Candidate | Activity / license | Fit, streaming, theme, width | Verdict |
|---|---|---|---|
| **Pi `highlightCode` / native Markdown callback** | Public coding-agent root export; underlying installed coding-agent manifest uses `highlight.js@10.7.3`; Pi itself is active, MIT. [theme source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/modes/interactive/theme/theme.ts) | Synchronous, already maps highlight scopes into Pi `syntax*` semantic tokens and returns ANSI lines consumed by native renderer. Host owns unknown-language fallback and ANSI wrapping | **Reuse.** For custom components only call public helper. Native messages already use it; transformer cannot and should not inject highlighted ANSI |
| **highlight.js upstream** | BSD-3-Clause; 11.x remains released, but upstream's 11.11.2 notes explicitly describe a period of inactivity and maintainer need. [Repo/license](https://github.com/highlightjs/highlight.js), [releases/maintenance note](https://github.com/highlightjs/highlight.js/releases/tag/11.11.2) | Synchronous and broad languages, but HTML-class output needs ANSI mapping; duplicate/different major from Pi's host version. No terminal width or Pi theme contract | **Do not add directly.** Reuse Pi abstraction; direct version would add grammar weight and semantic mapping work |
| **Shiki / `@shikijs/cli`** | Very active, MIT, Node >=20; TextMate-quality grammars. [Repo](https://github.com/shikijs/shiki), [manifest](https://github.com/shikijs/shiki/blob/main/packages/shiki/package.json), [releases](https://github.com/shikijs/shiki/releases), [ANSI API](https://shiki.style/packages/cli) | `codeToANSI` exists, but highlighter/grammar/theme loading is async and substantially heavier. Re-highlighting an incomplete fence on every token risks latency/flicker; bundled themes do not map automatically to Pi semantic themes | **Reference only for v1.** Prototype only if measured code readability is inadequate and a cached session-start highlighter can preserve theme/fallback contracts |

### 5. Width / ANSI primitives

| Candidate | Activity / license | Fit and risks | Verdict |
|---|---|---|---|
| **Pi TUI utilities** | Active with Pi; MIT; public root exports. [source](https://github.com/earendil-works/pi/blob/main/packages/tui/src/utils.ts) | Exact compositor semantics: grapheme segmentation, emoji/East Asian width, CJK breaking, ANSI/OSC 8 tracking. Matches quality-contract assertions | **Reuse exclusively** where Pi UI owns lines/components/tests |
| **`wrap-ansi` + `string-width`** | Actively maintained; MIT; ESM, Node >=20. `wrap-ansi@10` depends on `ansi-styles`, `string-width`, `strip-ansi`. [repo](https://github.com/chalk/wrap-ansi), [manifest](https://github.com/chalk/wrap-ansi/blob/main/package.json) | Mature general-purpose wrapping, but tab width is 8 versus Pi's 3; ANSI/control and CJK behavior can diverge from compositor. Duplicate width authority creates boundary bugs | **Do not add.** Useful only in standalone CLIs, not inside Pi TUI |

### 6. Full renderer candidates

| Candidate | Maintenance / license | Architecture, streaming, ANSI/CJK/theme/API fit | Reusable part / risk / verdict |
|---|---|---|---|
| **`marked-terminal` 7.3.0** | Some maintenance (last push 2025-09); MIT. [repo](https://github.com/mikaelbr/marked-terminal), [manifest](https://github.com/mikaelbr/marked-terminal/blob/master/package.json), [releases](https://github.com/mikaelbr/marked-terminal/releases) | Marked renderer emitting Chalk ANSI; 7 deps including `cli-highlight`, `cli-table3`, emoji, hyperlink detection. Peer range `<17` conflicts with Pi's Marked 18. Width is fixed option/reflow; open upstream discussion documents table overflow/truncation/resizing shortcomings. No Pi theme/component cache; whole-buffer output | Reuse visual ideas only (section prefix, link treatment). **Reject runtime.** Peer incompatibility, duplicate renderer, table/width risk. [table issue](https://github.com/mikaelbr/marked-terminal/issues/377), [peer issue](https://github.com/mikaelbr/marked-terminal/issues/375) |
| **Ink Markdown wrappers** | `ink-markdown` MIT but last package 2023; newer stream variants are young. [ink-markdown](https://github.com/cameronhunter/ink-markdown), [Ink](https://github.com/vadimdemedes/ink), [ink-stream-markdown](https://github.com/MrWangJustToDo/ink-stream-markdown) | Pulls React+Ink+Yoga and often marked-terminal/Shiki; incompatible component model with Pi TUI. “Streaming” variants maintain their own parser/render lifecycle, which cannot plug into `registerMarkdownTransformer` | Reuse no code; inspect streaming UX only. **Reject** due parallel TUI runtime and large dependency surface |
| **`cli-markdown` 3.5.1** | Published 2025-06; GPL-3.0-or-later; 14 deps. [registry manifest/readme](https://registry.npmjs.org/cli-markdown), [repo](https://github.com/horosgrisa/cli-markdown) | markdown-it→HTML→terminal stack, numerous plugins, whole-buffer rendering, no Pi semantic theme/component API; copyleft and dependency load are poor package fit | **Reject.** No reusable advantage over native renderer |
| **Glow / Glamour (Go)** | Highly active; MIT; Glamour is a pure, stylesheet-driven ANSI renderer. [Glow](https://github.com/charmbracelet/glow), [Glamour](https://github.com/charmbracelet/glamour), [releases](https://github.com/charmbracelet/glow/releases) | Excellent comparison for hierarchy/styles and width options. Not JS-embeddable into Pi; would require subprocess/binary distribution, async I/O, separate theme/capability detection, and no safe token-level streaming | Reuse stylesheet concepts and screenshots only. **Reject embedding**; violates synchronous/no-I/O transformer seam |
| **mdcat (Rust)** | Original repo archived; active fork now releases; MPL-2.0 plus Apache-2.0 portions. [original](https://github.com/swsnr/mdcat), [active fork](https://github.com/BIRSAx2/mdcat), [crate](https://crates.io/crates/mdcat) | Strong reference for links/images/code/theme/alerts and Ghostty. Native binary/subprocess only; not JS-embeddable; binary/license/distribution complexity and whole-buffer CLI model | Reuse UX comparison only. **Reject embedding** |

## Recommendation: buy / reuse / build

1. **Reuse Pi (primary).** Register one Markdown transformer through the public root API. Preserve prior transformer output. Return identity on disablement, any exception, unsupported/non-TUI path, and ambiguous partial syntax. Let native `Markdown`, semantic theme, `highlightCode`, and TUI width helpers own rendering.
2. **Build narrowly.** Implement only source-to-source cues proven by issue acceptance examples—for example conservative spacing/marker normalization or display-only structural accents that remain valid Markdown. Never inject ANSI, hard-coded columns, or colors. Do not parse and reserialize the entire message by default.
3. **Buy parser only on evidence.** If regex/state-machine logic cannot safely distinguish fenced code, nested lists, quotes, and partial constructs, prototype detection with Pi-exported `Marked` and preserve original `raw` spans. Escalate to micromark/mdast only if exact positions/AST transforms materially reduce bugs.
4. **Do not buy renderer/highlighter/width stacks.** Pi already provides stronger compositor integration than plausible JS packages. External full renderers would worsen public-API compatibility, theme behavior, width consistency, dependency weight, and fallback.

### Short prototype shortlist

- **P0 — native baseline/theme experiment:** no dependency; fixtures at widths 1/20/40/80 with CJK, ANSI-producing theme functions, partial fences/lists/quotes, and two semantic themes. Establish what is actually deficient before transforming.
- **P1 — source-preserving transformer:** tiny pure TS scanner, synchronous, idempotent, previous-output composable, partial-safe. Best likely v1.
- **P2 — Pi-exported Marked detector:** use public `Marked`/tokens to identify safe block boundaries, splice only selected original ranges, and retain raw source elsewhere.
- **P3 — micromark positional spike:** time-box only if P2 cannot meet partial/dialect cases. Compare correctness and dependency graph; do not ship automatically.

## Sources

### Kept

- Pi repository and public source ([repo](https://github.com/earendil-works/pi), [extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [Markdown](https://github.com/earendil-works/pi/blob/main/packages/tui/src/components/markdown.ts), [TUI utils](https://github.com/earendil-works/pi/blob/main/packages/tui/src/utils.ts)) — authoritative host APIs and behavior.
- Candidate upstream repos/manifests/licenses linked in each table — authoritative architecture, compatibility, maintenance, and license evidence.
- Local repository files named in the opening and Findings §1 — authoritative product/package constraints.

### Dropped

- npm download-count mirrors and package comparison sites — popularity is not architecture evidence.
- Blogs, “best Markdown renderer” lists, and generated package summaries — secondary/SEO sources.
- `cli-marked`, `marked-terminal-renderer`, older `msee`/`cli-md` variants — redundant, stale, or weaker than directly evaluated renderer families.
- Browser Markdown editors/renderers — DOM/CSS architecture is not embeddable in Pi TUI.

## Gaps and residual risks

- **Issue scope:** GitHub issue #12 contains only the high-level prototype question and no maintainer comments yet; concrete acceptance examples still need `/to-spec` and live prototype feedback.
- **Version-tag URLs:** local installed 0.84.2 artifacts were authoritative for exact behavior; public links above point to upstream `main`, which may advance. Implementation must verify against installed 0.84.2 declarations/source maps and pin the tested host range.
- **No benchmark or Ghostty visual study performed.** Shiki/AST cost and subjective readability remain unmeasured; do not make performance or UX claims until the prototype fixture and focused Ghostty smoke run.
- **Transformer semantics:** even display-only Markdown rewrites can change link/list/fence interpretation during streaming. Identity fallback and source-splice tests are merge-critical.
