# pi-ui Messages · Compact Thinking 调研（issue #13 前置研究）

> 调研日期：2026-08（基于仓库锁定版本撰写）
> 调研对象：pi（@earendil-works/pi-coding-agent）thinking 块的原生数据流、transcript 渲染与公共 API seam；业界 CLI 编码代理的 thinking 紧凑呈现先例。
> 证据来源：
> - 仓库本地安装（`pi-harness-kit/node_modules/`）：`@earendil-works/pi-coding-agent@0.84.2`、`@earendil-works/pi-tui@0.84.2`（下文标「本地 0.84.2」）
> - 全局安装（`~/.bun/install/global/node_modules/`）：`@earendil-works/pi-coding-agent@0.84.3` 及其依赖 `pi-ai`/`pi-agent-core`（下文标「全局 0.84.3」；仓库 node_modules 未平铺安装 pi-ai/pi-agent-core，类型证据取自全局）
> - 先例部分：官方文档 / changelog / 仓库一手 Issue 与 PR（附 URL）
> 约定：所有「文件:行号」均为对上述本地安装实际读取核验的行号；个别由相邻锚点计数推出的行号已标注。

---

## 1. 结论摘要（TL;DR）

1. **pi 的 thinking 是「全有或全无」的全局显隐，没有逐块折叠/展开。** transcript 中 thinking 默认以斜体、`thinkingText` 主题色的 Markdown 全文渲染（无任何截断/省略）；开启 `hideThinkingBlock` 后每段连续 thinking 只显示一个静态斜体标签（默认 `Thinking...`，扩展可用公共 API `ctx.ui.setHiddenThinkingLabel` 改文案）。官方 keybindings 文档把 `ctrl+t`（`app.thinking.toggle`）描述为 "Collapse or expand thinking blocks"，但实现是**全局**显隐切换 + 整个 chat 重建，而非逐块交互。
2. **流式中与完成后的 thinking 渲染完全相同。** `message_start/update/end` 一律全量重渲染同一个 `AssistantMessageComponent`，唯一差异是传给 Markdown transformer 的 `isStreaming` 上下文标志。没有"流式时紧凑、完成后折叠"的原生行为，这正是 Compact Thinking 的空白地带。
3. **公共 seam 足够做「流式状态 + 折叠文案 + 文本级紧凑化」，不够做「逐块展开交互」。** 可用：`message_update` 事件（携带逐 delta 的 `AssistantMessageEvent`，含 `thinking_delta`）、`registerMarkdownTransformer`（`messageType: "assistant-thinking"` 明确作用于 thinking 文本）、`setHiddenThinkingLabel`、`setWorkingMessage/Visible/Indicator`、主题 token。不可用：thinking 显隐状态无 getter/setter、无逐块展开 API、export-html 行为不可定制。
4. **先例共识形态：流式时一行状态（spinner + 时长，可选 token/速率），完成后折叠为一行摘要（`Thought for Xs` 类），按一个全局键展开。** Claude Code（`∴ Thinking (ctrl+o to expand)` / `Thought for Xs`）、Gemini CLI（thinking bubbles + summary/full 两档）、Codex（状态条计时器 + reasoning summary 流式）、Kimi（`Thinking ... 3s · 245 tokens · 82 tok/s` → `Thought for Xs · N tokens`，Ctrl+O 展开）均收敛于此。Kimi 的教训：只做单行摘要而不保留可展开路径会直接产生信息保真投诉（kimi-cli #1877）。

---

## 2. pi 原生 thinking 数据流与渲染现状

### 2.1 数据模型：thinking 内容长什么样

- `ThinkingContent`（全局 0.84.3，`pi-ai/dist/types.d.ts:242-250`）：

  ```ts
  export interface ThinkingContent {
      type: "thinking";
      thinking: string;
      thinkingSignature?: string;
      /** When true, the thinking content was redacted by safety filters. The opaque
       *  encrypted payload is stored in `thinkingSignature` so it can be passed back
       *  to the API for multi-turn continuity. */
      redacted?: boolean;
  }
  ```

  要点：签名放在 `thinkingSignature`；被安全过滤的加密 thinking 用 `redacted: true` 标记，密文本身也放在 `thinkingSignature`。
- AssistantMessage 的内容数组为 `(TextContent | ThinkingContent | ToolCall)[]`（全局 0.84.3，`pi-ai/dist/types.d.ts:304-306`），即 thinking 是 assistant message 的普通 content part，与 text/toolCall 平级，可交错出现（provider 侧 interleaved thinking 到达后按到达顺序进入数组）。
- Thinking 级别类型：`ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`（全局 0.84.3，`pi-agent-core/dist/types.d.ts:260`；pi-ai 侧重定义为不含 off 的六档，`pi-ai/dist/types.d.ts:27-28`）。
- Usage 中有独立 `reasoning` 字段（reasoning tokens，为 output 子集，provider 上报才有）（全局 0.84.3，`pi-ai/dist/types.d.ts:278-283`，由相邻锚点计数定位）。

### 2.2 流式事件链：thinking 如何进入 transcript

Provider 流事件（全局 0.84.3，`pi-ai/dist/types.d.ts:400-441`）：`AssistantMessageEvent` 联合类型包含 `thinking_start`（:413）、`thinking_delta`（:417，携带 `delta` 增量）、`thinking_end`（:422，携带完整 `content`），每种都带 `contentIndex` 与累积的 `partial: AssistantMessage`。

