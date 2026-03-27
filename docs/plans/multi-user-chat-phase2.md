# Chat 多用户 Phase 2 完整方案

> 状态：待执行
> 日期：2026-03-27
> 前置：Phase 1 完成（chat 读路径隔离 + Execution Domain 收口）
> 目标：写路径全面 user-aware + 所有用户域补 userId + 后台任务多用户化 + 前端 auth

---

## 设计原则（正确方向）

Phase 1 做的是「读路径最小隔离」：chat turn 组装时只读自己的数据。
Phase 2 要做到「全域正确」：

1. **写路径同样隔离** — 所有写入（总结、成长记录、社交图谱、情绪快照等）必须绑定 userId
2. **后台任务多用户化** — 所有 cron/scheduler 不再跑全局数据，按 userId 分批处理
3. **数据域边界明确** — 明确区分哪些表属于「用户私有」，哪些属于「AI 系统级」
4. **前端有真实 auth 层** — 不再依赖前端 hardcode header，有登录状态管理
5. **管理 API 按用户隔离** — Memory/Profile/Growth 等管理界面只看自己的数据

---

## 领域边界分类（Phase 2 基准）

### 用户私有（必须加 userId / 按用户隔离）

| 表 | 现状 | Phase 2 处理 |
|---|---|---|
| `Conversation` | ✅ Phase 1 已加 userId | 已完成 |
| `Memory` | ✅ Phase 1 已加 userId | 已完成 |
| `UserClaim` / `ClaimEvidence` | ✅ 已有 userKey，Phase 1 已接入 | 已完成 |
| `UserProfile` | ✅ 已有 userKey，Phase 1 已接入 | 已完成 |
| `IdentityAnchor` | ✅ 已有 userKey，Phase 1 已接入 | 已完成 |
| `SessionState` | ✅ 已有 userKey，Phase 1 已接入 | 已完成 |
| `CognitiveProfile` | ❌ 无 userId，全局共享 | **本阶段加 userId** |
| `RelationshipState` | ❌ 无 userId，全局共享 | **本阶段加 userId** |
| `BoundaryEvent` | ❌ 无 userId | **本阶段加 userId** |
| `SharedExperience` | ❌ 无 userId | **本阶段加 userId** |
| `SocialEntity` | ❌ 无 userId | **本阶段加 userId** |
| `SocialRelationEdge` | ❌ 无 userId（fromEntityId 也需按用户隔离） | **本阶段加 userId** |
| `SocialInsight` | ❌ 无 userId | **本阶段加 userId** |
| `DailySummary` | ❌ 无 userId | **本阶段加 userId** |
| `Plan` | ❌ 无 userId，调度器无法区分用户 | **本阶段加 userId** |
| `CognitiveObservation` | ❌ 无 userId（有 conversationId，可间接关联） | **本阶段加 userId**（直接字段更高效） |
| `CognitiveInsight` | ❌ 无 userId | **本阶段加 userId** |
| `TracePoint` | ⚠️ 有 conversationId，可间接关联 | 通过 Conversation.userId 查询（不加直接字段） |

### AI 系统级（非用户私有，多用户共享）

| 表 | 说明 |
|---|---|
| `Persona` / `PersonaRule` | 小晴的人格定义，系统级 |
| `PersonaEvolutionLog` | 人格版本历史，系统级 |
| `CognitiveEvolution` | 进化记录，系统级 |
| `TimesheetRecord` | 单用户工具，无需多用户化 |
| `DevSession` / `DevRun` | multi 模式已关闭，不处理 |
| `DesignConversation` | multi 模式已关闭，不处理 |

---

## 执行步骤

### Step 1：Schema Migration — 批量加 userId

**文件：`backend/prisma/schema.prisma`**

以下 9 张表全部加 `userId String @default("default-user")` 字段并补 index：

