# 调研：pi UI/UX 扩展生态与参考体验

> 对应工单：[调研 pi UI/UX 扩展生态与参考体验](https://github.com/simonwong/pi-harness-kit/issues/2)  
> 调研基线：pi `0.84.x`；结论优先依据 `v0.84.0` 固定版本文档/源码，而不是滚动的 `main`。

## 摘要

pi 0.84.x 已经公开提供了足够完整的 TUI 扩展面：扩展可以自定义工具调用/结果、消息、状态、widget、header/footer、working indicator、编辑器、临时交互界面和 overlay；因此 Wayfinder 最值得先做的不是“重造一个 Claude Code”，而是三层渐进增强：**默认低噪声摘要 → 按需展开证据 → 在固定区域持续显示状态/上下文预算**。这些模式已有 `pi-cc-extensions` 和 `pi-tool-display` 的实际实现验证。

但“给已经注册的任意工具只换 renderer”在 0.84.x 仍不是干净的公共组合接口。官方示例通过同名 `registerTool()` 重注册内置工具并委托原实现；生态项目为了捕获第三方/MCP 工具，进一步 patch `registerTool` 或修改已注册定义。这是最主要的兼容、加载顺序和维护风险，不应成为 Wayfinder MVP 的基础。

## 1. 官方 pi 0.84.x：可依赖的公开 UI seam

### 1.1 工具与消息渲染

- `pi.registerTool()` 的工具定义可提供 `renderCall(args, theme, context)` 与 `renderResult(result, { expanded, isPartial }, theme, context)`；结果 renderer 能根据“展开”和“流式 partial”状态改变呈现，`renderShell: "self"` 可接管外框。这直接支持“单行摘要、展开详情、流式预览”三态交互。[v0.84.0 extensions 文档](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/docs/extensions.md)
- 官方 `built-in-tool-renderer.ts` 示例展示了 0.84.x 的内置工具换肤方式：用同名 `read`/`bash`/`edit`/`write` 重新注册工具，执行仍委托给 `create*Tool()` 创建的原工具，只替换 renderer；因此该方式可行，但它是**完整工具替换**而非 renderer-only 装饰。[官方 v0.84.0 示例](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/examples/extensions/built-in-tool-renderer.ts)
- `pi.registerMessageRenderer(customType, renderer)` 配合 `pi.sendMessage({ customType, content, display, details })`，适合显示 Wayfinder 自己拥有的数据，例如里程碑、审查结果、决策摘要；无需劫持通用 assistant/tool transcript。[v0.84.0 extensions 文档](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/docs/extensions.md)
- `tool_call` 可在执行前阻止或修改输入，`tool_result` 可在展示/入模前修改结果，`message_update` 提供流式 assistant 更新。这些是行为 seam，不应仅为视觉换肤滥用；尤其改变 tool result 会同时影响用户看到的信息与模型后续上下文。[v0.84.0 extensions 文档](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/docs/extensions.md)

### 1.2 固定区域与交互组件

- `ctx.ui.setStatus(key, text)`：多个扩展可按 key 共存的短状态，适合分支、阶段、待处理项、上下文告警。
- `ctx.ui.setWidget(key, string[] | componentFactory, { placement })`：可放在 editor 上方或下方，适合任务清单、当前目标、失败摘要；按 key 清除，组合性好。
- `ctx.ui.setFooter(factory)` / `setHeader(factory)`：能完全替换默认 footer/header。官方 footer 示例展示 token/cost、model 和 git branch，但完全替换会承担保留原生关键信息、窄屏和扩展冲突的责任。[v0.84.0 类型定义](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/src/core/extensions/types.ts) · [官方 footer 示例](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/examples/extensions/custom-footer.ts)
- `ctx.ui.setWorkingMessage()`、working indicator/visibility：适合把“Working…”升级为阶段、耗时或 token 指标，但应该可恢复默认值，且避免持续动画制造噪声。[v0.84.0 extensions 文档](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/docs/extensions.md)
- `ctx.ui.select/confirm/input/editor()` 与 `ctx.ui.custom()` 支持阻塞式选择、确认、输入、编辑和任意临时组件；`custom(..., { overlay: true })` 可做浮层。`setEditorComponent()` 还能替换主编辑器，官方有 Vim-like modal editor 示例。[示例索引](https://github.com/earendil-works/pi/tree/v0.84.0/packages/coding-agent/examples/extensions) · [overlay 示例](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/examples/extensions/overlay-test.ts) · [modal editor 示例](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/examples/extensions/modal-editor.ts)
- 主题 API 应通过 `theme.fg(...)` 等语义 token 渲染，不应写死 ANSI 色。pi 的主题可由用户选择并热重载。[官方主题文档](https://pi.dev/docs/latest/themes) · [v0.84.0 extensions 文档](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/docs/extensions.md)

### 1.3 TUI 与 RPC 的边界

`--mode rpc` 可把 `select`、`confirm`、`input`、`editor` 作为有响应的 `extension_ui_request` 交给宿主，也可发送 `notify`、`setStatus`、`setWidget`、标题和 editor text 更新；但 `ctx.ui.custom()`、自定义 header/footer/editor、working indicator 和 theme 等完整 TUI 功能不可用或退化。因此真正可移植的 Wayfinder UI 应把**状态数据/动作协议**与 **TUI component renderer** 分层，并用 `ctx.mode === "tui"` 守卫 TUI-only 功能。[v0.84.0 RPC 文档](https://github.com/earendil-works/pi/blob/v0.84.0/packages/coding-agent/docs/rpc.md)

## 2. 两个 canonical 生态实现

### 2.1 `minuque/pi-cc-extensions`

Canonical repository：[`minuque/pi-cc-extensions`](https://github.com/minuque/pi-cc-extensions)。其 `package.json` 对 `@earendil-works/pi-ai`、`pi-coding-agent`、`pi-tui` 都声明 `^0.84.0` peer dependency，所以是本次基线最直接的实证参考。[package.json](https://github.com/minuque/pi-cc-extensions/blob/main/package.json)

用户可见能力：

- `/ccstyle` 在 `on`、更紧凑的 `compact`、原生 `off` 三态之间切换；提供 Claude Code 风格工具摘要、可折叠输出、Edit/Write rich diff，并允许按工具排除 renderer。这说明“可随时退回原生、按工具渐进启用”比一次性全局换肤更可靠。[README](https://github.com/minuque/pi-cc-extensions/blob/main/README.md)
- fullscreen 模式加入可点击展开的 tool cards/groups、preview、hover highlight 和 back-to-bottom；这验证了空间模式下的直接操作价值，但也绑定 fullscreen、鼠标、命中测试与滚动状态，复杂度显著高于普通 transcript。[README](https://github.com/minuque/pi-cc-extensions/blob/main/README.md)
- `/context` 报告 context consumption，并预览 system prompt、memory、skills、tool definitions、messages；`enableWorkingMessage` 在工作行显示 token/耗时；`enableAgentSummary` 显示每轮工具统计。它们共同验证了“预算可见 + 当前活动可见 + 回合结束摘要”这一信息架构。[README](https://github.com/minuque/pi-cc-extensions/blob/main/README.md)
- 还提供 Markdown 增强、`@` session/subagent references、别名和 CC Dark/Light 主题；这些是 bundle 便利性，不代表 Wayfinder 应全部复制。[README](https://github.com/minuque/pi-cc-extensions/blob/main/README.md)
- rich diff 明确注明改编自 `MasuRii/pi-tool-display`，两者不是独立证据；评估时不应把同一实现链重复计算为两个成熟方案。[README](https://github.com/minuque/pi-cc-extensions/blob/main/README.md) · [attribution](https://github.com/minuque/pi-cc-extensions/blob/main/extensions/renderer/tool/diff/ATTRIBUTION.md)

### 2.2 `MasuRii/pi-tool-display`

Canonical repository：[`MasuRii/pi-tool-display`](https://github.com/MasuRii/pi-tool-display)。这是 `pi-cc-extensions` rich-diff 的上游参考，而 `maplezzk/pi-extensions` 中同名 package 也明确把它作为原项目归因，不应误认 fork/package host 为 canonical。[上游 README](https://github.com/MasuRii/pi-tool-display) · [host package attribution](https://github.com/maplezzk/pi-extensions/blob/main/packages/pi-extensions-tool-display/README.md)

用户可见能力与可复用经验：

- 覆盖 `read`、`grep`、`find`、`ls`、`bash`、`edit`、`write`，把冗长输出切换为 hidden/summary/preview；提供 `opencode`、`balanced`、`verbose` presets。preset 比几十个独立开关更适合首次体验和回归测试。[README](https://github.com/MasuRii/pi-tool-display)
- Edit/Write diff 会随宽度选择 split/unified，语法高亮并强调行内变化；对窄 pane 限宽、缩短提示，并对 partial streaming 生成 workspace-scoped pending preview。这里最值得复制的是**宽度自适应、partial 与 final 明确区分、折叠仍保留数量/状态**，而不是具体配色。[README](https://github.com/MasuRii/pi-tool-display) · [diff renderer](https://github.com/MasuRii/pi-tool-display/blob/main/src/diff-renderer.ts) · [narrow-width safety](https://github.com/MasuRii/pi-tool-display/blob/main/src/line-width-safety.ts) · [pending preview](https://github.com/MasuRii/pi-tool-display/blob/main/src/pending-diff-preview.ts)
- MCP/自定义工具支持暴露了生态难点：项目 patch `pi.registerTool` 来装饰后注册工具，并以 disposable/LIFO cleanup 恢复原函数、属性、timer，避免 `/reload` 后 wrapper 叠加。这是成熟的防御性工程，但也是 API seam 不足的证据。[tool overrides](https://github.com/MasuRii/pi-tool-display/blob/main/src/tool-overrides.ts) · [disposable](https://github.com/MasuRii/pi-tool-display/blob/main/src/disposable.ts)
- 当前 `main` 的 peer dependency 搜索结果只明确列到 pi 0.80.x，并未声明 0.84.x；因此它对本次基线是**交互和源码参考**，不能仅凭 README 判定可直接安装于 0.84.x。相反，已适配其 diff 的 `pi-cc-extensions` 明确声明 `^0.84.0`。[pi-tool-display package.json](https://github.com/MasuRii/pi-tool-display/blob/main/package.json) · [pi-cc-extensions package.json](https://github.com/minuque/pi-cc-extensions/blob/main/package.json)

## 3. Claude Code / Codex 的第一方参考模式

这些产品适合验证交互模式，不适合作为 pi API 事实来源。

- Claude Code 的 status line 通过 shell command 接收 session JSON（stdin）并输出显示内容；官方列举 context usage、cost、git status、model。可借鉴之处是**把状态数据协议与展示脚本解耦**、允许用户组合，而不是复制整条固定 footer。[Claude Code status line](https://code.claude.com/docs/en/statusline)
- Claude Code interactive mode 把 tool output 默认折叠、以快捷键展开；同时提供 prompt queue、background Bash、task list、Vim mode 等。最可靠的核心模式是“摘要可扫读、详情可恢复”，不是某个 glyph 或动画。[Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode)
- Claude Code changelog 长期记录 statusline 在换行、fullscreen、无闪烁模式和 footer hint 共存时的修复，也记录可点击路径/URL和大输出落盘。这说明自定义 footer、ANSI 宽度、滚动/fullscreen 是高维护面；而输出折叠绝不能导致证据永久丢失。[官方 changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- Codex CLI 第一方文档把 `/status`、`/permissions`、`/model`、`/review` 等稳定动作放到 slash commands；执行则以 sandbox + approval policy 明确“何时必须暂停询问”。Wayfinder 应把阶段、权限/风险、审查作为显式状态/动作，而不是藏进视觉装饰。[Codex CLI](https://developers.openai.com/codex/cli) · [CLI reference](https://developers.openai.com/codex/cli/reference)

## 4. 对 Wayfinder 的优先级建议

| 层级 | 能力 | 用户收益 | 0.84.x seam | 实现/维护复杂度 | 建议 |
|---|---|---|---|---|---|
| P0 | 按 key 的 status：阶段、分支、待处理数、context 阈值告警 | 持续可见但不打断 | `setStatus` | 低 | 先做；短文本、语义色、可关闭 |
| P0 | keyed widget：当前目标、下一动作、失败/审查摘要 | 减少“我现在在哪”成本 | `setWidget` | 低—中 | 只在有用时出现；上下/下方可配 |
| P0 | Wayfinder 自有消息的 summary/details | transcript 可扫读且证据可恢复 | custom message renderer | 中 | 明确 collapsed/expanded/partial/error 状态 |
| P1 | `/context` 式上下文构成与预算检查 | 让压缩/拆分时机可判断 | command + `ctx`/session 数据 + custom UI | 中 | 优先做按需 inspector，后加阈值告警 |
| P1 | working 阶段 + elapsed/token；回合工具统计 | 长任务有反馈 | working APIs + events | 中 | 节流刷新；结束后归并，避免永久占屏 |
| P1 | Wayfinder 自有工具 compact renderer + adaptive diff | 大幅降低噪声 | `registerTool` renderers | 中 | 仅渲染自己拥有的工具，保留原始详情 |
| P2 | 自定义 footer | 高密度全局状态 | `setFooter` | 中—高 | 仅在多 status 不够时；必须保留原生关键信息 |
| P2 | fullscreen clickable cards/overlay inspector | 高信息密度、直接操作 | fullscreen + custom overlay | 高 | 作为可选增强，不作核心路径 |
| 暂缓 | 装饰任意第三方/MCP tool renderer | 全局视觉一致 | 无干净 renderer-only seam | 高且脆弱 | 等公共 API，或隔离成 opt-in adapter |
| 不做 | 整体替换主 editor、复制完整 Claude Code shell | 品牌一致但边际收益低 | `setEditorComponent` 可行 | 极高 | 与 Wayfinder 核心能力无关，冲突面最大 |

### 推荐的交互契约

1. **默认摘要必须包含结果状态和证据规模**：如 `✓ tests · 42 passed · 8.2s`，而不是只显示“done”。
2. **展开是无损的**：被折叠内容仍可在 transcript、文件或命令中恢复；错误不能按普通成功输出隐藏。
3. **partial/final 不混淆**：流式 diff 标 `pending`，完成后替换为最终结果；abort 也有终态。
4. **窄屏是一级测试维度**：至少覆盖 40/80/120 列、tmux pane、宽字符/emoji、ANSI 与换行。
5. **视觉层不改变模型语义**：优先 renderer，不通过 `tool_result` 截断模型可见结果。
6. **可组合、可撤销**：keyed status/widget；所有 patch/component 都有 dispose；`/reload` 后不叠加；用户能逐工具关闭或退回 native。
7. **动作优先键盘，鼠标只是增强**：fullscreen click 不应是唯一展开路径。

## 5. 不值得照搬的模式

- **像素级仿 Claude Code**：glyph、动画、颜色很快变化，且不能形成 Wayfinder 的能力差异；应复制信息架构而非皮肤。
- **默认隐藏 read/search/MCP 全部输出**：极简 preset 在失败、审查和安全场景会失去可见证据；更稳妥的默认是 summary + 错误自动展开。
- **无条件替换 footer/header/editor**：会覆盖 Pi 原生信息并与其他扩展争夺 singleton 区域；status/widget 的组合性更好。
- **patch 私有 TUI prototype 或全局 `registerTool` 作为核心依赖**：能工作，但 reload、加载顺序、多个装饰器和上游内部变更都会增加维护成本。
- **把 UI 输出裁剪等同模型上下文裁剪**：两者目标不同；显示可折叠，模型所需证据不应被视觉优化意外删除。
- **同时复制两个高度重叠的 renderer**：`pi-cc-extensions` diff 已来自 `pi-tool-display`，应选一种实现/归属策略，避免重复依赖和冲突。

## 6. 新近清晰、应进入 Wayfinder map 的能力问题

1. Wayfinder 的首个 UI surface 是跨扩展可组合的 `status/widget`，还是会接管 singleton footer？原生 footer 中哪些信息必须保留？
2. 哪些对象由 Wayfinder **拥有并可稳定渲染**（任务、审查、委派、里程碑），哪些只是第三方工具结果而应保持 native？
3. “context health”要显示总占用，还是必须拆到 system prompt / memory / skills / tools / messages，并给出可执行建议？
4. summary 的最小证据契约是什么：状态、耗时、计数、路径、退出码、风险级别中哪些必显？错误是否自动展开？
5. 展开状态应是消息局部、会话持久还是全局 preset？重载/恢复会话后是否保留？
6. TUI、RPC/嵌入式客户端是否共享同一份 UI state schema，只替换 renderer？哪些动作必须在非 TUI 也可达？
7. 多扩展同时重注册同名工具时，owner/precedence/disposal 如何定义？是否应先推动上游 renderer-only API，而不是本地 patch？
8. 是否把 40 列、tmux、CJK 宽字符、screen reader/无颜色、纯键盘纳入 UI acceptance matrix？
9. context/elapsed/token 指标的刷新频率与计算成本上限是什么，怎样避免 working animation 本身造成 flicker？
10. 用户能否一键切回 native，并对单个工具/消息类型禁用 Wayfinder renderer，以便排障和兼容？

## 7. 来源完整性与限制

### 采用的一手来源

- pi 官方 `v0.84.0` extensions、RPC、类型定义和示例：用于确认公开 API 与版本可行性。
- `minuque/pi-cc-extensions` canonical README、package metadata、attribution：用于确认 0.84.x 声明和用户可见能力。
- `MasuRii/pi-tool-display` canonical README、package metadata、renderer/patch/cleanup 源码：用于确认具体实现与维护代价。
- Anthropic Claude Code 官方文档/changelog、OpenAI Codex 官方 CLI 文档：只用于产品交互参考。

### 未采用/降权

- package 聚合页、博客、DeepWiki、搜索摘要中的 fork：不能替代 canonical repo/source。
- `badlogic/pi-mono` 的滚动 `main` 重定向：凡是 0.84.x 能力结论均尽量改用 `earendil-works/pi` 的 `v0.84.0` 固定链接。
- `maplezzk/pi-extensions` 的 tool-display host：仅用于确认 attribution，不作为原实现来源。
- 当前 `main` 上晚于 0.84.x 的 pi/Codex 功能：未用于 0.84.x 可行性承诺。

### 仍需 coordinator/实现阶段验证

- 本环境的 URL fetch 受 fake-IP/SSRF 限制，无法直接下载 GitHub raw page；内容通过多角度 web search 对 canonical URL 做了交叉检索。关键版本/peer-dependency 结论在合并前宜由 coordinator 用本地 `git show`/`gh api` 再核验一次。
- `pi-tool-display` 当前 metadata 未声明 0.84.x；如果要直接安装，必须做真实 smoke test，不能把源码参考等同兼容承诺。
- 没有实际跑 40/80/120 列、fullscreen、reload 和多 renderer 冲突测试；上表复杂度是源代码/API seam 评估，不是 benchmark。

## 结论（一句话）

**Wayfinder 应先用 pi 0.84.x 的公开 `status/widget/custom-message/owned-tool renderer` 做“低噪声摘要、无损展开、上下文与阶段可见”，把 footer/fullscreen 作为可选增强，并避开任意第三方工具 renderer patch 与整壳仿制。**