Anthropic 适配器实测（全局 0.84.3，`pi-ai/dist/api/anthropic-messages.js`）：
- `redacted_thinking` content_block → 转成占位 thinking 块：`thinking: "[Reasoning redacted]"`、`thinkingSignature: <密文>`、`redacted: true`，并照常发 `thinking_start`（:430-440）。
- `thinking_delta` → 追加文本并发 `thinking_delta` 事件（:471-484）。
- `signature_delta` → 只累积 `thinkingSignature`，**不发任何流事件**（:499-507）。

Agent 层把这些转成 UI/扩展可见事件（全局 0.84.3，`pi-agent-core/dist/types.d.ts:388-398`）：

```ts
| { type: "message_start";  message: AgentMessage }
| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
| { type: "message_end";    message: AgentMessage }
```

即**扩展能逐 delta 拿到 `thinking_delta`**（含增量文本与累积 partial），这是纯公共 API 实现"流式 thinking 状态机"（本次 run 第几段 thinking、已流多久、已收多少字符）的数据基础。

interactive-mode 的消费方式（本地 0.84.2，`dist/modes/interactive/interactive-mode.js`）：
- `message_start`（assistant）：新建流式组件 `new AssistantMessageComponent(undefined, this.hideThinkingBlock, theme, this.hiddenThinkingLabel, this.outputPad, transformers)` 后 `updateContent(message, true)`（:2571-2574）。
- `message_update`：`updateContent(this.streamingMessage, true)` 全量重渲染（:2579-2582）。
- `message_end`：`updateContent(this.streamingMessage, false)`（:2608-2619）。
- `thinking_level_changed` 事件：只刷新 footer 与编辑器边框色（:2557-2560）。

### 2.3 transcript 渲染：AssistantMessageComponent

组件位于 **pi-coding-agent**（不是 pi-tui；见 §2.7），本地 0.84.2 `dist/modes/interactive/components/assistant-message.js`：

- 构造签名（:20，与 `assistant-message.d.ts:9-19` 一致）：
  `constructor(message?, hideThinkingBlock = false, markdownTheme = getMarkdownTheme(), hiddenThinkingLabel = "Thinking...", outputPad = 1, markdownTransformers = [])`
- setter：`setHideThinkingBlock`（:40-45）、`setHiddenThinkingLabel`（:46-51）、`setOutputPad`（:52-57）——均可触发整组件重渲染；`updateContent(message, isStreaming)`（:67）。
- **连续 thinking 块合并**：遍历 content 时把相邻的 thinking 块收进 `thinkingBlocks`，渲染时 `join("\n\n")` 作为一个 Markdown 段落（:85-101 计数定位，合并逻辑见 :98 附近循环）。
- **可见模式**（默认）：一个 `Markdown` 组件渲染合并后的 thinking 全文，`color: (text) => theme.fg("thinkingText", text)`、`italic: true`，transform 用 `createMarkdownTransform("assistant-thinking", this.isStreaming, this.markdownTransformers)`（:113-121）。
- **隐藏模式**（`hideThinkingBlock=true`）：每个 thinking run 只加一行静态 `Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)))`（:108-110）。**标签不可点击、不可展开，没有 per-block 折叠状态。**
- **无截断/省略/高度限制**：thinking 全文直接进 Markdown，无 ellipsis、无行数上限（全文只有横向 wrap）。`stopReason === "length"` 时另有固定错误行（"Response was truncated before completion."）。
- 流式 vs 完成后：渲染路径完全一致，唯一差别是 `isStreaming` 传给 markdown transform 的上下文标志（见 §3 seam 3）。

### 2.4 全局显隐、设置与快捷键

- 设置键 `hideThinkingBlock`（布尔，默认 false，**写入全局 settings.json**）：`getHideThinkingBlock()` / `setHideThinkingBlock()`（本地 0.84.2，`dist/core/settings-manager.js:578-580, 593-597`）。
- InteractiveMode 构造时加载（`interactive-mode.js:388-389`），`/reload` 与运行时设置刷新时重读（`applyRuntimeSettings`，:1484-1491）。
- 快捷键（本地 0.84.2 `interactive-mode.js:2247-2258`）：
  - `app.thinking.cycle`（默认 `shift+tab`）→ `cycleThinkingLevel()`（:3319-3328），显示 `Thinking level: <level>` 状态。
  - `app.thinking.toggle`（默认 `ctrl+t`）→ `toggleThinkingBlockVisibility()`（:3371-3384）：翻转设置并**持久化** → 清空并重建整个 chatContainer → 若在流式中则对 streaming 组件 `setHideThinkingBlock` + 重新 `updateContent` → 状态行 `Thinking blocks: hidden/visible`。
- 官方 keybindings 文档（全局 0.84.3 `docs/keybindings.md`，"Models and Thinking" 一节）原文：

  | Keybinding id | Default | Description |
  |---|---|---|
  | `app.thinking.cycle` | `shift+tab` | Cycle thinking level |
  | `app.thinking.toggle` | `ctrl+t` | Collapse or expand thinking blocks |

  注意文档语义（"Collapse or expand"）与实现（全局显隐）的落差——对 Compact Thinking 的文案预期有直接影响。
