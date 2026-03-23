---
name: supplement-docs
description: Unified docs sync skill: first read relevant code, then update docs to match behavior (including requirements/behavior changes). Use when 文档补齐/对齐代码、以及“更新需求/改行为”需要同步 PRD 与 PROJECT-SUMMARY.
---

# 补充文档（必先读代码）

## 核心原则

**补充文档必须先读代码。** 以代码与真实行为为准更新文档，禁止仅凭记忆或猜测改文档。

## 使用时机

用户说「补充文档」「同步一下文档」「文档和代码对不上」「更新架构文档」「把 dev-agent 文档补一下」等时，启用本 skill。

## 需求变更同步（当用户说「更新需求/改行为」时）
若用户说「更新需求」「改一下这个需求」「这个功能的行为要调整一下」等与需求/行为变更相关的话题，本 skill 仍按同一套“先读代码事实 → 再对齐文档”的流程执行，并将更新范围优先映射到：

- `docs/PROJECT-SUMMARY.md`：全局能力/模块结构/API 总览/数据模型增删改
- `docs/requirements/PRD-00-总览与约定.md`：总体约定/禁止事项/阶段目标/术语
- `docs/requirements/PRD-01-Phase1-基础对话与记忆.md`：Phase 1（基础对话与记忆）
- `docs/requirements/PRD-02-Phase2-记忆注入与人格双池.md`：Phase 2（记忆注入 + Persona 双池 + Prompt Router 相关）
- `docs/requirements/PRD-03-Phase3-人格细化与读物摄入.md`：Phase 3（人格细化/读物摄入/成本优化/表达策略相关）

更新原则：
- 以「当前代码行为 + 用户最新口头约定」为准；允许直接覆盖旧描述，不保留冗长历史版本
- 若 PRD 与 `PROJECT-SUMMARY.md` 存在出入，必须一起修到一致

## 操作流程

### 1. 确定范围

- 用户若已指明模块或文档（如「dev-agent」「PRD-01」「PROJECT-SUMMARY」），以该范围为主。
- 未指明时，根据对话上下文推断（例如刚改过 dev-agent → 优先 `docs/dev-agent-architecture.md` 与相关 backend 代码）。

### 2. 读代码（必做）

在改任何文档之前，必须对目标模块做一次「代码事实」采集：

- **目录与文件**：列出该模块下真实存在的 `.ts` 文件（如 `backend/src/dev-agent/**/*.ts`），与文档中的「目录结构」对比。
- **关键类型与 API**：若文档描述了服务/接口/类型，读取对应源码中的类名、方法签名、导出类型，确认命名与职责。
- **流程与依赖**：若文档描述了调用链（如 A → B → C），在代码里确认 A 是否真的调用 B、B 是否真的调用 C（grep 引用或读关键方法）。

可用的读代码方式示例：

- `Glob` / `Grep`：找模块下文件、类名、导入关系。
- `Read`：读具体服务/控制器/类型定义文件。

### 3. 文档与代码对比

- 列出文档中声称的「目录结构 / 服务列表 / 流程」与步骤 2 得到的事实差异。
- 差异项即为本次需要增、删、改的内容。

### 4. 更新文档

- 只修改与代码不一致或缺失的部分；不要重写整篇除非用户明确要求。
- 若项目有 `docs-sync` 规则，文档职责划分按现有约定（如 `PROJECT-SUMMARY.md`、`PRD-00/01/02/03`、`architecture-design`、`dev-agent-architecture` 等）写入对应文件。
- 允许覆盖旧描述，不必保留冗长历史；必要时用简短「变更说明」即可。

### 5. 汇报

- 用一两句话说明：**读了哪些代码**、**发现哪些与文档不一致**、**改了哪些文档的哪些部分**。

## 文档职责速查（与本项目一致）

| 文档 | 何时更新 |
|------|----------|
| `docs/PROJECT-SUMMARY.md` | 模块/API/数据模型增删改 |
| `docs/requirements/PRD-00~03` | 需求与阶段行为变更（本 skill 覆盖） |
| `docs/architecture-design.md` | 分层、World State、记忆、设计权衡 |
| `docs/dev-agent-architecture.md` | DevAgent 目录、服务、流程、路由、执行器、常量 |
| `docs/context-boundary.md` | Chat/Dev/Tool 边界与隔离规则 |
| `docs/debug-trace-design.md` | Trace/调试元数据结构与约定 |
| `docs/INDEX.md` | 新增/删除/重命名文档时更新索引 |

## 反例（禁止）

- ❌ 不读代码就改文档。
- ❌ 文档里写「有 X 服务」但代码里已改名为 Y，只改文案不改文档中的服务名/文件名。
- ❌ 目录结构一节与实际 `backend/src/...` 不一致却不更新目录结构。

## 示例（对话层面）

- 用户：「把 dev-agent 的文档补一下。」
  - 做：Glob `backend/src/dev-agent/**/*.ts`，读 `dev-agent.module.ts` 与 execution/、planning/ 下关键文件，对比 `docs/dev-agent-architecture.md` 的目录与职责描述，缺则补、错则改，最后汇报改了哪几处。

- 用户：「文档和代码对不上，你同步下。」
  - 做：先问或推断是哪个模块/哪份文档；对该模块读代码（目录+关键类型），再对比对应 doc，逐项修正并汇报。