```prisma
// CognitiveProfile：在 isActive 字段之前加
userId   String  @default("default-user")
// 在已有 @@index([kind, isActive]) 之后加
@@index([userId, kind, isActive])

// RelationshipState：在 isActive 字段之前加
userId   String  @default("default-user")
// 在 @@index([isActive, updatedAt]) 之后加
@@index([userId, isActive, updatedAt])

// BoundaryEvent：在 severity 字段之前加
userId   String  @default("default-user")
@@index([userId, createdAt])

// SharedExperience：在 happenedAt 字段之前加
userId   String  @default("default-user")
@@index([userId, category])
@@index([userId, happenedAt])

// SocialEntity：在 firstSeenAt 字段之前加
userId   String  @default("default-user")
// 原有 @@unique([name]) 改为 @@unique([userId, name])
@@index([userId, relation])
@@index([userId, lastSeenAt])

// SocialRelationEdge：在 fromEntityId 字段之前加
userId   String  @default("default-user")
// 原有 @@unique([fromEntityId, toEntityId]) 改为 @@unique([userId, fromEntityId, toEntityId])
@@index([userId, trend, updatedAt])

// SocialInsight：在 scope 字段之前加
userId   String  @default("default-user")
// 原有 @@unique([scope, periodKey]) 改为 @@unique([userId, scope, periodKey])
@@index([userId, scope, createdAt])

// DailySummary：在 dayKey 字段之前加
userId   String  @default("default-user")
// 原有 @@unique([dayKey]) 改为 @@unique([userId, dayKey])
@@index([userId, dayKey])

// Plan：在 title 字段之前加
userId   String  @default("default-user")
@@index([userId, status, nextRunAt])

// CognitiveObservation：在 dimension 字段之前加
userId   String  @default("default-user")
@@index([userId, dimension, happenedAt])

// CognitiveInsight：在 scope 字段之前加
userId   String  @default("default-user")
// 原有 @@unique([scope, periodKey, dimension]) 改为 @@unique([userId, scope, periodKey, dimension])
@@index([userId, scope, periodKey])
```

**执行 Migration：**

```bash
cd backend
npx prisma migrate dev --name add-userId-to-all-user-domains
```

> ⚠️ `SocialEntity.@@unique([name])` → `@@unique([userId, name])` 是破坏性变更。
> 若生产已有数据，需先检查是否存在同名但不同用户的情况（目前全是 default-user，安全）。

---

### Step 2：PostTurnPlan 加 userId + 全链路穿透

**PostTurnPlan 是所有写路径的核心载体**，必须首先携带 userId。

**文件：`backend/src/assistant/post-turn/post-turn.types.ts`**

在 `PostTurnPlan` interface 中加：

```typescript
/** 当前回合所属用户。由 AssistantOrchestrator 从 ProcessTurnInput.userId 注入。 */
userId: string;
```

**文件：`backend/src/assistant/conversation/assistant-orchestrator.service.ts`**

在构建 `PostTurnPlan` 的地方传入 `userId`（来自 `ProcessTurnInput.userId`，Phase 1 已加入）：

```typescript
const postTurnPlan: PostTurnPlan = {
  conversationId: input.conversationId,
  userId: input.userId,  // 新增
  turn: { ... },
  // ...
};
```

从此刻起，所有 post-turn 任务（summarize_trigger, record_growth, life_record_sync 等）都可以通过 `plan.userId` 拿到当前用户。

---

### Step 3：SummarizerService 全面 userId 化

**当前问题**：`SummarizerService.summarize(conversationId)` 内部所有写操作（memory, anchor, profile, claim, sessionState）全部使用 `DEFAULT_USER_KEY` 或依赖调用时不传 userKey。

**文件：`backend/src/assistant/summarizer/summarizer.service.ts`**

#### 3a. 方法签名加 userId

```typescript
async summarize(
  conversationId: string,
  userId: string,          // 新增
  messageIds?: string[],
): Promise<SummarizerResult>
```

#### 3b. Memory 写入时传 userId

找到所有 `this.memory.create(...)` 调用，加 `userId`：

```typescript
await this.memory.create({
  type: ...,
  content: ...,
  sourceMessageIds: ...,
  userId,  // 新增
});
```