- `/settings` 面板暴露 `hideThinkingBlock`、`thinkingLevel`、`availableThinkingLevels`（`interactive-mode.js:3655-3682` 计数定位，props 见 :3673-3678）；`onHideThinkingBlockChange` 逐组件 `setHideThinkingBlock` 后仍整 chat 重建（同函数体内）。0.84.3 changelog 另新增 `/thinking` 选择器命令（全局 `CHANGELOG.md`，[0.84.3] "Added a `/thinking` selector..."）。
- thinking level 还通过编辑器边框色可视化：`theme.getThinkingBorderColor(level)`（本地 0.84.2，`dist/modes/interactive/theme/theme.js:313`；schema 定义 `thinkingOff/Minimal/Low/Medium/High/Xhigh/Max` 七色，`theme.js:66-72`；`thinkingText` 前景色 token `theme.js:34`）。

### 2.5 流式状态区（与 thinking 的关系）

流式期间的"Working..."行是独立的 `WorkingStatusIndicator`（spinner + 消息，本地 0.84.2 `dist/modes/interactive/components/status-indicator.js:15-20`），与 thinking 块渲染互不感知。扩展可经 `ctx.ui.setWorkingMessage / setWorkingVisible / setWorkingIndicator` 定制它（全局 0.84.3 `docs/extensions.md`「Widgets, Status, and Footer」节，约 :2559-2577；`setWorkingIndicator` 支持 `frames: []` 隐藏、静态帧、自定义帧率）。**这是公共 API 里唯一能做"流式状态行"的原生挂点。**

### 2.6 信息保真与导出（/export、/share）

- `/export`→`session.exportToHtml(path, { themeName })` / `.jsonl`（本地 0.84.2 `interactive-mode.js` `handleExportCommand`，:4800 附近计数定位）。HTML 导出把**完整 session entries（含 thinking content）** base64 内嵌，由模板 JS 客户端渲染（本地 0.84.2 `dist/core/export-html/index.js:85-117` `generateHtml`）。
- 模板对 thinking 的渲染（本地 0.84.2 `dist/core/export-html/template.js:1242-1249` 计数定位）：

  ```js
  } else if (block.type === 'thinking' && block.thinking.trim()) {
    html += `<div class="thinking-block">
      <div class="thinking-text">${escapeHtml(block.thinking)}</div>
      <div class="thinking-collapsed">Thinking ...</div>
    </div>`;
  }
  ```

- CSS（本地 0.84.2 `dist/core/export-html/template.css`）：`.thinking-text` 默认显示，斜体、`var(--thinkingText)`、`white-space: pre-wrap`（:438-443 计数定位）；`.thinking-collapsed { display: none; ... }`（:449-454 计数定位）。即 **HTML 导出中 thinking 恒为全文展开**（无开关、无交互），折叠标签在 DOM 里但被隐藏。
- 结论：原生 transcript（可见模式）与 HTML 导出都保持全文保真；唯一的保真损失点是 `hideThinkingBlock` 开启后的单行标签（信息完全不可达，除非切换回来）。session `.jsonl` 导出含完整 thinking 与签名。

### 2.7 隐私/加密 thinking（redacted / encrypted）在 0.84.x 的现状

- Anthropic `redacted_thinking` → `thinking: "[Reasoning redacted]"` + `redacted: true` + 密文入 `thinkingSignature`（§2.2）。渲染层对 `redacted` **没有任何特殊分支**——它和普通 thinking 一样全文（这里是占位文案）渲染；开启隐藏时同样只剩标签。
- changelog 佐证加密 reasoning 回放在 0.84.x 的覆盖面（全局 0.84.3 `CHANGELOG.md`）：
  - [0.84.3] Changed：xAQ 内建模型改用 Responses API 的 **encrypted reasoning replay**（"encrypted reasoning replay"）。
  - [0.84.3] Fixed：Bedrock 回放非 Anthropic 模型的 opaque redacted reasoning（#8314）；OpenAI 兼容 Chat Completions 按原序回放 assistant 级 `reasoning_details`（#7994）。
- 未见任何名为 `encrypted_content` 的公共概念/字段（在已读类型与适配器中未出现）——**未验证**该词在 pi 0.84.x 是否存在于未读文件。interleaved thinking（工具调用之间的 thinking）在 pi 中的呈现：数据层按到达顺序进 content 数组（§2.1），渲染层合并相邻 run（§2.3）——即 toolCall 之间的每段 thinking 是独立 run，隐藏模式下每段各显示一个标签。

### 2.8 pi-tui 0.84.2 的 AssistantMessageComponent 归属澄清

- `@earendil-works/pi-tui@0.84.2`（本地 `node_modules/@earendil-works/pi-tui/package.json:2`）**不导出 AssistantMessageComponent**：`dist/index.js` 的组件清单只有 Box、CancellableLoader、Editor、HStack、Image、Input、Loader、Markdown、ScrollView、SelectList、SettingsList、Spacer、Text、TruncatedText、VStack（`dist/index.js` Components 一节）。
- AssistantMessageComponent 属于 pi-coding-agent，并从包根公开导出（本地 0.84.2 `dist/index.js:49`："UI components for extensions" 导出列表含 `AssistantMessageComponent`；类型见 `dist/modes/interactive/components/assistant-message.d.ts`）。
- pi-tui 侧与 Compact Thinking 相关的可用原语：`Markdown`（支持 `color`/`italic`/transform）、`TruncatedText`（单行截断到宽度，本地 `pi-tui/dist/components/truncated-text.js:5-14` 整文件核验）、`Container`。**pi-tui 没有"可折叠 Markdown"原语**；折叠交互都是 coding-agent 层组件（如 `ExpandableText`、ToolExecutionComponent）自己实现的。

