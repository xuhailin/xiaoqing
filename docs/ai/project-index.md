# AI 协作导航入口（Project Index）

> **读者**：Cursor Auto、Claude Code、Codex 等 AI 协作者。  
> **目的**：在不大改既有 `docs/` 资产的前提下，提供**分层阅读顺序**，减少全仓库盲扫、把阶段性计划误当现行架构、以及跨模块边界误读。

---

## 1. 项目整体目标（一句话）

**小晴（XiaoQing）**：长期陪伴型对话助手 + 记忆/人格/认知管线 + 与 DevAgent（开发任务轨）及外部 Agent（受控协作）并存；统一从 Gateway 入站，按 channel 分流。

---

## 2. 核心模块地图（代码锚点）

| 域 | 主要职责 | 优先打开的代码目录 |
|----|----------|-------------------|
| 入站与路由 | HTTP → 锁 → `MessageRouter` → chat / dev | `backend/src/gateway/`、`backend/src/orchestrator/` |
| Chat / 助手主链 | 对话、意图、决策、工具、Prompt、后处理 | `backend/src/assistant/**` |
| 执行与技能 | Capability 注册与执行（Tool 轨） | `backend/src/action/**` |
| DevAgent | 异步 run、规划/执行/汇报、Workspace | `backend/src/dev-agent/**` |
| Agent Bus | 多 Agent 委托、回执投影、memory proposal | `backend/src/agent-bus/**` |
| Plan / 调度 | 提醒与计划调度（与 Dev 历史命名解耦后的核心域） | 见 `docs/plan-task-scheduler-refactor.md` 与代码中 `PlanSchedulerService` 等 |
| 前端 | Angular SPA、Dev 面板、认知/人生轨迹 UI | `frontend/src/app/**` |

**重要**：仓库内文档若仍写 `backend/src/xiaoqing/**`，应以 **`backend/src/assistant/**`** 为准（助手域已迁至 `assistant`）。

---

## 3. 文档分层：先读哪一层？

### 3.1 长期架构共识（AI 默认最高优先级）

这些描述**边界、原则、现行主链路**，优先于任何「计划稿」。

| 文档 | 用途 |
|------|------|
| `docs/current-system-boundary.md` | **当前生效边界**：单用户运行时、哪些 userId 字段只是预埋、执行域如何收口 |
| `docs/assistant-architecture-principles.md` | 五能力管线：感知 / 决策 / 执行 / 回复组织 / 回合后处理 |
| `docs/context-boundary.md` | Chat / DevAgent / Tool 三条硬边界 |
| `docs/PROJECT-SUMMARY.md` | 全景：目录、API、环境变量、阶段能力 |
| `docs/architecture-design.md` | 分层状态与模块交互（工程师向） |
| `docs/debug-trace-design.md` | Debug Trace（管线步骤可观测性） |

### 3.2 Skill 层（按主题收敛的「怎么改」）

先读对应 **skill**，再按需下钻原始设计文档（见各 skill 第 5 节）。

| Skill 文件 | 典型需求 |
|------------|----------|
| `docs/skills/chat-flow-skill.md` | 路由、意图、对话主链、回归与 trace、WorldState |
| `docs/skills/memory-system-skill.md` | 记忆、总结、Claim、人生轨迹、认知溯源、身份锚定 |
| `docs/skills/agent-bus-skill.md` | 小勤 / 外部 Agent、委托、memory proposal、Dev 与 Chat 隔离 |
| `docs/skills/workspace-task-skill.md` | Plan/Scheduler 改造说明、DevAgent UI 计划、工作区 |
| `docs/skills/persona-expression-skill.md` | 表达策略、语言风格、昵称/偏好、社会关系演进 |

### 3.3 原始设计 / 深度参考（按需查阅，非默认全文阅读）

| 目录或文件 | 性质 |
|------------|------|
| `docs/memory-growth-plan.md`、`docs/cognitive-trace-design.md`、`docs/life-record-design.md` 等 | 模块设计素材，细节多 |
| `docs/design/*`、`docs/social-relation-plan.md` | 演进计划与设计稿，**可能含未完成项** |
| `docs/requirements/*`、`docs/plans/*` | PRD、技术需求、OpenClaw 等专项计划 → **阶段性或历史语境** |
| `docs/0326/*`、`docs/plan/*` | 主链路重构与阶段计划；先看 `docs/plan/README.md` 再决定是否下钻 |
| `docs/archive/*` | 归档，追溯用 |

### 3.4 不应作为「当前系统真相」的文档

- `docs/plans/**` 中未标明「已落地」的条目  
- `docs/requirements/**` 中的目标描述（需与代码对照）  
- `docs/*-implementation-plan.md`、`*-plan.md` 中未验收的 Phase  
- `docs/archive/**`  

**规则**：若与代码冲突，**以当前代码为准**，再局部回写文档（见下文维护策略）。

---

## 4. 按需求类型的推荐阅读路径

### 对话 / chat / routing / intent / 回归

1. `docs/skills/chat-flow-skill.md`  
2. `docs/current-system-boundary.md`  
3. `docs/context-boundary.md`  
4. `docs/dialogue-regression-standard.md`、`docs/intent-policy-regression.md`  
5. 五能力原则：`docs/assistant-architecture-principles.md`