同理 `this.memory.mergeInto(...)` — 目前该方法不需要 userId（只更新内容），不变。

#### 3c. IdentityAnchor 写入时传 userId

找到所有 `this.anchor.create(...)` / `this.anchor.update(...)` 调用，加 `userKey: userId`。

同时读取 `this.anchor.getActiveAnchors(userId)` 时也传入 userId（Phase 1 已在 assemble 中做，此处是 summarizer 独立调用的路径）。

#### 3d. UserProfile 更新时传 userId

找到 `this.userProfile.updateImpression(...)` / `this.userProfile.setPendingImpression(...)` 等调用，加 `userKey: userId`。

#### 3e. Claim 写入时传 userId

`ClaimUpdateService.upsertWithEvidence(draft)` 已经通过 `draft.userKey` 传 userId，但当前 summarizer 里构建 draft 时使用的是 `claimConfig.defaultUserKey`（实际是 'default-user'）。

找到构建 `ClaimDraft` 的代码（通常在 `parseAndWriteClaims` 类似方法中），改为 `userKey: userId`。

#### 3f. SessionState 写入时传 userId

找到 `this.sessionState.upsertState(draft)` 调用，`draft.userKey` 改为 `userId`。

#### 3g. SummarizeTriggerService 调用点更新

**文件：`backend/src/assistant/conversation/summarize-trigger.service.ts`**

`triggerSummarize(conversationId)` → 需要获取 userId。

方案：注入 PrismaService，在触发时查 `conversation.userId`：

```typescript
async triggerSummarize(conversationId: string): Promise<void> {
  const conv = await this.prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  const userId = conv?.userId ?? 'default-user';
  await this.summarizer.summarize(conversationId, userId);
}
```

---

### Step 4：CognitiveGrowthService 全面 userId 化

**当前问题**：`recordTurnGrowth`、`getGrowthContext`、`getPending`、`confirm`、`reject` 全部无 userId 边界。

**文件：`backend/src/assistant/cognitive-pipeline/cognitive-growth.service.ts`**

#### 4a. `getGrowthContext(userId: string)` 加过滤

在所有 `$queryRaw` 和 `prisma.memory.findMany` 中加 `userId` 条件：

```typescript
async getGrowthContext(userId: string): Promise<PersistedGrowthContext> {
  const [profiles, judgmentPatterns, ...relationships, boundaries] = await Promise.all([
    this.prisma.$queryRaw`
      SELECT "content" FROM "CognitiveProfile"
      WHERE "userId" = ${userId} AND "isActive" = true AND "status" = 'confirmed'
      ORDER BY "updatedAt" DESC LIMIT 6
    `,
    this.prisma.memory.findMany({
      where: { userId, type: 'long', category: MemoryCategory.JUDGMENT_PATTERN, decayScore: { gt: 0 } },
      ...
    }),
    // 其他查询同理加 userId 条件
    this.prisma.$queryRaw`
      SELECT "summary" FROM "RelationshipState"
      WHERE "userId" = ${userId} AND "isActive" = true AND "status" IN ('confirmed', 'pending')
      ORDER BY CASE "status" WHEN 'confirmed' THEN 0 ELSE 1 END, "updatedAt" DESC LIMIT 2
    `,
    this.prisma.$queryRaw`
      SELECT "note" FROM "BoundaryEvent"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC LIMIT 5
    `,
  ]);
  // ...
}
```

#### 4b. `recordTurnGrowth(turnState, sourceMessageIds, userId)` 加 userId

写入 `CognitiveProfile` 和 `RelationshipState` 时带入 userId：

```typescript
async recordTurnGrowth(
  turnState: CognitiveTurnState,
  sourceMessageIds: string[],
  userId: string,  // 新增
): Promise<void> {
  if (turnState.userModelDelta.shouldWriteCognitive) {
    await this.writeOrBumpProfile(kind, content, sourceMessageIds, 0.72, userId);
  }
  if (turnState.userModelDelta.shouldWriteRelationship) {
    await this.writeRelationshipState(turnState, sourceMessageIds, userId);
  }
  if (turnState.safety.notes.length > 0) {
    await this.writeBoundaryEvent(content, sourceMessageIds, severity, userId);
  }
}
```