---

## 3. 公共 seam 盘点表

「公共」判定标准：`@earendil-works/pi-coding-agent` 包根导出（`dist/index.js`）或 `ExtensionAPI`/`ExtensionUIContext` 类型（`dist/core/extensions/types.d.ts`，本地 0.84.2）。

| # | Seam | 能力 | 来源（文件:行） | Compact Thinking 可用性评估 |
|---|------|------|----------------|------------------------------|
| 1 | `pi.on("message_start"/"message_update"/"message_end")` | 拿到累积 partial message；`message_update` 额外携带逐事件的 `assistantMessageEvent`（含 `thinking_start/delta/end`、增量文本、`contentIndex`） | `pi-agent-core/dist/types.d.ts:388-398`（全局）；扩展事件类型 `types.d.ts`（本地）ExtensionEvent 联合 | ✅ 纯公共。可实现流式状态机：段计数、已流时长、字符数、首行捕获。**不可阻断/改写**（见 seam 10） |
| 2 | `message_end` result 替换 | `MessageEndEventResult.message` 可替换最终消息（须保持 role） | 本地 `types.d.ts` `MessageEndEventResult`（ExtensionEvent 区段，约 :806-810 计数定位） | ⚠️ 理论上可在落 transcript 前改写 assistant message 的 thinking 内容；但会污染 session 持久化与 LLM 上下文，违反 public-first 安全边界，不建议 |
| 3 | `pi.registerMarkdownTransformer(fn)` | 在渲染前变换 Markdown 文本；context 含 `messageType: "user" \| "assistant" \| "assistant-thinking"`、`isStreaming`、`availableWidth` | 本地 `types.d.ts:840-845`（MarkdownTransformContext/MarkdownTransformer）、:920-921（API 声明）；实现接线 `markdown-transform.js`（整文件）+ `assistant-message.js:120`（thinking 用 `"assistant-thinking"` 调用） | ✅ 纯公共，**确认作用于 thinking 文本**。可做：尾部截断加省略号、加元数据行、流式时只保留尾部 N 行等。⚠️ 每次是"整段合并 Markdown 全量"输入（多次重渲染），无增量回调；无法加交互展开 |
| 4 | `ctx.ui.setHiddenThinkingLabel(label?)` | 自定义隐藏态标签文案；无参恢复默认 `"Thinking..."` | 本地 `types.d.ts:94-95`；实现 `interactive-mode.js:1655-1665`（遍历 chat 子组件 + 流式组件）；暴露 `interactive-mode.js:1885` | ✅ 纯公共。可把标签改成含摘要信息的单行（如 `Thought for 12s · 3 blocks (ctrl+t to expand)`）。⚠️ 无 getter；`/reload`（`resetExtensionUI`）会重置回默认 |
| 5 | thinking 显隐状态（`hideThinkingBlock`） | 全局开关：设置键 + `ctrl+t`（`app.thinking.toggle`） | `settings-manager.js:578-580,593-597`；`interactive-mode.js:2247-2258, 3371-3384`；`docs/keybindings.md`（全局） | ❌ 无扩展 API：无 `getHideThinkingBlock`/`setHideThinkingBlock`、无 per-block 状态。**必须保持 native**（扩展只能读 settings.json 文件——非公共 API 且运行时不生效） |
| 6 | `ctx.ui.setWorkingMessage / setWorkingVisible / setWorkingIndicator` | 流式状态行文案/可见性/spinner 帧（`frames: []` 可隐藏） | 本地 `types.d.ts:82-89`（含注释）；全局 `docs/extensions.md` Widgets 节 | ✅ 纯公共。流式 thinking 状态（spinner + elapsed + 动态文本）的原生挂点 |
| 7 | `ctx.thinkingLevel` + `pi.on("thinking_level_select")` + `pi.get/setThinkingLevel` | 读写 thinking 档位；级别变化通知（notification-only） | 本地 `types.d.ts:231`（ctx 字段）、:607-611（事件）、ExtensionAPI `get/setThinkingLevel`（:953-955 计数定位） | ✅ 纯公共。用于状态行显示当前档位、按档位调整紧凑度 |
| 8 | 主题 token：`thinkingText`、`thinkingOff..Max` 七色、`theme.getThinkingBorderColor` | thinking 文本色、级别边框色 | 本地 `theme/theme.js:34, 66-72, 313`；`ctx.ui.theme`（本地 `types.d.ts` UI context `readonly theme`） | ✅ 纯公共。紧凑态配色沿用现有 token，无需新主题键 |
| 9 | `AssistantMessageComponent` 公开导出 | 可自行构造带 hide/label/transformers 的组件 | 本地 `dist/index.js:49`；`assistant-message.d.ts:9-19` | ⚠️ 可用于自建面板（overlay/custom widget），但**原生 transcript 中的实例不受扩展控制**（无 per-block API） |
| 10 | 事件处理结果（`message_end` 之外，thinking 无拦截） | thinking 流没有可拦截/丢弃的 handler result（对比 tool_call 的 block） | 本地 `types.d.ts` 各 Event Result 定义区段 | ❌ 不存在"thinking 显示策略"拦截点 → 逐块折叠无公共实现路径 |
| 11 | `ctx.ui.getToolsExpanded / setToolsExpanded` | 工具输出全局展开态读写 | 本地 `types.d.ts:190-191`（UI context 末尾）；实现 `interactive-mode.js:1920-1921` | ✅ 公共（对照项）：tool output 有全局态读写，thinking **没有**对应物——上游 seam 缺口的直接证据 |
| 12 | keybindings（`app.thinking.toggle`/`app.thinking.cycle`） | 用户可在 `~/.pi/agent/keybindings.json` 重绑 | 全局 `docs/keybindings.md`（Models and Thinking 节） | ⚠️ 用户级配置而非扩展 API；扩展可用 `pi.registerShortcut` 加新键，但原生 toggle 独立存在 |
| 13 | export-html（thinking 恒全文展开） | `/export`、`/share` 的 thinking 呈现 | 本地 `export-html/index.js:85-117`、`template.js:1242-1249`、`template.css:438-443, 449-454` | ❌ 无扩展定制点，**保持 native**（信息保真的最后防线，恰好是优点） |

