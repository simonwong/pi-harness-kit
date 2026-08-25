# Pi 扩展套件命名与包拓扑惯例调研

> 调研日期：2026-08-25。本文给出证据、备选项与风险，不替项目作最终命名或边界决策。

## 摘要

- `better-*` 不是有辨识度的家族标记。在 Pi 生态内已经存在 `pi-better-harness` 及 `pi-better-subagents`、`pi-better-background-tasks`、`pi-better-goal`、`pi-better-sandbox` 等同一发布家族，也有 `pi-better-workflows`、`pi-better-ctx`、`pi-better-openai`、`pi-better-compact` 等其他作者的相同构词；继续使用未限定的 `better` 容易造成归属与能力边界混淆。[pi-better-harness manifest](https://raw.githubusercontent.com/1aboveio/pi-better-harness/main/packages/pi-better-harness/package.json) · [npm: pi-better-workflows](https://www.npmjs.com/package/pi-better-workflows) · [npm: pi-better-ctx](https://www.npmjs.com/package/pi-better-ctx)
- Pi 对“包”的原生单位很宽：一个 npm/Git 包可同时声明多个 extensions、skills、prompts、themes；`pi` manifest 存在时是资源清单，`pi-package` keyword 才让 npm 包进入 Pi package gallery。因此“一个套件包”完全可行，但一个 npm 包也只形成一个安装、发布与目录身份。[Pi 官方 packages 文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
- 真实生态同时采用三种拓扑：单一聚合包、每能力独立包、聚合元包加独立能力包；另有“基础能力 + 可选集成包”的做法。应按**是否需要独立安装、独立兼容承诺、独立发布节奏**切边界，而不是只按代码目录或 UI 位置切。
- npm scope 能解决注册表名字占用并明确发布归属，但不能消除语义近似或搜索结果混淆；即使采用 scope，仍应避免把 `better` 当作唯一辨识元素。[npm package-name guidelines](https://docs.npmjs.com/package-name-guidelines/) · [npm scopes](https://docs.npmjs.com/about-scopes/)

## 研究方法与口径

本次以四类一手材料交叉核对：Pi 官方包文档与 loader 源码、npm 包页面/registry metadata、项目 canonical GitHub 仓库、实际 `package.json` manifest。名称样本是截至调研日的注册表/搜索快照，不声称穷举 npm；正式发布前仍须再次查询目标精确名及近似名。

## 1. Pi 官方约束与惯例

### 1.1 名字与可发现性

Pi 官方示例只要求普通 npm `name`，没有强制 `pi-` 前后缀；官方要求/建议加入 `keywords: ["pi-package"]` 以进入 package gallery。也就是说，`pi-<capability>` 是生态惯例，不是 loader 协议。[Pi 官方 packages 文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)

npm 官方要求名字唯一、描述性强、全小写，并明确建议避免与既有包拼写相近或让用户误判作者。scope 是绑定用户/组织的命名空间，使不同 scope 可拥有相同 leaf name，并可聚合同一发布者的相关包。[npm package-name guidelines](https://docs.npmjs.com/package-name-guidelines/) · [npm scopes](https://docs.npmjs.com/about-scopes/)

**含义：**

- 未 scoped 的 `pi-<常用能力>` 可读性强，但处于全局命名空间，名字占用和近似名风险高。
- `@<owner>/pi-<capability>` 明确所有者、降低硬碰撞；leaf name 仍应具体，否则 gallery/npm 搜索中仍会与同名能力包并列。
- repo 名、npm 包名、Pi 中显示的 package source 是不同身份；不要假定 repo umbrella 自动为多个发布包提供单一安装身份。

### 1.2 一个 Pi 包能装什么

`package.json` 的 `pi` 字段可列出任意组合的 `extensions`、`skills`、`prompts`、`themes`，路径相对包根目录且支持 glob/exclusion；没有 manifest 时才按约定目录自动发现。官方 loader 源码还显示，扩展目录只自动发现直接文件或一层子目录的 `index.ts/js`，复杂布局应使用明确 manifest。[Pi 官方 packages 文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md) · [Pi extension loader](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/loader.ts)

因此，多 surface 并不强迫多 npm 包：一个包可以声明多个 extension entry。反过来，源码 monorepo 也不等于一个 Pi 包：每个可独立发布目录都需要自己的 npm metadata 与 `pi` manifest。

## 2. `better-*` 的辨识度与碰撞风险

### 2.1 Pi 内已有直接相邻家族

最强的相邻证据不是通用 npm 包，而是同一 Pi 命名空间中的现有家族：

- `pi-better-harness` 是聚合包；其真实 manifest 依赖并汇集 `pi-better-background-tasks`、`pi-better-goal`、`pi-better-sandbox`、`pi-better-subagents`。根仓库是 workspace monorepo，而聚合包位于 `packages/pi-better-harness`。[聚合包 manifest](https://raw.githubusercontent.com/1aboveio/pi-better-harness/main/packages/pi-better-harness/package.json) · [根 manifest](https://raw.githubusercontent.com/1aboveio/pi-better-harness/main/package.json)
- 其他发布者也已使用 `pi-better-workflows`、`pi-better-ctx`、`pi-better-openai`、`pi-better-compact`，以及 scoped 的 `@lll9p/pi-better-compaction`、`@tryinget/pi-better-openai`。[npm: workflows](https://www.npmjs.com/package/pi-better-workflows) · [npm: ctx](https://www.npmjs.com/package/pi-better-ctx) · [npm: openai](https://www.npmjs.com/package/pi-better-openai) · [npm: compact](https://www.npmjs.com/package/pi-better-compact) · [npm: scoped compaction](https://www.npmjs.com/package/@lll9p/pi-better-compaction)

这说明 `pi-better-*` 已经是多人重复使用的评价式模板，而非指向单一产品线的独特品牌。尤其 `pi-better-harness` 与本项目 repo 名 `pi-harness-kit` 语义距离很近：即便目标 leaf 名尚未被占用，也有来源误认、口碑串线、搜索噪声和未来能力名撞车风险。

### 2.2 更广 npm 生态也证明 `better` 是通用修饰词

`better-sqlite3` 与 `better-auth` 是成熟且高可见度的独立项目；它们不构成 Pi 包硬碰撞，却说明 `better` 长期被用作“替代/改进版”的泛化形容词，而非可独占品牌。[npm: better-sqlite3](https://www.npmjs.com/package/better-sqlite3) · [npm registry metadata: better-auth](https://registry.npmjs.org/better-auth)

**判断：** `better-*` 的硬碰撞风险取决于完整 npm 名；辨识度低与软碰撞风险则已经成立。scope 可消除“完整名已占用”的大部分风险，不能消除 `better` 带来的归属含混。

## 3. 相关现有名字与构词模式

### 3.1 能力/界面导向的 `pi-<capability>`

真实包大量直接表达用户可见能力，例如 `@xzzpig/pi-notify`、`@xzzpig/pi-tool-display`、`@xzzpig/pi-starline`；其 monorepo 每个目录拥有自己的安装身份。[xzzpig root manifest](https://github.com/xzzpig/pi-extensions/blob/main/package.json) · [pi-notify](https://github.com/xzzpig/pi-extensions/tree/main/packages/pi-notify) · [pi-tool-display](https://github.com/xzzpig/pi-extensions/tree/main/packages/pi-tool-display) · [pi-starline](https://github.com/xzzpig/pi-extensions/tree/main/packages/pi-starline)

但常用 surface 词已经拥挤：npm 上同时存在多个 scoped `pi-statusline` 和 `pi-notify`，以及 unscoped/scoped `pi-tool-display`。这类名字利于搜索理解，却不天然利于来源辨识。[npm: @feniix/pi-statusline](https://www.npmjs.com/package/@feniix/pi-statusline) · [npm: @narumitw/pi-statusline](https://www.npmjs.com/package/@narumitw/pi-statusline) · [npm: @wuyaos/pi-notify](https://www.npmjs.com/package/@wuyaos/pi-notify) · [npm: pi-tool-display](https://www.npmjs.com/package/pi-tool-display)

### 3.2 umbrella / harness / extensions

`pi-harness` 也不是唯一语义：npm 已有 `@minhduydev/pi-harness`、`@osmargm1202/pi-harness`、`@baryonlabs/pi-agent-harness`；`pi-extensions` 常被用作仓库或组织集合名。[npm: @minhduydev/pi-harness](https://www.npmjs.com/package/@minhduydev/pi-harness) · [npm: @osmargm1202/pi-harness](https://www.npmjs.com/package/@osmargm1202/pi-harness) · [npm: @baryonlabs/pi-agent-harness](https://www.npmjs.com/package/@baryonlabs/pi-agent-harness) · [@pi-extensions monorepo](https://github.com/smarzban/pi-extensions)

**风险提示：** 保留 `pi-harness-kit` 作为 repo/umbrella 可以延续项目语境，但若作为公开包名，最好用 owner scope；给每个功能包机械重复 `harness-kit` 会增加长度，却未必提升能力搜索命中。

## 4. 包拓扑方案及取舍

### 方案 A：一个发布包，多个资源/entry

示意：`@owner/pi-harness-kit`，manifest 内列出所有扩展、skills、prompts、themes。

**优势**

- 一个安装命令、一个 gallery 卡片、一个版本与变更日志。
- 共享实现可保持包内私有，无跨包版本协议。
- 适合必须共同升级、用户通常全量启用、体量与依赖相近的功能。

**风险**

- 任一 surface 的 breaking change 都推动整个包版本；故障与权限审查半径较大。
- 用户即便通过 Pi resource filters 不加载某些资源，仍安装同一 tarball 及其 runtime dependencies；“选择加载”不等同“选择安装”。官方 settings 支持逐包过滤资源，但 package source 仍是单一包。[Pi 官方 packages 文档：resource filtering](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
- gallery 只有 umbrella 身份，单项能力的独立搜索、采用量和弃用路径较弱。

### 方案 B：按独立用户能力/surface 分包

示意：`@owner/pi-<capability-a>`、`@owner/pi-<capability-b>`；同一 monorepo 管理，各自有 manifest、README、版本。

**优势**

- 用户可选择安装；重依赖、实验功能或高权限能力不污染其他安装。
- 每项能力能独立发布、回滚、弃用和呈现 gallery/npm 文档。
- 真实先例包括 `@xzzpig/pi-*` 和 `@pi-extensions/pi-*`；后者明确采用 one extension per package。[xzzpig/pi-extensions](https://github.com/xzzpig/pi-extensions) · [smarzban/pi-extensions](https://github.com/smarzban/pi-extensions)

**风险**

- 发布、版本、provenance、README 与兼容矩阵的维护成本按包数增长。
- 若一个用户任务跨多个 surface，按 UI 位置切包可能造成循环依赖或要求用户理解内部结构。
- 共享逻辑若靠复制会漂移；若抽 core，又进入方案 C 的兼容成本。

### 方案 C：共享 core + feature/integration 包

示意：`@owner/pi-<domain>-core`（或内部私有库）加 `@owner/pi-<capability>` / `@owner/pi-<domain>-<integration>`。

真实例子是 `@gotgenes/pi-subagents-worktrees` 对 `@gotgenes/pi-subagents` 声明 peer dependency；它把可选 worktree integration 从基础 subagents 能力中抽出，并要求明确加载顺序。[worktrees manifest](https://github.com/gotgenes/pi-packages/blob/main/packages/pi-subagents-worktrees/package.json) · [worktrees README](https://github.com/gotgenes/pi-packages/blob/main/packages/pi-subagents-worktrees/README.md) · [subagents README](https://github.com/gotgenes/pi-packages/blob/main/packages/pi-subagents/README.md)

**优势**

- 稳定领域模型可复用；可选 surface/adapter 独立安装。
- 重依赖和平台特定代码停留在叶子包；core 可被测试或其他入口复用。

**风险**

- core 一旦公开，就形成版本兼容承诺；feature/core 的 peer 或 direct dependency 策略需要明确。
- 加载顺序、重复实例、跨版本 API 是新的运行时风险；gotgenes 的实际包已经要求 core 先于 integration 加载。
- 若只有两个很小 entry、共享代码不需要第三方消费，提前公开 core 会制造“架构税”。可先让 core 保持 monorepo 内部模块，等出现第二个真实消费者再发布。

### 方案 D：独立 feature 包 + 可选 meta/aggregate 包

示意：若干 `@owner/pi-<capability>`，另有 `@owner/pi-harness-kit` 作为一键安装组合。

`pi-better-harness` 是直接先例：聚合 manifest 依赖四个独立 `pi-better-*` 包。[pi-better-harness manifest](https://raw.githubusercontent.com/1aboveio/pi-better-harness/main/packages/pi-better-harness/package.json)

**优势**：兼顾“装全部”和选择性安装，umbrella 可做稳定入口。  
**风险**：需定义 meta 版本与成员版本的关系、重复安装/迁移行为、成员弃用与兼容测试；并会多出一个 gallery/npm 身份。若当前没有明确的“全装”用户旅程，不应只为看起来完整而增加 meta 包。

## 5. 可供决策的命名方向（非结论）

| 方向 | 示例形状（占位符，不代表可用性） | 适合 | 主要风险 |
|---|---|---|---|
| owner-scoped umbrella | `@owner/pi-harness-kit` | 单包或 meta 包；延续 repo 身份 | `harness` 较泛，单项能力搜索弱 |
| owner-scoped capability | `@owner/pi-<capability>` | 每能力独立安装 | 常见 leaf name 拥挤；必须逐个查精确名/近似名 |
| umbrella family + capability | `@owner/harness-kit-<capability>` | 强调同一套件家族 | 较长；Pi 语境不如 `pi-` 直接 |
| distinct coined family | `@owner/<brand>-pi`、`@owner/<brand>-<capability>` | 希望建立可归属品牌 | 需验证读音、商标、搜索与跨语言含义 |
| domain + role | `@owner/pi-<domain>-core`、`…-<integration>` | 共享 core + feature | 名字会固化架构承诺，不能先命名后找边界 |

不建议只用 `better` 区分产品线；也不建议把 `core`、`shared`、`kit` 当作无明确消费者/契约的兜底桶。无论选择哪一方向，发布前应对完整名、去掉 scope 后的 leaf name、连字符/单复数近似名做一次 npm registry 查询。

## 6. 建议先回答的边界判据

1. 哪些能力必须能够**单独不安装**（而不只是“不加载”）？是否有重依赖、不同权限或不同稳定性？
2. 用户认知的功能边界是 surface（footer、tool display、notification），还是一个跨 surface 的领域工作流？后者不应为 UI 位置被硬拆。
3. 是否已有至少两个真实消费者需要共享 core？该 core 是运行时单例/API，还是仅可复制编译的内部代码？
4. 是否承诺各 feature 独立 SemVer/发布？如果不承诺，monorepo 多包的用户价值是否足以覆盖发布成本？
5. Git 安装是一级渠道还是仅开发渠道？若一级渠道，仓库根应该装 aggregate 还是只装一个包；独立 feature 是否主要通过 npm 安装？
6. umbrella/meta 包是包含资源，还是只依赖成员包？怎样避免安装 meta 后又手装成员造成配置重复或来源困惑？
7. 对外名称主要优化 npm/gallery 搜索、GitHub repo 识别，还是命令/配置中的短名称？三者是否需要同名？

## 结论边界

证据足以排除“`better-*` 天然独特”这一前提，也证明 Pi 并不强迫单包或多包。最终选择仍取决于尚未确定的安装独立性、兼容承诺与用户任务边界；本文因此保留 owner-scoped umbrella、owner-scoped capability、distinct family，以及三类主要拓扑作为候选，而不指定胜者。