内部写入方法 `writeOrBumpProfile`、`writeRelationshipState`、`writeBoundaryEvent` 同步加 `userId` 参数，在 `prisma.create` 中写入。

#### 4c. `getPending(userId)` / `confirm(id, userId)` / `reject(id, userId)` 加边界

`getPending()` 的 `$queryRaw` 中加 `AND "userId" = ${userId}`。

`confirm(id)` / `reject(id)` 在 update 前先 `findUnique` 确认归属，防止越权操作。

#### 4d. TurnContextAssembler 调用点更新

```typescript
// 当前（Phase 1 已改）：
this.cognitiveGrowth.getGrowthContext()
// 改为：
this.cognitiveGrowth.getGrowthContext(input.userId)
```

Post-turn 中调用 `recordTurnGrowth` 的地方加 `plan.userId`：

```typescript
await this.cognitiveGrowth.recordTurnGrowth(turnState, sourceMessageIds, plan.userId);
```

---

### Step 5：SocialEntity / SocialRelationEdge / SocialInsight 全面 userId 化

**文件：`backend/src/assistant/life-record/social-entity/social-entity.service.ts`**

#### 5a. 所有读取方法加 userId 过滤

```typescript
async list(userId: string, query?: SocialEntityQuery): Promise<SocialEntityRecord[]> {
  const where: Record<string, unknown> = { userId };
  // ...
}

async findRelevant(userId: string, context: string, limit = 3): Promise<SocialEntityRecord[]> {
  // where 加 userId
}
```

#### 5b. 写入方法加 userId

`syncFromTracePointIds(tracePointIds, userId)` — TracePoint 有 conversationId，但我们需要通过 userId 写入 SocialEntity：

```typescript
async syncFromTracePointIds(tracePointIds: string[], userId: string): Promise<SyncResult> {
  // upsertEntities 时传 userId
}
```

`upsertEntities(peopleMap, userId)` 中所有 `prisma.socialEntity.upsert` 都带 `userId`：
- `where: { userId_name: { userId, name } }`（需要对应 schema 的 @@unique 改为 [userId, name]）

#### 5c. SocialRelationEdgeService 同理加 userId

读取和写入都加 `userId` 参数。

#### 5d. SocialInsightService 同理加 userId

`generateInsight(userId, scope, periodKey)` 时 `periodKey` 的 unique 约束已改为 `[userId, scope, periodKey]`。

#### 5e. TurnContextAssembler 的 buildSocialContext 更新

Phase 1 中 multi 模式停止了 SocialEntity 注入。Phase 2 后，single 模式下可以恢复并按 userId 过滤：

```typescript
socialCtx = await this.buildSocialContext({
  userInput: input.userInput,
  recentMessages,
  userId: input.userId,  // 新增
});
```

`buildSocialContext` 内部调用 `this.socialEntity.findRelevant(input.userId, ...)` 等。

---

### Step 6：SharedExperience / SessionReflection / DailySummary userId 化

#### SharedExperienceService

**文件：`backend/src/assistant/shared-experience/shared-experience.service.ts`**

所有读写方法加 `userId` 参数，查询时带 `where: { userId }`。

Post-turn 中写入 SharedExperience 时从 `plan.userId` 取值。

TurnContextAssembler 中读取 SharedExperience 改为按 userId 过滤。

#### SessionReflectionService

SessionReflection 有 conversationId，Conversation 已有 userId（Phase 1），查询时通过 join 或子查询间接隔离，不需要单独加字段。

但写入时若直接调用 service，仍需确认 conversationId 归属于当前 userId（Phase 1 的 `assertConversationOwner` 已保证）。

#### DailySummaryService

**文件：`backend/src/assistant/life-record/daily-summary/daily-summary.service.ts`**

所有方法加 `userId` 参数，`@@unique([userId, dayKey])` 已在 Schema Step 1 中改好。