补充（数据侧 seam）：`Usage.reasoning`（reasoning tokens，`pi-ai/dist/types.d.ts:278-283`，全局）随 assistant message 提供——完成后摘要行可显示 token 数而无需自行估算（流式中 provider 不一定逐块上报，需以 message_end 后的 usage 为准）。

---

## 4. 先例调研

### 4.1 Claude Code（Anthropic）

**形态（一手描述）**
- 流式：thinking 实时流式显示在 transcript 中（社区长期诉求已实现；issue #30660 记录了早期"无反馈直到 thinking 结束"的痛点及后续改进）。
- 完成后：折叠为一行指示。issue #55608 原文引用："before it collapses to the one-line `∴ Thinking (ctrl+o to expand)` indicator"；issue #73789 描述每个步骤之间是 "Thought for Xs" 标签。
- 展开：`Ctrl+O` 打开 transcript viewer。官方 interactive-mode 文档：「`Ctrl+O` | Toggle transcript viewer | Shows detailed tool usage and execution, with a timestamp and the model used on each assistant message. Also expands lines that collapse by default…」（https://code.claude.com/docs/en/interactive-mode）
- 配置：`showThinkingSummaries`（官方 settings 文档：「Show extended thinking summaries in interactive sessions. When unset or false (default in interactive mode), thinking blocks are redacted by the API」）；`Alt+T` 切换 extended thinking（interactive-mode 文档快捷键表）。
- 痛点/演进（均为 anthropics/claude-code 一手 issue）：#36006（请求默认折叠 + `⟐ Thinking (1.2s, 340 tokens) [Ctrl-O to expand]` 式两态设计）、#55608（希望流结束后展开态保留更久，提议 `thinkingDisplayDurationMs`）、#73789（要求工具卡+thinking 标签整体 compact 模式）、#52046/#54416（展开点击失效回归——展开路径是高脆弱区）、#30958（thinking summaries 空 string 回归）。

**对 pi 的启示**：两态（流式跟随 → 一行摘要 + 全局键展开）是默认解；摘要行带时长（可选 token）是共识文案；"展开失效"是最常见的回归投诉，展开路径必须有明确回退（pi 里即 ctrl+t 全局显隐）。

### 4.2 Gemini CLI（google-gemini/gemini-cli）

- 数据/组件：核心 turn loop 发 `GeminiEventType.Thought` 事件，TUI 用 `ThinkingMessage.tsx` 渲染 `ThoughtSummary`（https://github.com/google-gemini/gemini-cli/blob/e9171fd7/packages/cli/src/ui/components/messages/ThinkingMessage.tsx）；加载行（Composer 的 `LoadingIndicator`）同时显示当前 thought 摘要（issue #20496 / PR #20497 佐证 `uiState.thought` 的存在）。
- 紧凑化演进：
  - PR #18033「Inline thinking bubbles with summary/full modes」：每个 thought 事件渲染为独立小气泡（去掉聚合计数），避免增长闪烁；新增 full 与 summary 两档独立 UI 设置，full 优先（https://github.com/google-gemini/gemini-cli/pull/18033）。
  - PR #18725「overhaul thinking UI」：白色斜体 "Thinking..." 标题 + 灰色竖线（│）串联整段 thoughts + 主题/描述斜体（https://github.com/google-gemini/gemini-cli/pull/18725）。
  - 设置项：`ui.inlineThinking` 等出现在官方 settings 表（https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md，表中 "Inline Thinking" 一行）。
- 非交互模式：PR #19986 为 stream-json/json/text 模式补 `thought` 事件 / `Thinking: ...` 行（https://github.com/google-gemini/gemini-cli/pull/19986）。

**对 pi 的启示**：把"流式 thought"与"完成 transcript"当作两个呈现面（加载行 vs transcript）；summary/full 分档设置而不是单一开关；气泡（每事件一块）vs 合并段是可选题——pi 原生是合并相邻 run。

### 4.3 Codex CLI（openai/codex）

