## XiaoQing / DevAgent 项目说明（给 Claude）

> 本文件用于指导你（Claude）在本仓库内工作的方式，与人类协作者保持一致的约定与边界。

---

### 1. 项目概览（你在做什么）

- **项目定位**：小晴（XiaoQing）是一个长期陪伴型 AI，包含「聊天陪伴 + 记忆系统 + 人格进化 + DevAgent 开发助手 + 桌宠」等能力。
- **技术栈**：
  - 后端：NestJS + TypeScript（目录在 `backend/`）
  - 前端：Angular 21 SPA（目录在 `frontend/`）
  - ORM & 数据库：Prisma + PostgreSQL
  - DevAgent：在 `backend/src/dev-agent/`，负责开发类任务的规划 / 执行 / 报告
  - 桌宠：Tauri + PixiJS + Live2D（目录在 `desktop/`）—— **暂未启动开发，当前阶段请忽略此模块**
- **高层架构**：统一入口 `Gateway → MessageRouter`，将请求路由到：
  - Chat 通路：`backend/src/xiaoqing/**`
  - Dev 通路：`backend/src/dev-agent/**`
  - 工具与执行器：`backend/src/action/**`、`backend/src/dev-agent/executors/**`

你在这里的角色是：**协助修改/扩展代码与文档，并始终朝向既定架构目标演进**。

---

### 2. 助手管线架构目标（必读）

**基准文档**：`docs/assistant-architecture-principles.md`。

小晴助手管线的长期目标是：**围绕五能力（感知、决策、执行、回复组织、回合后处理）形成清晰的认知管线**，而不是多处分散的决策与推理。

你在修改或扩展 `backend/src/xiaoqing/**` 及相关对话/助手逻辑时：

- **决策权集中**：只有「决策层」做行动决策，不把决策分散到意图、推理、Prompt 路由等。
- **意图只描述含义**：意图识别描述用户想表达什么，最终行为由决策层决定。
- **回复层只做表达**：对话模型负责怎么说，不再做系统路由或行为选择。
- **新增能力必须归属明确**：新功能必须能明确归入五能力之一，否则需重新设计。
- **优先架构清晰**：尚未上线，允许结构性重构与移除过时层级，不强制向后兼容。

详见 `docs/assistant-architecture-principles.md`。

---

### 3. 全局工作原则

1. **遵守仓库已有规则文件**
   - `AGENTS.md` 与 `.cursor/rules/**/*.mdc` 中的约定优先生效。
   - 特别是：
     - `no-new-tests-by-default.mdc`：**不要主动新增或补写任何测试文件**（`*.spec.*`、`*.test.*` 等），除非用户明确要求。
     - `ui-design-system.mdc`：前端/样式修改必须使用已有设计系统的 CSS 变量与布局模式，禁止硬编码颜色与随意 radius。

2. **修改文档前必须先读代码**
   - 参考 `.cursor/skills/supplement-docs/SKILL.md`：
     - 若要改 `docs/**` 或 `README.md`，先用 `Glob`/`Read` 查看对应模块的真实实现，再更新文档。
     - 不凭记忆和猜测描述系统行为，**以代码与最新文档为准**。

3. **保持架构与边界清晰**
   - 不把 DevAgent 的逻辑写回聊天主链（`backend/src/xiaoqing/**`）。
   - 不在 DevAgent 内直接调用 Memory / Summarizer / Cognitive Pipeline 等聊天能力，相关说明见 `docs/dev-agent-architecture.md` 与 `docs/context-boundary.md`。
   - 若新增能力，**优先通过清晰的 service / adapter / executor 扩展点实现**，避免在核心 service 中堆积分支逻辑。

4. **偏好小步、可回顾的改动**
   - 拆分为易于 review 的小变更：类型声明 → 业务逻辑 → UI。
   - 任何「可能破坏执行安全性或隔离性」的改动（Shell 执行、Workspace 管理、权限控制）要特别谨慎，优先沿用现有模式。

5. **Feature Flag 与 .env.example 同步**
   - 在 `backend/src/config/feature-flags.ts` 中新增或修改 feature flag 时，**必须同步更新** `backend/.env.example`，包含：
     - 变量名与默认值
     - 一行简要说明用途
     - 若有灰度/切换步骤，在注释中写明
   - 不允许存在"代码中有 flag 但 .env.example 中没有"的情况。

---

### 4. DevAgent 相关约定（`backend/src/dev-agent/**`）

阅读基准文档：`docs/dev-agent-architecture.md`。

**核心目标**：
- Dev 任务通过统一入口接入，使用 **异步队列** 后台执行。
- Dev 任务与聊天主链隔离，不污染记忆 / 总结 / 成长等组件。
- `DevAgentService` 保持「薄入口」，核心编排在 `DevAgentOrchestrator`、`DevTaskPlanner`、`DevStepRunner` 等专职模块中。

**你在这里需要遵守的要点**：

1. **入口与路由**
   - 统一入口：`POST /conversations/:id/messages`，路由规则在 `backend/src/gateway/message-router.service.ts` 与 `backend/src/orchestrator/dev-agent.adapter.ts` 中。
   - 路由优先级（不可随意修改）：
     1. 显式 `mode: 'dev'`
     2. `/dev` 或 `/task` 前缀
     3. LLM 意图分类命中 dev
     4. 其他走 chat
   - 如需调整路由策略，必须保证：
     - **前置路由**：在消息落库前完成判定；
     - **保守降级**：不确定时降级为 chat；
     - 不破坏 `ConversationService` 的主业务链。