```typescript
async generate(userId: string, dayKey: string): Promise<DailySummaryRecord> {
  // 仅查 userId 的 TracePoints
}
```

---

### Step 7：Plan 域全面 userId 化

**Plan 域问题**：`Plan` 表无 userId，`PlanSchedulerService` 触发后通过 `conversationId` 推送消息，但无法区分是哪个用户的 Plan。

#### 7a. PlanService 所有方法加 userId

**文件：`backend/src/plan/plan.service.ts`**

```typescript
async create(data: CreatePlanDto, userId: string): Promise<Plan>
async list(userId: string, scope?: ReminderScope): Promise<Plan[]>
async findDuePlans(now: Date, limit: number): Promise<Plan[]>  // 调度器用，仍全量
```

`create` 时 `data.userId = userId`。
`list` 时 `where: { userId, ... }`。

#### 7b. PlanController 加 userId 提取

**文件：`backend/src/plan/plan.controller.ts`**

所有端点提取 `X-User-Id` 并传给 service（与 ConversationController 相同模式）。

#### 7c. TaskExecutor 写 TaskOccurrence 时记录 userId

**文件：`backend/src/plan/task-executor.service.ts`**

Plan 已有 userId，TaskOccurrence 是 Plan 的子记录，通过 Plan 关系可以间接获取 userId，暂不需要在 TaskOccurrence 单独加字段。

#### 7d. notify-dispatch.strategy — 推送给正确用户

**文件：`backend/src/plan/strategies/notify-dispatch.strategy.ts`**

当前 notify 策略通过 `plan.conversationId` 向对话推消息。

Phase 2 要确保：若 `plan.conversationId` 为空但 `plan.userId` 非空，可以找到该用户最新的 active conversation 再推送：

```typescript
const targetConversationId = plan.conversationId
  ?? await this.findLatestConversationForUser(plan.userId);
```

新增 `findLatestConversationForUser(userId)` 查询最近一条 `isInternal=false, userId=userId` 的 conversation。

---

### Step 8：后台任务（Scheduler）多用户化

所有 cron 任务目前处理全局数据，Phase 2 改为「按 userId 分批处理」。

#### 8a. MemorySchedulerService — 按 userId 批量处理

**文件：`backend/src/assistant/memory/memory-scheduler.service.ts`**

当前逻辑：全表扫描所有记忆做衰减/晋升。

改为：
1. 先 `SELECT DISTINCT "userId" FROM "Memory"` 获取所有用户
2. 每次 cron 轮次处理一部分用户（可加 cursor 分页）
3. 每个 userId 的记忆独立做衰减/晋升计算

```typescript
async processDecay(): Promise<void> {
  const users = await this.prisma.memory.groupBy({ by: ['userId'] });
  for (const { userId } of users) {
    await this.processUserMemories(userId);
  }
}
```

#### 8b. SocialEntityClassifierScheduler — 按用户处理

**文件：`backend/src/assistant/life-record/social-entity/social-entity-classifier-scheduler.service.ts`**

`classifier.classifyPending({ limit: 8 })` 目前全局取。

改为：取各 userId 的 pending entities，按用户逐一分类：

```typescript
// SocialEntityClassifierService.classifyPending 加 userId 参数
async classifyPending(userId: string, opts): Promise<ClassifyResult>
// Scheduler 中：
const users = await this.prisma.socialEntity.groupBy({ by: ['userId'] });
for (const { userId } of users) {
  await this.classifier.classifyPending(userId, { limit: 8 });
}
```

#### 8c. SocialInsightScheduler — 按用户生成洞察

**文件：`backend/src/assistant/life-record/social-insight/social-insight-scheduler.service.ts`**

同上，取所有有 SocialEntity 的 userId，逐个生成 SocialInsight。

#### 8d. EvolutionScheduler — 按用户检测进化条件

**文件：** 找到 `evolution-scheduler.service.ts` 或相关文件。

进化密度检查按 userId 分组：只有当某用户达到 `EVOLUTION_DENSITY_THRESHOLD` 时才为该用户生成进化建议，不再全局混算。