- 交互式 TUI：状态指示器有 "Working/Thinking" 计时器，PR #3220 把 elapsed 做成紧凑格式 `Xs / MmSSs / HhMMmSSs`（https://github.com/openai/codex/pull/3220）。
- exec（非交互）模式：早期每块打印紫色 `thinking for 386s` 行，PR #216 改为单行黄色 `thinking for #s` + 带边框 spinner `( ● ) Thinking..`（https://github.com/openai/codex/pull/216）。
- reasoning summary：live 轮次从 `ReasoningSummaryTextDelta` 增量渲染（PR #15758 修重复渲染，https://github.com/openai/codex/pull/15758）；早期行为是"缓冲到 reasoning 结束才显示"（issue #8204 的改进诉求，https://github.com/openai/codex/issues/8204）。
- 配置：`hide_agent_reasoning` / `show_raw_agent_reasoning`（issue #7090 提及，https://github.com/openai/codex/issues/7090）；`model_reasoning_summary = "auto"/"detailed"`（issue #34873，https://github.com/openai/codex/issues/34873）。
- 已知弱点（对 spec 有用）：reasoning 呈现是回归重灾区（#16801 摘要丢失、#31216 TUI 完全不渲染、#31664 `<!-- -->` 占位符漏出）。

**对 pi 的启示**：elapsed 紧凑格式（Xs→MmSSs）值得抄；"reasoning summary 只显示摘要而非原始 CoT"是 Codex 的产品选择（raw 需显式开启）——pi 的 transformer seam 恰好能做同类"摘要化"实验。

### 4.4 Kimi（MoonshotAI：kimi-cli 与 kimi-code）

**kimi-cli（Python 世代）——最直接的"compact thinking"先例**
- PR #1857（经 #1872 引述）：把流式指示器压缩为单行 `Thinking ... 3s · 245 tokens · 82 tok/s`，并把每块 reasoning 的 markdown 提交替换为一行 `Thought for Xs · N tokens` 追溯行；#1872 增加 `show_thinking_stream` 顶层配置（默认 `false`，恢复旧版流式预览）（https://github.com/MoonshotAI/kimi-cli/pull/1872）。
- issue #1877（VS Code 插件）：compact 模式下 `Thinking... → Thought for Xs · N tokens` 单行**无法展开**回看完整 reasoning，直接的信息保真投诉，诉求"折叠卡片写入历史"（https://github.com/MoonshotAI/kimi-cli/issues/1877）。

**kimi-code（TS 世代，MoonshotAI/kimi-code）**
- `ThinkingComponent`（`apps/kimi-code/src/tui/components/messages/thinking.ts`，文件头注释）：「Renders thinking content in the transcript. Supports live in-place updates while thinking streams, then finalizes without replacing the component. Supports expand/collapse via Ctrl+O (shared with tool output).」——`ThinkingRenderMode = 'live' | 'finalized'`、`THINKING_PREVIEW_LINES` 常量、spinner 帧（https://github.com/xy200303/spec-kimi-code/blob/main/apps/kimi-code/src/tui/components/messages/thinking.ts；镜像素材，源仓库 MoonshotAI/kimi-code）。
- 流式管线：`onThinkingUpdate`（空 delta 不建组件）→ `thinkingDraft` → `flushThinkingToTranscript` → `onThinkingEnd`（commit 2e8c417 修复空 delta 时 spinner 泄漏，https://github.com/MoonshotAI/kimi-code/commit/2e8c417818bb68a71789e4966f18c2be6d39d835）；另有 whitespace-only thinking 隐藏修复（commit 1b907b0，#1829）。
- LivePane/转写结构：TUI 有 `transcriptContainer` / `activityContainer` 等分离容器与 `TRANSCRIPT_EXPAND_TURNS` / `TRANSCRIPT_HYSTERESIS` 常量（`apps/kimi-code/src/tui/kimi-tui.ts`，镜像仓库；LivePane 细节以官方仓库为准，**未逐行验证**）。

**对 pi 的启示**：`Thinking ... 3s · 245 tokens · 82 tok/s` 是本次调研中信息密度最高的流式行（时长+token+速率）；`Thought for Xs · N tokens` 是最完整的折叠行（时长+token）；「流式 live 原位更新 + 结束 finalize 不换组件 + Ctrl+O 展开（与工具输出共享）」三段式与 pi 的 ctrl+t/ctrl+o 语义高度对齐。#1877 证明：**折叠行必须存在可达的展开路径，否则就是保真 bug**。

### 4.5 Amp（ampcode.com，简查）

- 数据模型有 thinking：Plugin API 定义 `ThreadThinkingBlock { type: 'thinking'; thinking: string }`；`--stream-json-thinking` 标志在 stream-json 输出中包含 thinking blocks（https://ampcode.com/manual/plugin-api 、https://ampcode.com/manual/appendix）。终端内的折叠/展开交互形态**未验证**（公开文档未详述）。

### 4.6 先例对照表