2. **执行与安全**
   - 执行链路：`DevRunRunnerService → DevAgentOrchestrator → DevTaskPlanner / DevStepRunner / DevProgressEvaluator / DevReplanPolicy / DevFinalReportGenerator / DevTranscriptWriter`。
   - 执行器在 `backend/src/dev-agent/executors/**` 中：
     - `ShellExecutor`：有白名单 / 黑名单 / 高风险语法拦截，**不要随意放宽安全策略**。
     - `OpenClawExecutor`：委派到 OpenClaw。
     - `ClaudeCodeExecutor`：委派到 `ClaudeCodeStreamService`，受 `FEATURE_CLAUDE_CODE` 开关控制。
   - 任何新增执行方式，需走：
     - 能力声明 → `CapabilityRegistry`
     - 执行器实现 → `IDevExecutor` 实现类
     - 路由策略 → `DevStepRoutingService`

3. **Workspace 与隔离**
   - 工作区管理在 `backend/src/dev-agent/workspace/workspace-manager.service.ts`：
     - 支持 `shared` 和 `worktree` 两种模式。
     - 通过 `DEV_AGENT_ALLOWED_WORKSPACE_ROOTS` 环境变量限制可访问路径。
   - 你在修改相关逻辑时，要确保：
     - 不在未校验路径下执行命令；
     - 若 session 已绑定 workspace 且不可用，run 要明确失败，而不是静默退回默认目录。

4. **调度与提醒**
   - 队列串行：同一 `DevSession` 下的 run 必须串行执行，使用 `KeyedFifoQueueService`。
   - 提醒与定时任务逻辑在 `DevReminderService` 与 `DevReminderSchedulerService` 中，受 `FEATURE_DEV_REMINDER` 控制。
   - 变更这些模块时，注意不要引入「重复执行」或「漏执行」的问题。

---

### 5. Debug Trace / 溯源模式

参考：`docs/debug-trace-design.md`。

- 后端通过 `TraceStep[]` 和 `TurnTraceEvent[]` 结构采集一次对话中的关键决策步骤（意图识别、策略决策、记忆召回、工具调用、Prompt 构建、LLM 生成等）。
- 前端将 trace 渲染为「Pipeline Badge Bar」，取代简单的 "via OpenClaw" 标签。

你在这里修改时要注意：

- **保持向后兼容**：`trace` 字段在 API 中是新增字段，不要移除旧的 `debugMeta` 字段，除非项目已经统一迁移。
- **避免返回过大的数据**：trace 中不要塞完整 prompt 文本，只保留必要的统计信息与简要预览。

---

### 6. 前端与 UI 约定

涉及 `frontend/**` 时：

1. **统一设计系统**
   - 所有颜色 / 间距 /圆角 /阴影都来自 `styles/_variables.scss` 中的 CSS 自定义属性。
   - 组件级样式引用 `var(--token-name)`，不要写死 hex 值、px 值（除非已有约定）。
   - 布局优先使用 Flex / Grid，符合 `ui-design-system.mdc` 中的模式（左侧 sidebar + 右侧主内容）。

2. **DevAgent 前端**
   - DevAgent 面板入口在 `frontend/src/app/dev-agent/**`。
   - 需要展示的信息包括：
     - 当前会话与 run 状态；
     - 工作区（`workspaceRoot` / `projectScope`）；
     - 运行结果与 `transcript.jsonl` 的关键信息。
   - 新增字段或视图时，记得同步更新：
     - 对应的 TypeScript 类型（如 `DevSession`、`DevRun`）；
     - 后端返回的 DTO 结构。

---

### 7. 文档与 README 维护

当你需要补文档或同步说明时：

- **优先更新现有文档**，而不是新建一堆零散文档：
  - 助手管线架构：`docs/assistant-architecture-principles.md`
  - DevAgent：`docs/dev-agent-architecture.md`
  - Debug Trace：`docs/debug-trace-design.md`
  - 总体架构 / API：`docs/PROJECT-SUMMARY.md`
- `README.md` 中的中英文说明要与以上文档保持一致：
  - 架构图、关键模块名称、API 路径、启动方式如有变更，需要一并更新。

更新文档时，请在总结中简要说明：

- 读了哪些代码 / 文档；
- 发现哪些与现状不符；
- 最终改了哪些段落或表格。

---

### 8. 你可以如何协助

在本项目中，你适合做的事情包括（但不限于）：

- 梳理和优化 DevAgent 的执行路径、类型定义和错误处理；
- 扩展 DevAgent 的执行器能力（在保证安全隔离的前提下）；
- 调整前端 DevAgent 面板与 Debug Trace UI，让调试体验更清晰；
- 在严格遵守「先读代码再补文档」的前提下，补全中文文档与架构说明。

不建议你做的事情：

- 擅自放宽 Shell 执行安全策略；
- 无视文档/架构中的既有边界，将 DevAgent 与聊天主链强耦合；
- 任意新增或重写测试文件；
- 在没有阅读对应模块实现的前提下改文档。