#### 8e. SharedExperienceFollowupScheduler — 按用户处理

同样改为按 userId 分组处理。

---

### Step 9：Management API 全面 userId 隔离

以下 controller 目前返回全局数据，Phase 2 全部改为按 userId 过滤。

#### MemoryController

**文件：`backend/src/assistant/memory/memory.controller.ts`**

- `GET /memory` → `list(userId)` — `where: { userId }`
- `GET /memory/:id` → 校验 `memory.userId === userId`
- `PATCH /memory/:id` → 校验归属后更新
- `DELETE /memory/:id` → 校验归属后删除
- `POST /memory/summarize` → 传 userId 给 summarizer

从请求头提取 userId（与 ConversationController 相同模式，封装成公共 `UserIdExtractor` guard 或 decorator）。

#### IdentityAnchorController

**文件：`backend/src/assistant/identity-anchor/identity-anchor.controller.ts`**

所有 CRUD 操作加 userId（Phase 1 已让 service 接受参数，此处只需补 controller 层提取）。

#### Growth 管理 Controller

**文件：`backend/src/assistant/cognitive-pipeline/growth.controller.ts`**

- `GET /growth/pending` → 加 userId
- `POST /growth/confirm/:id` → 校验归属
- `POST /growth/reject/:id` → 校验归属

#### Social 相关 Controller

`SocialEntityController`、`SocialRelationEdgeController`、`SocialInsightController` 同理。

#### Plan 相关 Controller

`PlanController` 同理（Step 7 已覆盖）。

---

### Step 10：引入公共 UserIdExtractor

当前每个 controller 都要重复「提取 X-User-Id header + APP_USER_MODE 判断」的逻辑，Phase 2 抽成公共工具。

**新增文件：`backend/src/infra/user-id.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppUserMode, getDefaultUserKey } from './user-mode.config';

/**
 * 从请求头 X-User-Id 中提取 userId。
 * - single 模式：缺少 header 时 fallback 到 DEFAULT_USER_KEY
 * - multi 模式：header 必须存在，否则抛 401
 */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // 从 request.userIdResolved（由 UserIdMiddleware 注入）获取
    if (request.resolvedUserId) return request.resolvedUserId;
    throw new UnauthorizedException('User context not resolved');
  },
);
```

**新增文件：`backend/src/infra/user-id.middleware.ts`**

```typescript
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppUserMode, getDefaultUserKey } from './user-mode.config';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class UserIdMiddleware implements NestMiddleware {
  private readonly appUserMode: string;
  private readonly defaultUserKey: string;

  constructor(config: ConfigService) {
    this.appUserMode = getAppUserMode(config);
    this.defaultUserKey = getDefaultUserKey(config);
  }

  use(req: Request & { resolvedUserId?: string }, res: Response, next: NextFunction) {
    const xUserId = req.headers['x-user-id'] as string | undefined;
    if (this.appUserMode === 'multi') {
      if (!xUserId?.trim()) {
        throw new UnauthorizedException('X-User-Id header is required in multi-user mode');
      }
      req.resolvedUserId = xUserId.trim();
    } else {
      req.resolvedUserId = xUserId?.trim() || this.defaultUserKey;
    }
    next();
  }
}
```

**在 `AppModule` 中注册为全局 middleware：**

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(UserIdMiddleware)
      .forRoutes('*');  // 应用到所有路由
  }
}
```

所有 controller 不再需要手动提取 header，直接用 `@UserId() userId: string` decorator 获取。

**同步更新 Phase 1 中手动提取 userId 的 controller：**
- `GatewayController`
- `ConversationController`

去掉手动 header 提取逻辑，改为注入 middleware 设置的 `request.resolvedUserId`。

---

### Step 11：前端 Auth 层

Phase 1 方案中前端需要 hardcode `X-User-Id` 或手动传，Phase 2 实现真正的用户管理。

#### 11a. AuthService

**新增文件：`frontend/src/app/core/services/auth.service.ts`**

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly USER_STORAGE_KEY = 'xiaoqing_user_id';
  private _userId$ = new BehaviorSubject<string | null>(
    localStorage.getItem(this.USER_STORAGE_KEY)
  );
  readonly userId$ = this._userId$.asObservable();

  get currentUserId(): string | null {
    return this._userId$.value;
  }

  login(userId: string): void {
    localStorage.setItem(this.USER_STORAGE_KEY, userId);
    this._userId$.next(userId);
  }

  logout(): void {
    localStorage.removeItem(this.USER_STORAGE_KEY);
    this._userId$.next(null);
  }

  isLoggedIn(): boolean {
    return !!this._userId$.value;
  }
}
```