| 产品 | 流式时 | 完成后 | 展开/回看 | 摘要行文案 | 配置 |
|------|--------|--------|-----------|------------|------|
| Claude Code | thinking 实时流入 transcript | 折叠为一行 | `Ctrl+O` transcript viewer（全局） | `∴ Thinking (ctrl+o to expand)`、`Thought for Xs` | `showThinkingSummaries`；`Alt+T` 开关 thinking |
| Gemini CLI | 加载行显示当前 thought；inline 气泡逐 thought | transcript 保留 thoughts 渲染（ThinkingMessage） | 设置切换 full/summary（full 优先） | "Thinking..." 斜体标题 + 竖线串联 | `ui.inlineThinking` 等设置（settings 表） |
| Codex CLI | 状态条 `Working/Thinking` + 紧凑 elapsed；reasoning summary 增量渲染 | transcript 保留 reasoning 块 | `hide_agent_reasoning` / `show_raw_agent_reasoning` | `thinking for Xs`（exec 单行） | `model_reasoning_summary=auto/detailed` |
| Kimi (kimi-cli) | 单行 `Thinking ... 3s · 245 tokens · 82 tok/s` | 一行 `Thought for Xs · N tokens` | 早期不可展开（#1877 投诉）→ 需 `show_thinking_stream=true` 回流式 | 同左 | `show_thinking_stream`（默认 false） |
| Kimi (kimi-code) | ThinkingComponent live 原位更新 + spinner + 预览行数 | finalize（不换组件） | `Ctrl+O` 展开/折叠（与工具输出共享） | `Thought for Xs` 类（细节未逐行验证） | — |
| **pi 0.84.x（现状）** | 与完成后完全一致：全文 Markdown 流式重渲染 | 保持全文（无折叠）；或隐藏模式一行静态标签 | `ctrl+t` 全局显隐（重建 chat） | `Thinking...`（可经 `setHiddenThinkingLabel` 定制） | settings `hideThinkingBlock`（默认 false） |

---

## 5. 机会点与风险

### 5.1 纯公共 API 即可实现（public-first 安全区）

1. **流式 thinking 状态行**：`pi.on("message_update")` 消费 `assistantMessageEvent`（`thinking_start/delta/end`）自建状态机（段数、起始时间→elapsed、累积字符/token 估算），经 `ctx.ui.setWorkingIndicator` + `setWorkingMessage` 呈现原生 spinner + 动态行（seam 1/6/7）。结束时把统计冻结进折叠行文案。
2. **折叠行（隐藏态）文案升级**：`ctx.ui.setHiddenThinkingLabel("Thought for 12s · 847 tokens (ctrl+t to expand)")`（seam 4）。注意 `/reload` 会重置、无 getter（需自己缓存上次设置值）。
3. **可见态 thinking 的文本级紧凑化**：`registerMarkdownTransformer` 以 `messageType === "assistant-thinking"` 过滤，按 `isStreaming`/`availableWidth` 做尾部窗口（如流式只保最后 N 行 + 省略号头部）、完成后加元数据首行（seam 3）。信息保真由 `/export`（恒全文）与 session jsonl 兜底。
4. **状态与主题**：footer `ctx.ui.setStatus`、主题 token（`thinkingText`、级别色）直接复用（seam 7/8）。

### 5.2 必须保持 native（公共 API 无法安全控制）

- **thinking 显隐切换本身**（`ctrl+t` 行为、设置持久化、chat 重建）：无扩展 setter/getter（seam 5）；自行写 settings.json 不生效且非公共契约。
- **逐块/逐消息折叠交互**：`AssistantMessageComponent` 的隐藏标签是静态 Text，无输入处理、无 setExpanded；transcript 组件树不受扩展控制（seam 9/10）。
- **export-html / share 的 thinking 呈现**：模板硬编码（seam 13）。
- **编辑器边框的 thinking 级别色**：由 `updateEditorBorderColor` 驱动（`interactive-mode.js:3309-3317`），扩展只能并行另设边框场景，不宜覆盖。

### 5.3 需要上游 seam（可作为给 pi 的 issue 草案）

1. `ctx.ui.getHiddenThinkingLabel()` / `getHideThinkingBlock()`（读侧对称；参照已有的 `getToolsExpanded`）。
2. `ctx.ui.setHideThinkingBlock(bool)` 或 thinking 显隐事件的扩展通知（现在扩展对 ctrl+t 完全无感知，`setHiddenThinkingLabel` 会在隐藏态才可见，扩展无从得知当前态）。
3. Markdown transformer 的增量上下文（当前每帧全量字符串；若给 `contentIndex`/run 边界/delta 长度，尾部窗口实现可省 O(n) 重扫）。
4. （更远）per-message 渲染定制：如 assistant message 级 renderer 或 thinking 折叠组件 seam——这将允许真正的逐块展开，但改动面大。

### 5.4 风险与边界条件

- **transformer 性能**：`message_update` 每帧对整段 thinking Markdown 跑全部 transformer（含 mermaid），尾部窗口必须轻量（避免正则回溯灾难）；transformer 异常会被吞掉保留原文（`markdown-transform.js` 的 try/catch），降级安全但需自测。
- **流式重渲染闪烁**：pi 每帧 `updateContent` 重建子组件；transformer 输出长度抖动（窗口滑动）会造成视觉跳动，Kimi PR #18033 的"每事件一块避免闪烁"是反例参考。
- **签名/加密块**：`redacted: true` 的块只有占位文案，摘要行应识别并显示 `redacted` 而非假装有内容（数据在 `thinkingSignature`，**不要**渲染）。
- **`hideThinkingBlock` 默认 false**：多数用户看到的是全文流。Compact 的目标态（完成后折叠）若用 transformer 实现，是"改可见态文本"而非"改显隐"，两者叠加时的观感需要在 spec 里定义。
- **`/reload` 与 `resetExtensionUI`**：`setHiddenThinkingLabel()` 会被重置（`interactive-mode.js` `resetExtensionUI` 末尾）；扩展需在 `session_start`（reason: reload）重新应用。
- **多 run 合并**：原生把相邻 thinking 块合并渲染（§2.3）；transformer 收到的是合并后字符串，"每块"元数据（块数）在 message events 侧统计，两个数据源要对齐。
- **版本漂移**：本调研基于 0.84.2（仓库）/0.84.3（全局）；0.84.3 已新增 `/thinking` 命令与级别选择搜索，seam 表需在升级时复核。

