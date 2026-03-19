# Plan / Task / Scheduler 核心域架构改造方案

> 状态：设计阶段，待确认后按 Phase 实施
> 日期：2026-03-19

---

## 1. 当前结构判断

### 1.1 已有能力概览

| 能力 | 所在模块 | 当前职责 |
|------|---------|---------|
| **Reminder 创建** | `action/skills/reminder/reminder-skill.service.ts` | 聊天端用户说"提醒我..."时，解析时间、写入 `DevReminder` 表（scope=chat） |
| **Reminder 生命周期** | `dev-agent/dev-reminder.service.ts` | 统一管理 dev/chat/system 三种 scope 的提醒创建、触发、分发 |
| **Reminder 调度** | `dev-agent/dev-reminder.scheduler.service.ts` | 每 15 秒轮询 `nextRunAt <= now` 的提醒，调用分发 |
| **Reminder 消息推送** | `action/skills/reminder/reminder-message.service.ts` | chat-scope 提醒到期时，用 LLM 生成自然语言消息 + SSE 推送 |
| **Task Planner（聊天）** | `assistant/planning/task-planner.service.ts` | 轻量规则引擎，判断是否需要规划。**实际几乎未被使用** |
| **Dev Task Planner** | `dev-agent/planning/dev-task-planner.ts` | Dev 场景的 LLM 驱动任务规划（生成多步执行计划） |
| **Memory Scheduler** | `assistant/memory/memory-scheduler.service.ts` | 每日定时做记忆衰减/晋升/降级 |
| **Evolution Scheduler** | `assistant/persona/evolution-scheduler.service.ts` | 每日定时做人格进化检查 |

### 1.2 数据模型现状

- **DevReminder**：唯一的持久化模型，同时承载一次性提醒（runAt）和周期性规则（cronExpr）
- **DevRun**：Dev 执行单元，plan 字段以 JSON 存储临时规划结果
- **没有独立的 Plan、Task、Schedule 模型**

### 1.3 最大的边界混乱点

1. **Reminder 承载了过多职责**
   - `DevReminder` 既是"提醒我喝水"这种纯通知，也是"每天 9 点上报工时"这种周期性任务规则
   - 这两者在未来需要完全不同的生命周期管理（skip once、pause、exception 等）
   - 但当前只有一个扁平的 `DevReminder` 模型

2. **核心调度能力被锁在 DevAgent 域内**
   - `DevReminderService` 和 `DevReminderSchedulerService` 都在 `dev-agent/` 下
   - 但它们实际服务 chat/system/dev 三个 scope —— 已经是事实上的系统级能力
   - 命名、分层、模块归属都不对

3. **Plan 概念割裂**
   - `TaskPlannerService`（聊天端）几乎是死代码
   - `DevTaskPlanner`（Dev 端）是 LLM 驱动的执行规划
   - 两者都叫"planner"但做完全不同的事，且都不是"用户的长期计划"这个概念

4. **没有"计划实例"的概念**
   - 用户说"今天不用上报工时"，当前系统只能删除整个 reminder 或无法处理
   - 缺少 occurrence（计划实例）和 exception（例外）的建模

---

## 2. 候选方案对比

### 方案 A：以 Plan 为核心，Task/Reminder 作为派生

**核心思想**：Plan 是一等公民（长期规则），每次触发产生 Task（实例），Reminder 只是 Task 的通知策略。

```
Plan（规则定义）
  ├── recurrence（重复规则）
  ├── Task occurrence（每次触发的实例）
  │     ├── status: pending / done / skipped
  │     └── Reminder（通知策略，可选）
  └── exceptions（skip / reschedule）
```

- **优点**：概念层次清晰，天然支持 skip once / pause / exception；Plan 作为稳定的规则层，Task 作为可变的实例层
- **风险**：改动量较大，需要新建 Plan + TaskOccurrence 模型
- **适合度**：最贴合未来复杂场景（重复计划 + 例外处理 + 多 agent 共用）

### 方案 B：以 Reminder 为核心，扩展 Plan 语义

**核心思想**：在现有 DevReminder 基础上扩展，加入 plan 字段、occurrence 追踪、exception 列表。

```
DevReminder（扩展为 Plan + Reminder 混合体）
  ├── cronExpr / runAt（调度规则）
  ├── occurrences[]（实例记录）
  └── exceptions[]（例外规则）
```