#### 11b. HTTP Interceptor — 统一注入 X-User-Id

**新增文件：`frontend/src/app/core/interceptors/user-id.interceptor.ts`**

```typescript
@Injectable()
export class UserIdInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const userId = this.auth.currentUserId;
    if (userId) {
      req = req.clone({
        setHeaders: { 'X-User-Id': userId },
      });
    }
    return next.handle(req);
  }
}
```

在 `app.module.ts` 注册：
```typescript
providers: [
  { provide: HTTP_INTERCEPTORS, useClass: UserIdInterceptor, multi: true },
]
```

#### 11c. Auth Guard

**新增文件：`frontend/src/app/core/guards/auth.guard.ts`**

```typescript
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean {
    if (this.auth.isLoggedIn()) return true;
    this.router.navigate(['/login']);
    return false;
  }
}
```

在 `app.routes.ts` 中，对主要路由（chat、memory、workbench 等）加 `canActivate: [AuthGuard]`。

#### 11d. LoginPage（最小实现）

对于本阶段，登录页不需要真实 backend 验证，只需要「输入 userId/用户名 → 存 localStorage」即可：

**`frontend/src/app/pages/login/login.component.ts`**

核心逻辑：
- 用户输入用户名/ID
- `auth.login(userId)` → 跳转到主页

如果后续需要真实验证，后端可加 `POST /auth/login` 端点校验（Phase 3）。

#### 11e. 用户切换 UI

在顶部导航栏或设置页加「当前用户：xxx [切换]」的入口，点击后跳到 login 页重新输入。

#### 11f. 移除原有 hardcode X-User-Id 的代码

Phase 1 中如果前端有临时 hardcode，全部删除，统一由 interceptor 注入。

---

### Step 12：`GET /app/mode` 端点

前端需要知道后端 APP_USER_MODE，以控制 DevAgent/DesignAgent 入口的显隐。

**新增 controller 方法（在 `AppController` 中）：**

```typescript
@Get('app/mode')
getAppMode() {
  return {
    userMode: this.appUserMode,  // 'single' | 'multi'
    devAgentEnabled: this.isFeatureEnabled('devAgent'),
    designAgentEnabled: this.isFeatureEnabled('designAgent'),
  };
}
```

前端 `AppComponent.ngOnInit()` 中调用一次，缓存到 store，控制入口显隐。

---

### Step 13：TracePointService - 读路径通过 conversationId 间接隔离

TracePoint 有 `conversationId`，Conversation 已有 `userId`（Phase 1）。

不需要在 TracePoint 加 `userId` 字段，但读取时需要 join：

```typescript
async list(userId: string, query: TracePointQuery): Promise<TracePointRecord[]> {
  // 方案 A：子查询过滤
  return this.prisma.tracePoint.findMany({
    where: {
      conversationId: {
        in: await this.getConversationIdsByUser(userId),
      },
      // ... 其他过滤
    },
  });
}

private async getConversationIdsByUser(userId: string): Promise<string[]> {
  const convs = await this.prisma.conversation.findMany({
    where: { userId },
    select: { id: true },
  });
  return convs.map((c) => c.id);
}
```

**写入时**：TracePointExtractorService 已有 conversationId，通过它间接绑定用户，无需额外改动。

---

## 改动范围汇总

