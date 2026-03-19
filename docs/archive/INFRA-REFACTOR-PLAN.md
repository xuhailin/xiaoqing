# 基础设施重构计划

> 基于 2026-03-12 架构审查报告，按优先级排列。
> 目标：把被锁在 dev-agent 内部的基础设施松绑，为后续 reasoning / proactive 能力铺路。

---

## 总览

| # | 任务 | 严重度 | 状态 |
|---|------|--------|------|
| 1 | DevRun/DevSession status 改为 Prisma enum | M4 | ✅ |
| 2 | drainSessionQueue try-catch 修复 | M3 | ✅ |
| 3 | WorkspaceManager release() 调用 + 重启恢复 | H4/M1 | ✅ |
| 4 | Reminder 松绑 DevSession 强依赖 | H3 | ✅ |
| 5 | Queue 提取为独立基础设施模块 | H1/H2 | ✅ |

---

## 任务详情

### 1. DevRun/DevSession status → Prisma enum ✅

**问题**：status 字段是裸字符串，无编译期校验；DevSession 用 `cancelled`，DevRun 用 `canceled`，拼写不一致。

**改动**：
- `prisma/schema.prisma`：新增 `enum DevSessionStatus` 和 `enum DevRunStatus`，字段类型从 `String` 改为枚举
- 统一拼写为 `cancelled`（英式，与 DevSession 保持一致）
- 迁移：`20260312160000_enum_dev_status`
- 全局替换代码中硬编码的状态字符串为枚举引用
- 涉及文件：`dev-session.repository.ts`、`dev-runner.service.ts`、`dev-agent.orchestrator.ts`、`dev-agent.service.ts`、前端 `dev-agent.component.ts`

---

### 2. drainSessionQueue try-catch 修复 ✅

**问题**：`dev-runner.service.ts` 的 `drainSessionQueue` 外层 try-catch 包裹了整个 while 循环，一个 run 抛异常会导致该 session 整个队列停摆。

**改动**：
- 队列逻辑已提取到 `KeyedFifoQueueService`（Task 5），内部 try-catch 包裹每个 item
- 单个 item 失败不影响后续 item 执行

---

### 3. WorkspaceManager release() + 重启恢复 ✅

**问题**：
- `release()` 已实现但从未被调用 → 内存泄漏 + 磁盘残留 worktree
- 纯内存 `activeWorkspaces` Map，进程重启后丢失

**改动**：
- `dev-runner.service.ts`：session 队列清空后通过 `onKeyDrained` 回调调用 `workspaceManager.release(sessionId)`
- `workspace-manager.service.ts`：实现 `OnModuleDestroy`，销毁时释放所有 active workspace
- 实现 `onModuleInit` 扫描 workspaces 目录，清理孤立 worktree

---

### 4. Reminder 松绑 DevSession ✅

**问题**：DevReminder 表 `sessionId` 为必填，所有提醒必须绑定 DevSession，阻断未来 proactive 能力（如定时问候、周期总结）。

**改动**：
- `prisma/schema.prisma`：`DevReminder.sessionId` 改为 `String?`（可选）
- 新增 `enum ReminderScope { dev, system, chat }`，`DevReminder.scope` 默认 `dev`
- 迁移：`20260312163000_reminder_scope`
- `dev-reminder.service.ts`：
  - `createReminder()` 根据 scope 决定是否需要 session
  - `dispatchSingleReminder()` 根据 scope 分流：dev → 创建 DevRun 入队；system/chat → 仅记录触发
- dev scope 行为完全不变（向后兼容）

---

### 5. Queue 提取为独立模块 ✅

**问题**：per-session 队列、worker drain 逻辑内嵌在 `dev-runner.service.ts`，与 DevRun 业务耦合。

**改动**：
- 新建 `backend/src/infra/queue/` 模块：
  - `keyed-fifo-queue.service.ts`：通用 per-key FIFO 队列，支持 `enqueue(key, itemId, executor, onKeyDrained)`
  - `queue.module.ts`：exports `KeyedFifoQueueService`
  - `index.ts`：barrel export
- `dev-runner.service.ts`：删除内部队列管理（`sessionQueues`、`activeSessionWorkers`、`inFlightRuns`、`drainSessionQueue`），改为注入 `KeyedFifoQueueService`
- `dev-agent.module.ts`：imports `QueueModule`
- ConversationLockService 的 FifoMutex 保持独立（语义不同：互斥锁 vs 任务队列）

---

## 验收标准

- [x] Prisma 迁移可正向执行（2 个迁移已应用）
- [x] 无 TypeScript 编译错误
- [ ] 所有现有测试通过（`npm run test`）
- [ ] 手动冒烟：创建 session → 提交 run → 查看状态流转
