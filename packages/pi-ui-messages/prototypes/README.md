# Prototype: compact tool cards

Throwaway. Answers #40. Not for `main`.

## Question

Does a template activity row (not a boxed tool card, not a model-written title) scan like the Claude Code screenshots?

```text
● Reading packages/foo/package.json
  L packages/foo/package.json

● Searching
  L $ grep -rn toolCards …
```

## Run

New Ghostty window, repo root:

```sh
pi -e ./packages/pi-ui-messages/prototypes/tool-cards.ts
```

Input 上方应有 `PROTO tool-cards  ● title / L evidence`。

Then **让模型调工具**，不要只看 thinking：

- 「用 ls 列出当前目录」
- 「read package.json」
- 「grep toolCards」
- 「跑 bash：echo hi; exit 2」

展开：原生 `app.tools.expand`（常 `ctrl+o`）。

## Titles (templates, 7 builtins)

| tool | title | L |
| --- | --- | --- |
| read | Reading {path} | path |
| write | Writing {path} | path |
| edit | Editing {path} | path |
| grep | Searching for {pattern} | path/glob |
| find | Finding {pattern} | path |
| ls | Listing {path} | path |
| bash | Searching/Listing/Running {head} | `$ command` |