| 类别 | 涉及文件数 | 说明 |
|---|---|---|
| Schema Migration | 1 | 9 张表加 userId，3 个 unique 约束变更 |
| PostTurnPlan type + orchestrator | 2 | userId 进入 post-turn 链路 |
| SummarizerService | 1 | 全部写操作 userId 化 |
| SummarizeTriggerService | 1 | 触发时反查 conversation.userId |
| CognitiveGrowthService | 1 | 读写全面 userId 化 |
| SocialEntity/Edge/Insight Service | 3 | 读写全面 userId 化 |
| SharedExperienceService | 1 | 读写全面 userId 化 |
| DailySummaryService | 1 | 读写全面 userId 化 |
| PlanService + PlanController | 2 | userId 化 + controller 提取 |
| notify-dispatch.strategy | 1 | 支持按 userId 找 conversationId |
| 5 个 Scheduler Service | 5 | 按用户分批处理，不再全表扫描 |
| 5 个 Management Controller | 5 | 所有 CRUD 加 userId 隔离 |
| UserIdMiddleware + Decorator | 2 | 新建，全局 userId 提取 |
| AppModule | 1 | 注册全局 middleware |
| 前端 AuthService | 1 | 新建 |
| 前端 UserIdInterceptor | 1 | 新建 |
| 前端 AuthGuard | 1 | 新建 |
| 前端 LoginPage | 1 | 新建（最小实现） |
| 前端 AppController (GET /app/mode) | 1 | 新建端点 |

---

## 验证清单

```
[ ] 用户 A 总结对话 → Memory/Anchor/Profile/Claim 写入带 userId=A
[ ] 用户 A 对话触发成长记录 → CognitiveProfile/RelationshipState 写入 userId=A
[ ] 用户 A 的社交实体同步 → SocialEntity.userId=A，对用户 B 不可见
[ ] 用户 B 无法确认/拒绝用户 A 的 CognitiveProfile pending 条目
[ ] Plan 创建时带 userId → scheduler 触发时可路由到正确用户
[ ] scheduler 定时任务不跑用户 B 的记忆衰减/进化
[ ] GET /memory 只返回当前用户的记忆
[ ] GET /growth/pending 只返回当前用户的待确认条目
[ ] GET /plans 只返回当前用户的计划
[ ] GET /social/entities 只返回当前用户的社交人物
[ ] 前端有 login 页面，X-User-Id 通过 interceptor 统一注入
[ ] 前端未登录时跳转 login 页，不直接进入主界面
[ ] single 模式 → 所有行为与改造前完全一致（default-user 数据正常可用）
```

---

## 遗留风险（Phase 3 方向）

| 等级 | 风险点 | 说明 |
|---|---|---|
| 中 | 后端 Auth 无真实验证 | 当前 X-User-Id 任何人都可以伪造，Phase 3 加 JWT/token 验证 |
| 中 | Plan/Reminder 跨会话推送逻辑复杂 | userId 加进去后需要测试 scheduler → conversation 路由的准确性 |
| 中 | SocialEntity @@unique 变更 | 需要确认存量数据无冲突后再 migrate |
| 低 | CognitiveObservation/Insight 间接通过 conversationId 隔离 | 若 conversationId 为空（system 级观测），仍是全局的 |
| 低 | AgentDelegation / AgentConversationLink 无 userId | 协作链路通过 conversation 间接隔离，暂可接受 |
| 低 | MemoryProposal 无 userId | 当前协作机制还未开启，暂可接受 |

---

## Phase 3 展望

Phase 2 完成后，系统达到「数据完全隔离 + 后台任务多用户 + 前端有 auth」的状态。Phase 3 可聚焦：

1. **真实 Auth**：后端 `POST /auth/login` + JWT token 验证（替代 X-User-Id 信任模型）
2. **用户注册/管理**：`User` 表 + admin 管理界面
3. **Persona 多用户化**：每用户可独立配置人格版本（目前系统级共享）
4. **WorkspaceManager + AbortController** 多用户安全隔离（配合 DevAgent 重新开放）
5. **Rate limiting + 配额**：按用户限制 LLM 调用频率