---

## 6. 对 /to-spec 的建议问题清单

1. **目标形态**：Compact Thinking 的验收形态是哪种组合？(a) 流式状态行（spinner+elapsed[+tokens]）；(b) 完成后折叠行（`Thought for Xs · N tokens (ctrl+t to expand)`）；(c) 可见态文本紧凑化（尾部窗口）。各自独立成用户可见开关，还是默认全开？
2. **展开反馈语义**：公共 API 下"展开"只能引导用户按 `ctrl+t`（全局显隐，非本块）。折叠行文案是否固定提示 ctrl+t？是否接受"展开=显示全部 thinking（全局）"的近似？（对照 Claude Code/Gemini 的全局/分档差异）
3. **摘要行数据**：时长（必须？）、token（`Usage.reasoning`，provider 不报则降级为字符数/估算？）、块数、首行预览——哪些进折叠行？流式行要不要速率（tok/s，Kimi 式）？
4. **可见态是否动**：transformer 方案会改变"可见=全文"的现状。信息保真底线如何表述——"transcript 永不丢内容，只改呈现；全文始终在 /export 与 jsonl"？redacted 块的呈现文案？
5. **与 Working 指示器的关系**：流式 thinking 行是替换原生 Working 行（`setWorkingIndicator` 自定义帧 + `setWorkingMessage`）还是 widget 叠加？非 thinking 流式阶段（纯工具执行）显示什么？
6. **settings/键位**：是否为 compact 提供用户设置（本项目扩展自身配置 vs 复用 pi settings）？是否注册补充快捷键（`pi.registerShortcut`）用于"展开最近一段"？与 `ctrl+t`/`ctrl+o` 的键位冲突如何避免？
7. **`/reload` 恢复**：`setHiddenThinkingLabel` 会被重置，spec 是否要求扩展在 session_start 重新应用并自持状态（无 getter 的补偿）？
8. **上游 issue 分界**：5.3 的三个 seam（getter/setter、显隐事件、transformer 增量上下文）哪些必须先提给 pi 才纳入本 Capability 范围？还是全部延后、先做纯 public 版本？
9. **验收用例**：多 run interleaved thinking（toolCall 之间多段）、redacted thinking、超长 thinking（>1000 行）流式、`/reload` 后折叠行恢复、0.84.2/0.84.3 双版本兼容——哪些进 AC？

---

## 附：证据文件索引（本地）

| 文件 | 关键行 | 内容 |
|------|--------|------|
| `node_modules/@earendil-works/pi-coding-agent/package.json` | :3 | 本地版本 0.84.2 |
| `node_modules/@earendil-works/pi-tui/package.json` | :2 | pi-tui 0.84.2 |
| `node_modules/@earendil-works/pi-coding-agent/dist/index.js` | :48-49 | AssistantMessageComponent 等公共导出 |
| `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js` | :259-260, :277-278, :388-389, :1490, :1655-1665, :1885, :2247-2258, :2557-2560, :2571-2574, :2579-2582, :2608-2619, :2920-2922, :3309-3317, :3319-3328, :3371-3384, :3673-3678 | 见 §2 |
| `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/assistant-message.js` | :20, :40-51, :67, :108-121 | 见 §2.3 |
| `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/assistant-message.d.ts` | :9-19 | 公共类型签名 |
| `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/markdown-transform.js` | 整文件 | transformer 管线与异常降级 |
| `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/status-indicator.js` | :15-20 | WorkingStatusIndicator |
| `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/thinking-selector.js` | :8-17, :22-40 | 级别选择器与档位描述 |
| `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js` | :34, :66-72, :313 | thinkingText / 级别色 / getThinkingBorderColor |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js` | :578-580, :593-597 | hideThinkingBlock 读写 |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` | :94-95, :231, :607-611, :840-845, :920-921 | setHiddenThinkingLabel / ctx.thinkingLevel / 事件 / transformer |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/index.js` | :85-117 | 导出数据嵌入 |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/template.js` | :1242-1249 | thinking 导出渲染 |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/template.css` | :438-443, :449-454 | thinking 展开恒显/折叠恒隐 |
| `node_modules/@earendil-works/pi-tui/dist/index.js` | Components 节 | 无 AssistantMessageComponent 导出 |
| `node_modules/@earendil-works/pi-tui/dist/components/truncated-text.js` | :5-14 | 单行截断原语 |
| `~/.bun/install/global/node_modules/@earendil-works/pi-ai/dist/types.d.ts` | :27-28, :242-250, :278-283, :304-306, :400-441 | ThinkingLevel / ThinkingContent / Usage.reasoning / AssistantMessage / 流事件 |
| `~/.bun/install/global/node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js` | :430-440, :471-484, :499-507 | redacted_thinking / thinking_delta / signature_delta |
| `~/.bun/install/global/node_modules/@earendil-works/pi-agent-core/dist/types.d.ts` | :260, :388-398 | ThinkingLevel / AgentEvent(message_*) |
| `~/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/docs/keybindings.md` | Models and Thinking 节 | shift+tab / ctrl+t 官方语义 |
| `~/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` | :745-759, Widgets 节, Message and Entry Rendering 节 | thinking_level_select / ctx.ui / renderer |
| `~/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md` | [0.84.3], [0.84.2] | /thinking、encrypted reasoning replay 等 |