- **优点**：改动最小，复用现有模型和代码
- **风险**：概念不清晰，Reminder 越来越像 Plan 但名字还叫 Reminder；长期会变成 God Model
- **适合度**：短期可行，长期不可持续

### 方案 C：Plan / Scheduler 双核心，Task 和 Reminder 作为派生

**核心思想**：Plan 管理规则与生命周期，Scheduler 管理时间触发。Task 是 Plan 的执行实例，Reminder 是 Scheduler 的通知策略。

```
Plan（规则 + 生命周期）          Scheduler（时间引擎）
  ├── recurrence                   ├── cron / one-shot
  ├── pause / resume               ├── nextRunAt 计算
  └── exceptions                   └── 轮询 + 分发

Plan 触发 → Scheduler 调度 → 产生 Task → 可选附加 Reminder 通知
```

- **优点**：Plan 和 Scheduler 职责分离，Scheduler 可被记忆衰减、人格进化等其他场景复用
- **风险**：两个核心之间的协作协议需要仔细设计；Scheduler 抽象可能过早
- **适合度**：架构优雅但当前阶段 Scheduler 的复用场景还不多（Memory/Evolution 的定时任务用 @Cron 就够了）

---

## 3. 推荐方案

**推荐方案 A：以 Plan 为核心，Task/Reminder 作为派生。**

### 3.1 为什么选 A

- **概念最清晰**：Plan（规则）→ Task（实例）→ Reminder（通知）三层各有明确职责
- **天然支持未来场景**：
  - "今天不用上报" = 对今天的 TaskOccurrence 标记 skip
  - "暂停这个计划" = Plan.status = paused
  - "这周改到周四" = 对本周 occurrence 做 reschedule exception
  - "只提醒不执行" = Plan 产生的 Task 只挂 Reminder，不挂 action
- **多 agent 可共用**：Plan/Task 是公共核心域，任何 agent 都可以创建 Plan、查询 Task、消费 occurrence

### 3.2 为什么不应该把 Plan/Task/Scheduler 做成 Agent

Agent 的职责是：**理解用户意图、选择命令、组织交互**。

Plan/Task/Scheduler 的职责是：**维护状态真相、执行规则、时间触发**。

如果做成 Agent：
- Agent 内部会同时持有"理解意图"和"管理状态"两套逻辑，职责膨胀
- 其他 Agent 想用 Plan/Task 能力时，变成 Agent-to-Agent 调用，复杂且脆弱
- 状态查询（"我有哪些计划"）不应该经过 LLM 推理，应该是直接的 service 调用

正确关系：
```
Agent 层（意图理解 + 命令路由）
  ↓ 调用
核心域（Plan / Task / Scheduler service）
  ↓ 持久化
数据层（Prisma models）
```

### 3.3 核心模块收敛目标

| 目标模块 | 位置 | 职责 |
|---------|------|------|
| **PlanService** | `backend/src/plan/plan.service.ts`（新建公共模块） | Plan CRUD、生命周期（active/paused/archived）、recurrence 规则管理 |
| **TaskOccurrenceService** | `backend/src/plan/task-occurrence.service.ts` | 根据 Plan 生成/查询 occurrence、标记 done/skip/reschedule |
| **PlanSchedulerService** | `backend/src/plan/plan-scheduler.service.ts` | 统一的时间轮询引擎，替代当前 DevReminderSchedulerService |
| **PlanDispatcher** | `backend/src/plan/plan-dispatcher.service.ts` | occurrence 到期后的分发逻辑（通知 / 创建 DevRun / 触发 action） |

### 3.4 现有模块的处置

| 现有模块 | 处置 |
|---------|------|
| `DevReminderService` | **拆分 + 迁移**：核心调度逻辑迁入 PlanService/PlanSchedulerService，dev-scope 的 run 创建逻辑保留在 DevAgent 侧作为 dispatcher 策略 |
| `DevReminderSchedulerService` | **替换**：由 PlanSchedulerService 统一承担 |
| `ReminderSkillService` | **保留但瘦身**：仍作为聊天端的 capability，但内部改为调用 PlanService.createPlan() |
| `ReminderMessageService` | **保留**：作为 chat-scope 的通知策略实现 |
| `TaskPlannerService`（聊天端） | **移除或重定义**：当前是死代码，要么删除，要么在新架构中重新定义为"复杂任务的步骤分解" |
| `DevTaskPlanner` | **保留不动**：这是 Dev 执行规划，和"用户计划"是不同概念，不需要合并 |
| `DevReminder`（Prisma model） | **渐进迁移**：新建 Plan + TaskOccurrence 模型后，数据迁移，最终废弃 |