### 记忆 / trace / preference / identity / persona（数据与后处理）

1. `docs/skills/memory-system-skill.md`  
2. `docs/cognitive-trace-design.md`、`docs/memory-growth-plan.md`  
3. `docs/preference-evolution-trigger-guide.md`（Claim 展示与晋升排查）  
4. `docs/life-record-design.md`、`docs/identity-anchor-design.md`  
5. `docs/world-state-design.md`（与意图补全相关时）

### 表达 / 语气 / 称呼 / 人格输出

1. `docs/skills/persona-expression-skill.md`  
2. `docs/expression-policy-design.md`、`docs/language-style.md`  
3. `docs/design/nickname-preference-plan.md`、`docs/social-relation-plan.md`（后者偏演进路线图）

### Agent 协作 / DevAgent / OpenClaw

1. `docs/skills/agent-bus-skill.md`  
2. `docs/agent-collaboration-protocol.md`  
3. `docs/dev-agent-architecture.md`  
4. `backend/src/agent-bus/**`（实现对照）

### Workspace / task / scheduler / DevAgent UI

1. `docs/skills/workspace-task-skill.md`  
2. `docs/plan-task-scheduler-refactor.md`（含「已落地」说明与历史分析）  
3. `docs/dev-agent-ui-v2-implementation-plan.md`  
4. `docs/dev-agent-architecture.md`（Workspace、队列、执行器）

### 主链路重构 / 架构收敛（2026-03 批次）

1. `docs/plan/README.md`（先确认当前执行入口）  
2. `docs/0326/final-plan.md`（本轮执行总计划）  
3. `docs/plan/main-pipeline-refactor-master-plan.md`（母计划与全局结构）  
4. `docs/plan/session-state-model-design.md`（状态模型设计，规划中）

### UI / 前端视觉

1. `docs/frontend-ui-rules.md`、`docs/frontend-ui-checklist.md`  
2. 仓库 `.cursor/rules/ui-design-system.mdc`（令牌与组件模式）  
3. `frontend/src/styles/_variables.scss`

### 人类可读总目录（非 AI 专用）

- `docs/INDEX.md` — 按主题分类的全文档索引  

---

## 5. Skill 与 `docs/skills/` 下其他文件

| 路径 | 说明 |
|------|------|
| `docs/skills/*-skill.md`（本批五篇） | **架构向**技能说明：边界、入口、流程、坑 |
| `docs/skills/weather-skill-source.md`、`clawhub-skills.md` 等 | **具体技能**配置与来源，按需查阅 |
| `docs/skills/timesheet-entry/SKILL.md` 等 | 单技能实现说明 |

---

## 6. 修改代码前建议的阅读顺序（默认）

1. 本文件 — 确认需求属于哪一类主题。  
2. `docs/current-system-boundary.md` — 先确认当前运行时边界。  
3. 对应 **skill**（上表）。  
4. 相关 **长期架构**文档（第三节 3.1）。  
5. **直接读代码入口**（服务/编排类），再决定是否读计划文档。  
6. 涉及边界时必读 `docs/context-boundary.md` 与 `docs/dev-agent-architecture.md`（Dev 相关）。

---

## 7. 文档维护策略（与 `CLAUDE.md`、Cursor 规则一致）

### 必须更新文档的情况

- 新增**稳定核心模块**或公共入口（新服务、新轨道路由）  
- 某模块**职责边界**或**主流程入口**明显变化  
- 形成新的**长期架构约束**（值得写入原则或 skill）  
- 旧文档**明显误导**（路径错误、与实现对立的描述）

### 不必全量重写的情况

- 小样式、文案、小函数实现细节  
- 模块内部重构但**对外边界与入口不变**  
- 临时实验特性（未定型前可只写 PR 说明）

### 推荐维护方式

| 载体 | 更新频率 | 内容 |
|------|----------|------|
| `CLAUDE.md`、`.cursor/rules/*.mdc` | **低** | 稳定协作规则；少改、改则精准 |
| `docs/ai/project-index.md` | **中** | 模块地图、导航关系、分层说明变化时 |
| `docs/skills/*.md` | **中** | 哪个模块结构性变化，更新对应 skill |
| 原始 design / plan / requirements | **保留** | 深度设计与历史；**不作为 AI 默认首读** |

---

## 8. 当前 docs 的主要问题（审查结论）

1. **入口多**：`INDEX.md` 面向人类分类齐全，但 AI 缺少「先读 skill + 原则」的默认路径。  
2. **同一主题分散**：例如记忆成长、认知溯源、人生轨迹、偏好排查分属多文，需 skill 做**归一入口**。  
3. **长期与阶段混合**：`plans/`、`requirements/`、各类 `*-plan.md` 与现行架构文档并列，易被当成已上线事实。  
4. **路径演进**：部分旧文仍写 `xiaoqing` 路径，与 `assistant` 代码不一致 — 以代码为准，逐步局部修正。

本 `docs/ai/` 层即是针对 1–4 的**导航补丁**，不替代原有设计文档。
