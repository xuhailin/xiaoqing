# 工作区、计划与 Dev UI（Workspace & Task）

## 1. 模块目标

- **负责什么**：DevAgent 的 **Workspace** 绑定与校验（shared/worktree）、**异步 Run 队列**与编排入口、与 **Plan / 调度**相关的系统级定时与提醒迁移后的职责归属；Dev 前端「线程工作台」信息架构与分阶段落地。  
- **不负责什么**：Chat 轨上的日常意图与记忆；单条消息的 Prompt 内容组装；具体 Shell 命令业务含义（属各执行器与规划器）。

## 2. 领域边界

- **Workspace 路径**：必须在允许根目录内解析；session 已绑定但路径不可用时**应失败**，而非静默落到任意目录（见 `CLAUDE.md` / dev-agent-architecture）。  
- **Reminder → Plan 迁移**：历史文档中 `DevReminder` 独大的描述已过时；**当前以 Plan 核心域 + `PlanSchedulerService`** 为准（见重构文档声明）。  
- **两个 Planner 名称**：聊天侧 `TaskPlannerService` 与 Dev 侧 `DevTaskPlanner` 职责不同，勿混用。  
- **Dev UI V2 计划**：分 Phase，未验收部分不当作已实现。

## 3. 核心模型 / 状态 / 服务 / 入口

| 类型 | 位置 |
|------|------|
| Workspace | `backend/src/dev-agent/workspace/workspace-manager.service.ts` |
| Dev 编排 | `backend/src/dev-agent/dev-agent.orchestrator.ts`、`dev-runner.service.ts` |
| Dev 薄入口 | `backend/src/dev-agent/dev-agent.service.ts` |
| 执行器路由 | `dev-agent/execution/dev-step-routing.service.ts`、`dev-executor-resolver.ts` |
| Shell / OpenClaw / Claude Code | `backend/src/dev-agent/executors/**` |
| 队列 | `KeyedFifoQueueService`（同会话串行） |
| Plan 调度 | `PlanSchedulerService`、`PlanService`（feature flag 见 `FEATURE_PLAN_SCHEDULER`） |
| 前端 Dev 面板 | `frontend/src/app/dev-agent/**` |

**环境变量**：`DEV_AGENT_ALLOWED_WORKSPACE_ROOTS` 等见 `backend/.env.example` 与 `PROJECT-SUMMARY.md`。

## 4. 主流程

1. **创建任务**：路由到 dev → `DevAgentService` 创建 session/run → 后台队列执行。  
2. **规划 → 执行 → 评估 → 重规划 → 汇报**：`DevAgentOrchestrator` 主导；结果写入 run/transcript。  
3. **Workspace**：每步执行前由 `WorkspaceManager` 解析 cwd；非法路径拒绝。  
4. **计划/提醒**：到期任务由 Plan 调度链路分发（chat/dev/system scope 依设计），不在此 skill 重复全文。  
5. **UI**：V2 目标为三栏（线程 / 时间线 / 详情 + Composer）；Phase 进度以代码与 plan 文档勾稽。

## 5. 关键文档来源

- `docs/plan-task-scheduler-refactor.md`（含「已落地」与历史分析）  
- `docs/dev-agent-ui-v2-implementation-plan.md`  
- `docs/dev-agent-architecture.md`  
- `docs/PROJECT-SUMMARY.md`  
- `CLAUDE.md`（Dev 安全与 feature flag 约定）

## 6. 修改原则

- **不要随意放宽** Shell 白名单/黑名单与高风险语法拦截。  
- 新执行器：`CapabilityRegistry` / `IDevExecutor` / `DevStepRoutingService` 扩展，保持编排分层。  
- 调度变更避免重复触发与漏触发；涉及 flag 时同步 `.env.example`。  
- 前端加字段先对齐后端 DTO 与类型，再改视图。

## 7. 常见坑

- **把 `plan-task-scheduler-refactor.md` 全文当「待改造清单」**：文首已说明 DevReminder → Plan **已迁移**，应区分历史段落与当前实现。  
- **Dev UI plan 的组件名与仓库不完全一致**：以 `frontend/src/app/dev-agent/**` 实际文件为准。  
- **在 Chat 里复用 Dev 队列**：违背边界；应通过路由与适配器分流。  
- **忽略 worktree/shared 差异**：同 repo 多 run 并发风险。  
- **Claude Code / OpenClaw 开关**：受 feature flag 控制，默认行为查 `feature-flags.ts`。