### 3.5 需要引入的关键概念

#### Occurrence（计划实例）

每个 Plan 按 recurrence 规则产生的"这一次"。例如"每天 9 点上报工时"，3月19日的那一次就是一个 occurrence。

**为什么需要它**：没有 occurrence，就无法对"某一次"做 skip / reschedule / 标记完成，只能操作整个 Plan。

#### Exception（例外规则）

对特定 occurrence 的覆盖。例如"今天不用上报" = 对今天的 occurrence 添加 skip exception。

**为什么需要它**：用户的自然语言表达经常是对"某一次"的操作，而不是对"整个规则"的操作。没有 exception 机制，系统无法区分这两者。

---

## 4. 目标架构

### 4.1 模块分层

```
┌─────────────────────────────────────────────────────────┐
│                    Agent 层 / 意图层                      │
│                                                          │
│  ReminderSkillService    ActionReasonerService           │
│  (聊天端 capability)      (决策：suggest_reminder 等)      │
│         │                        │                       │
│         └──── 调用 ──────────────┘                       │
│                    │                                     │
├────────────────────┼─────────────────────────────────────┤
│                    ▼                                     │
│              公共核心域 (backend/src/plan/)                │
│                                                          │
│  ┌──────────────┐  ┌─────────────────────┐              │
│  │ PlanService  │  │ TaskOccurrenceService│              │
│  │              │  │                     │              │
│  │ - CRUD       │  │ - 生成 occurrence   │              │
│  │ - 生命周期    │  │ - skip / done      │              │
│  │ - pause      │  │ - reschedule       │              │
│  │ - exception  │  │ - 查询             │              │
│  └──────┬───────┘  └─────────┬───────────┘              │
│         │                    │                           │
│  ┌──────▼────────────────────▼───────────┐              │
│  │         PlanSchedulerService          │              │
│  │                                       │              │
│  │  - 统一轮询 nextRunAt <= now          │              │
│  │  - 检查 exception（skip?）            │              │
│  │  - 生成 occurrence                    │              │
│  │  - 调用 dispatcher                   │              │
│  └──────────────────┬────────────────────┘              │
│                     │                                    │
│  ┌──────────────────▼────────────────────┐              │
│  │         PlanDispatcher                │              │
│  │                                       │              │
│  │  策略分发（按 plan 类型 / scope）：      │              │
│  │  - notify  → ReminderMessageService   │              │
│  │  - dev_run → DevRunRunnerService      │              │
│  │  - action  → CapabilityRegistry       │              │
│  │  - noop    → 仅标记完成               │              │
│  └───────────────────────────────────────┘              │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                    数据层                                 │
│                                                          │
│  Plan (model)                                            │
│  ├── id, title, description                              │
│  ├── recurrence: once | daily | weekly | weekday | cron  │
│  ├── cronExpr?, runAt?, timezone                         │
│  ├── status: active | paused | archived                  │
│  ├── dispatchType: notify | dev_run | action | noop      │
│  ├── scope: chat | dev | system                          │
│  └── nextRunAt                                           │
│                                                          │
│  TaskOccurrence (model)                                  │
│  ├── id, planId                                          │
│  ├── scheduledAt (原定时间)                               │
│  ├── status: pending | done | skipped | rescheduled      │
│  ├── exceptionType?: skip | reschedule                   │
│  ├── rescheduledTo?: DateTime                            │
│  └── completedAt                                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 4.2 典型场景走查

**场景 1：用户说"每天提醒我 9 点上报工时"**
1. IntentService 识别 → taskIntent = `set_reminder`
2. ActionReasoner → `run_capability(reminder)`
3. ReminderSkillService → 调用 `PlanService.createPlan({ recurrence: 'daily', cronExpr: '0 9 * * *', dispatchType: 'notify', scope: 'chat' })`
4. PlanSchedulerService 轮询 → 每天 9 点生成 occurrence → PlanDispatcher → ReminderMessageService 推送消息

**场景 2：用户说"今天不用上报了"**
1. IntentService 识别 → taskIntent = `modify_plan`（新增意图）
2. ActionReasoner → `run_capability(plan_manager)`
3. PlanManagerSkill → 调用 `TaskOccurrenceService.skipOccurrence(planId, today)`
4. 今天的 occurrence 标记为 skipped，明天正常触发

**场景 3：用户说"暂停这个计划"**
1. 识别 → `modify_plan`
2. PlanManagerSkill → `PlanService.pausePlan(planId)`
3. Plan.status = paused，PlanSchedulerService 不再为其生成 occurrence

**场景 4：Dev Reminder 触发 DevRun**
1. PlanSchedulerService 轮询 → 发现 Plan(scope=dev, dispatchType=dev_run) 到期
2. 生成 occurrence → PlanDispatcher → 走 dev_run 策略
3. 创建 DevRun → DevRunRunnerService.startRun()

---

## 5. Phase 改造计划

### Phase 1：建立公共核心模型与边界

**目标**：新建 `backend/src/plan/` 公共模块，定义 Plan 和 TaskOccurrence 模型，建立核心 service 骨架。

**要做的事**：
- 新建 Prisma 模型：`Plan`、`TaskOccurrence`
- 新建 `PlanModule`，包含 `PlanService`（CRUD + 生命周期）和 `TaskOccurrenceService`（occurrence 管理）
- Plan 模型覆盖当前 DevReminder 的所有字段 + 新增 status / dispatchType / exception 能力
- **不动现有代码**，新旧并存

**产出**：一个可以独立创建 Plan、查询 occurrence 的公共模块，但还没有调度和分发。

### Phase 2：迁移调度引擎

**目标**：用 `PlanSchedulerService` + `PlanDispatcher` 替代 `DevReminderSchedulerService` + `DevReminderService` 的调度/分发逻辑。

**要做的事**：
- 新建 `PlanSchedulerService`（统一轮询，查 Plan.nextRunAt）
- 新建 `PlanDispatcher`（按 dispatchType 分发到不同策略）
- 分发策略复用现有实现：
  - notify → `ReminderMessageService`（保留不动）
  - dev_run → `DevRunRunnerService`（保留不动）
- `DevReminderSchedulerService` 标记为 deprecated，但暂不删除
- 通过 feature flag 控制新旧调度器切换

**产出**：新的调度引擎可以独立运行，与旧系统并行。

### Phase 3：迁移入口层 + 数据迁移

**目标**：让 `ReminderSkillService` 和 API 端点改为调用新的 PlanService，完成数据迁移。

**要做的事**：
- `ReminderSkillService` 内部改为调用 `PlanService.createPlan()`
- DevAgent Controller 的 reminder API 迁移到 Plan API（`/plans`, `/plans/:id/occurrences`）
- 编写 DevReminder → Plan 的数据迁移脚本
- 新增 `modify_plan` 意图 + `PlanManagerSkill`（处理 skip / pause / resume）
- 删除 `DevReminderService`、`DevReminderSchedulerService`
- 删除或归档 `TaskPlannerService`（聊天端死代码）

**产出**：完全切换到新架构，旧模块清理完毕。

### Phase 4：扩展与打磨

**目标**：补全高级能力，适配多 agent 场景。

**要做的事**：
- 支持 weekday / 自定义重复规则
- 支持 reschedule once（"这次改到下午 3 点"）
- Plan 的 agent-bus 集成（跨 agent 创建和查询 Plan）
- occurrence 的批量查询 API（"这周我有哪些任务"）
- 可选：Plan 与 Memory 联动（长期计划自动沉淀为记忆）

**产出**：完整的 Plan/Task/Scheduler 核心域，可被任意 agent 复用。

---

## 附录：关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| Plan 作为核心而非 Reminder | Plan | Reminder 只是通知策略，不应承载规则和生命周期 |
| 公共模块而非 Agent | 公共模块 | 状态真相和规则执行不应经过 LLM 推理 |
| 独立 occurrence 模型 | 是 | 没有 occurrence 就无法 skip / reschedule 单次 |
| 保留 ReminderMessageService | 是 | 它只做通知推送，职责清晰，作为 dispatcher 策略复用 |
| 保留 DevTaskPlanner | 是 | Dev 执行规划与"用户计划"是不同概念，不需要合并 |
| 渐进迁移而非一次推翻 | 是 | 新旧并存 + feature flag 切换，降低风险 |
