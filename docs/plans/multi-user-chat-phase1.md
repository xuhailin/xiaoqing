# Chat 多用户 Phase 1 实施方案

> 状态：待执行
> 日期：2026-03-27
> 目标：Chat Domain 多用户隔离 + Execution Domain 真实收口

---

## 方案可行性评估

### 结论：方案可行，需补充以下关键边界

原方案逻辑正确，但以下几点需要在执行前明确：

| 问题 | 代码事实 | 本方案处理 |
|---|---|---|
| Auth 机制未指定 | 系统无任何 auth | 使用 `X-User-Id` 请求头，最小实现 |
| userId 链路完全断裂 | `AgentRequest` 无 userId；`AssistantAgentAdapter` 调用时不传 | 全链路补透 |
| `default-user` 硬编码 28+ 处 | 4 处在 `turn-context-assembler.ts` 第 181/343/380/614/645/669 行 | 替换为请求上下文 userId |
| `Memory` 表无 userId | Schema 无此字段 | 需加 `userId` 字段 + migration |
| `Conversation` 表无 userId | Schema 无此字段 | 需加 `userId` 字段 + migration |
| `SocialEntity` 注入有 PII 风险 | `buildSocialContext` 返回命名人物 | multi 模式下停止注入 |
| DevAgent/DesignAgent 无 feature flag | `app.module.ts` 无条件注册 | 补 flag，dispatcher/controller 层拒绝 |

---

## 核心设计决策

### D1. userId 来源：`X-User-Id` 请求头

- `APP_USER_MODE=single`（默认）：不需要头，userId = `DEFAULT_USER_KEY`（默认 `'default-user'`）
- `APP_USER_MODE=multi`：必须传 `X-User-Id` 头，缺失返回 401

前端登录后在每次请求中携带此头。本方案不实现登录注册，只约定边界。

### D2. 传递路径

```
HTTP Header X-User-Id
  → GatewayController（提取 userId）
  → DispatcherService.dispatch(conversationId, content, mode, metadata, entryAgentId, userId)
  → AgentRequest.userId
  → AssistantAgentAdapter.handle(req)
  → ConversationService.sendMessage(conversationId, content, userId)
  → AssistantOrchestrator.processTurn({..., userId})
  → TurnContextAssembler.assemble({..., userId})
  → sub-services (userProfile, identityAnchor, memory, claims, sessionState)
```

### D3. Schema 策略

两张表加 `userId NOT NULL DEFAULT 'default-user'`：
- 存量数据自动归属 `default-user`，不需要数据迁移脚本
- 新建记录必须携带 userId

### D4. 暂缓域的处理策略

| 域 | 是否进入 chat prompt | multi 模式下处理 |
|---|---|---|
| `Persona` | 是 | 继续注入（代表小晴，系统级） |
| `RelationshipState` | 是（growth context） | 继续注入（代表小晴对「这段关系」的认知，phase 1 可接受不精准） |
| `CognitiveProfile` | 是（growth context） | 继续注入（小晴的认知模式，系统级） |
| `SocialEntity` | 是（social block） | **multi 模式停止注入**（包含具名人物，用户 PII） |
| `SocialRelationEdge` | 是（social block） | **multi 模式停止注入**（同上） |
| `SocialInsight` | 是（social block） | **multi 模式停止注入**（同上） |
| `SharedExperience` | 是（relationship block） | 继续注入（共同经历，小晴记忆，phase 1 可接受不精准） |

---

## 执行步骤

### Step 0：前置确认

执行前请阅读以下文件（不要修改）：
- `backend/src/gateway/gateway.controller.ts`
- `backend/src/orchestrator/dispatcher.service.ts`
- `backend/src/orchestrator/agent.interface.ts`
- `backend/src/orchestrator/assistant-agent.adapter.ts`
- `backend/src/assistant/conversation/conversation.service.ts`
- `backend/src/assistant/conversation/assistant-orchestrator.service.ts`（重点看 `processTurn` 的入参类型）
- `backend/src/assistant/conversation/turn-context-assembler.service.ts`（重点看 `assemble` 方法入参和 `buildClaimAndSessionContext` 方法）
- `backend/src/assistant/persona/user-profile.service.ts`（重点看 `getOrCreate` 方法）
- `backend/src/assistant/identity-anchor/identity-anchor.service.ts`（重点看 `getActiveAnchors` 方法）
- `backend/src/assistant/memory/memory.service.ts`（重点看 `getCandidatesForRecall` 和 `create` 方法）
- `backend/src/config/feature-flags.ts`
- `backend/.env.example`
- `backend/prisma/schema.prisma`

---

### Step 1：新增 APP_USER_MODE 配置 + Feature Flags

**文件：`backend/src/config/feature-flags.ts`**

在 `FEATURE_FLAGS` 对象末尾添加两个新条目：

```typescript
devAgent: { key: 'FEATURE_DEV_AGENT', defaultEnabled: true },
designAgent: { key: 'FEATURE_DESIGN_AGENT', defaultEnabled: true },
```

**新增文件：`backend/src/infra/user-mode.config.ts`**

```typescript
import type { ConfigService } from '@nestjs/config';

export type AppUserMode = 'single' | 'multi';

export function getAppUserMode(config: Pick<ConfigService, 'get'>): AppUserMode {
  const raw = config.get<string>('APP_USER_MODE');
  return raw === 'multi' ? 'multi' : 'single';
}

export function getDefaultUserKey(config: Pick<ConfigService, 'get'>): string {
  return config.get<string>('DEFAULT_USER_KEY') || 'default-user';
}
```

**文件：`backend/.env.example`**

在文件末尾追加：

```
# ── 用户模式（single=单用户模式，multi=多用户模式）────────────────────
# single（默认）：所有请求使用 DEFAULT_USER_KEY，无需 X-User-Id 头
# multi：请求必须携带 X-User-Id 头；DevAgent/DesignAgent 等执行能力不可用
APP_USER_MODE=single
# 单用户模式下的默认用户标识（不应在生产多用户环境中作为实际 userId 使用）
DEFAULT_USER_KEY=default-user

# ── Execution Domain Feature Flags ──────────────────────────────────────
# DevAgent（默认 true；multi 模式下后端自动拒绝）
FEATURE_DEV_AGENT=true
# DesignAgent（默认 true；multi 模式下后端自动拒绝）
FEATURE_DESIGN_AGENT=true
```

---

### Step 2：Schema Migration — 为 Conversation 和 Memory 加 userId

**文件：`backend/prisma/schema.prisma`**

在 `model Conversation` 中，在 `createdAt` 字段**之前**添加：

```prisma
userId       String    @default("default-user")
```

并在 `@@index` 块中添加：

```prisma
@@index([userId, isInternal, updatedAt])
```

在 `model Memory` 中，在 `createdAt` 字段**之前**添加：

```prisma
userId       String    @default("default-user")
```

并在已有 `@@index([category])` 之后添加：

```prisma
@@index([userId])
```

**执行 Migration：**

```bash
cd backend
npx prisma migrate dev --name add-userId-to-conversation-and-memory
```

> ⚠️ migration 使用 DEFAULT 值，存量数据自动归属 `'default-user'`，无需手动数据迁移。

---

### Step 3：User Context 提取 — Gateway 层

**文件：`backend/src/gateway/gateway.controller.ts`**

修改如下：

```typescript
import { Body, Controller, Headers, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DispatcherService } from '../orchestrator/dispatcher.service';
import { getAppUserMode, getDefaultUserKey } from '../infra/user-mode.config';
import type { SendMessageBody } from './message-router.types';

@Controller('conversations')
export class GatewayController {
  private readonly appUserMode: string;
  private readonly defaultUserKey: string;

  constructor(
    private readonly dispatcher: DispatcherService,
    config: ConfigService,
  ) {
    this.appUserMode = getAppUserMode(config);
    this.defaultUserKey = getDefaultUserKey(config);
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageBody,
    @Headers('x-user-id') xUserId?: string,
  ) {
    if (!body?.content || typeof body.content !== 'string') {
      return { error: 'content is required' };
    }

    let userId: string;
    if (this.appUserMode === 'multi') {
      if (!xUserId?.trim()) {
        throw new HttpException('X-User-Id header is required in multi-user mode', HttpStatus.UNAUTHORIZED);
      }
      userId = xUserId.trim();
    } else {
      userId = xUserId?.trim() || this.defaultUserKey;
    }

    const result = await this.dispatcher.dispatch(
      id,
      body.content.trim(),
      body.mode,
      body.metadata,
      body.entryAgentId,
      userId,
    );

    return result.payload;
  }
}
```

**注意：** `GatewayModule` 需要引入 `ConfigService`。检查 `backend/src/gateway/gateway.module.ts`，若 `ConfigModule` 已 global（`app.module.ts` 中已是 `ConfigModule.forRoot({ isGlobal: true })`），则无需额外导入。

---

### Step 4：AgentRequest 加 userId + Dispatcher 传透

**文件：`backend/src/orchestrator/agent.interface.ts`**

在 `AgentRequest` interface 中添加字段：

```typescript
/** 当前请求的用户 ID，来自请求上下文（单用户模式为 DEFAULT_USER_KEY） */
userId: string;
```

**文件：`backend/src/orchestrator/dispatcher.service.ts`**

1. `dispatch` 方法签名加 `userId: string` 参数（放在最后一个位置）：

```typescript
async dispatch(
  conversationId: string,
  content: string,
  mode?: MessageChannel,
  metadata?: SendMessageMetadata,
  entryAgentId?: EntryAgentId,
  userId: string = 'default-user',
): Promise<AgentResult>
```

2. 在构建 `req: AgentRequest` 时加入 `userId`：

```typescript
const req: AgentRequest = {
  conversationId,
  content: decision.content,
  mode: decision.channel,
  entryAgentId: resolvedEntryAgentId,
  metadata: ...,
  userId,
};
```

3. **在多用户模式下拒绝 dev channel**。在构造函数中注入 `ConfigService` 并读取 `appUserMode`，然后在 `dispatch` 方法路由决策后插入：

```typescript
// 引入 import
import { ConfigService } from '@nestjs/config';
import { getAppUserMode } from '../infra/user-mode.config';
import { isFeatureEnabled } from '../config/feature-flags';

// 构造函数加
private readonly appUserMode: string;

constructor(
  private readonly router: MessageRouterService,
  private readonly lock: ConversationLockService,
  private readonly prisma: PrismaService,
  private readonly conversationWork: ConversationWorkService,
  private readonly config: ConfigService,
  @Inject(AGENT_TOKEN) agents: IAgent[],
) {
  this.agentMap = new Map(agents.map((a) => [a.channel, a]));
  this.appUserMode = getAppUserMode(config);
  // ...
}

// dispatch 方法中，在 this.logger.log 之后添加：
if (decision.channel === 'dev') {
  if (this.appUserMode === 'multi') {
    throw new HttpException(
      'DevAgent is not available in multi-user mode',
      HttpStatus.FORBIDDEN,
    );
  }
  if (!isFeatureEnabled(this.config, 'devAgent')) {
    throw new HttpException(
      'DevAgent is disabled',
      HttpStatus.FORBIDDEN,
    );
  }
}
```

需在文件顶部添加：

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';
```

**文件：`backend/src/orchestrator/assistant-agent.adapter.ts`**

修改 `handle` 方法，传递 userId：

```typescript
async handle(req: AgentRequest): Promise<AgentResult> {
  const result = await this.conversation.sendMessage(
    req.conversationId,
    req.content,
    req.userId,
  );
  // ...
}
```

---

### Step 5：ConversationService — 隔离 conversation 归属

**文件：`backend/src/assistant/conversation/conversation.service.ts`**

#### 5a. `list()` 加 userId 过滤

方法签名改为 `async list(userId: string)`，并在 `findMany` 的 `where` 条件加 `userId`：

```typescript
async list(userId: string) {
  const conversations = await this.prisma.conversation.findMany({
    where: { isInternal: false, userId },
    // ...
  });
  // ...
}
```

#### 5b. `create()` 加 userId

```typescript
async create(
  userId: string,
  entryAgentId: EntryAgentId = DEFAULT_ENTRY_AGENT_ID,
): Promise<{ id: string; entryAgentId: EntryAgentId }> {
  const c = await this.prisma.conversation.create({
    data: { entryAgentId, userId },
  });
  return { id: c.id, entryAgentId: c.entryAgentId as EntryAgentId };
}
```

#### 5c. `getOrCreateCurrent()` 加 userId

```typescript
async getOrCreateCurrent(
  userId: string,
  entryAgentId: EntryAgentId = DEFAULT_ENTRY_AGENT_ID,
) {
  const latest = await this.prisma.conversation.findFirst({
    where: { entryAgentId, isInternal: false, userId },
    orderBy: { createdAt: 'desc' },
  });
  if (latest) return { id: latest.id, entryAgentId: latest.entryAgentId as EntryAgentId };
  return this.create(userId, entryAgentId);
}
```

#### 5d. `getMessages()` 加 owner 校验

```typescript
async getMessages(conversationId: string, userId: string): Promise<ConversationMessageDto[]> {
  // 校验归属
  const conv = await this.prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!conv) {
    throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
  }
  const messages = await this.prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return messages.map(toConversationMessageDto);
}
```

对 `delete`, `getWorldState`, `updateWorldState`, `getTokenStats`, `listWorkItems`, `listDailyMoments`, `flushSummarize` 等按 `conversationId` 操作的方法，**统一添加 owner 校验**：

```typescript
private async assertConversationOwner(conversationId: string, userId: string): Promise<void> {
  const conv = await this.prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!conv) {
    throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
  }
}
```

在每个需要校验的方法开头调用 `await this.assertConversationOwner(conversationId, userId)`。

#### 5e. `sendMessage()` 加 userId，并传给 orchestrator

```typescript
async sendMessage(
  conversationId: string,
  content: string,
  userId: string,
): Promise<SendMessageResult> {
  await this.assertConversationOwner(conversationId, userId);
  const userMsg = await this.prisma.message.create({ /* ... */ });
  return this.assistantOrchestrator.processTurn({
    conversationId,
    userInput: content,
    userMessage: { /* ... */ },
    recentRounds: this.lastNRounds,
    userId,  // 新增
  });
}
```

#### 5f. ConversationController 更新

`conversation.controller.ts` 的 `list`, `create`, `getOrCreateCurrent`, `getMessages`, `delete`, `getWorldState`, `updateWorldState`, `getTokenStats`, `listDailyMoments`, `listWorkItems`, `flushSummarize` 等端点，需要从请求头提取 userId 并传给 service。

在 controller 中注入 `ConfigService`，添加 `extractUserId` 私有方法：

```typescript
import { Controller, Headers, HttpException, HttpStatus, ... } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppUserMode, getDefaultUserKey } from '../../infra/user-mode.config';

@Controller('conversations')
export class ConversationController {
  private readonly appUserMode: string;
  private readonly defaultUserKey: string;

  constructor(
    private conversation: ConversationService,
    private readonly conversationWork: ConversationWorkService,
    config: ConfigService,
  ) {
    this.appUserMode = getAppUserMode(config);
    this.defaultUserKey = getDefaultUserKey(config);
  }

  private extractUserId(xUserId?: string): string {
    if (this.appUserMode === 'multi') {
      if (!xUserId?.trim()) {
        throw new HttpException('X-User-Id header is required', HttpStatus.UNAUTHORIZED);
      }
      return xUserId.trim();
    }
    return xUserId?.trim() || this.defaultUserKey;
  }

  @Get()
  async list(@Headers('x-user-id') xUserId?: string) {
    return this.conversation.list(this.extractUserId(xUserId));
  }

  @Post()
  async create(
    @Body() body?: { entryAgentId?: EntryAgentId },
    @Headers('x-user-id') xUserId?: string,
  ) {
    const userId = this.extractUserId(xUserId);
    return this.conversation.create(userId, body?.entryAgentId ?? DEFAULT_ENTRY_AGENT_ID);
  }

  @Get('current')
  async getOrCreateCurrent(
    @Query('entryAgentId') entryAgentId?: EntryAgentId,
    @Headers('x-user-id') xUserId?: string,
  ) {
    const userId = this.extractUserId(xUserId);
    return this.conversation.getOrCreateCurrent(userId, entryAgentId ?? DEFAULT_ENTRY_AGENT_ID);
  }

  // 对其他按 :id 操作的端点，同样提取 userId 并传给 service
  @Get(':id/messages')
  async getMessages(
    @Param('id') id: string,
    @Headers('x-user-id') xUserId?: string,
  ) {
    return this.conversation.getMessages(id, this.extractUserId(xUserId));
  }

  // ... 其余端点类似处理
}
```

> **注意**：`ConversationModule` 需要导入 `ConfigModule`。由于已是 global，通常无需显式导入。

---

### Step 6：ProcessTurnInput + AssistantOrchestrator 传透 userId

**找到 `ProcessTurnInput` 类型（通常在 `orchestration.types.ts` 或 `assistant-orchestrator.service.ts` 内定义）**

在该 interface 中添加：

```typescript
userId: string;
```

**文件：`backend/src/assistant/conversation/assistant-orchestrator.service.ts`**

在 `processTurn` 方法签名中接收 `userId`，并将其传给 `TurnContextAssembler.assemble()`：

```typescript
async processTurn(input: ProcessTurnInput): Promise<SendMessageResult> {
  // ...
  const ctx = await this.assembler.assemble({
    conversationId: input.conversationId,
    userInput: input.userInput,
    userMessage: input.userMessage,
    now: new Date(),
    recentRounds: input.recentRounds,
    userId: input.userId,  // 新增
    // ...
  });
  // ...
}
```

---

### Step 7：TurnContextAssembler — 接收并传透 userId

**文件：`backend/src/assistant/conversation/turn-context-assembler.service.ts`**

#### 7a. `assemble()` 入参加 `userId: string`

```typescript
async assemble(input: {
  conversationId: string;
  userInput: string;
  userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
  now: Date;
  recentRounds: number;
  userId: string;  // 新增
  quickRoute?: QuickRouterOutput | null;
  collaborationContext?: CollaborationTurnContext | null;
}): Promise<TurnContext>
```

#### 7b. 替换所有 `'default-user'` 为 `input.userId`

**第 109 行**（`this.userProfile.getOrCreate()`）：改为 `this.userProfile.getOrCreate(input.userId)`

**第 110 行**（`this.identityAnchor.getActiveAnchors()`）：改为 `this.identityAnchor.getActiveAnchors(input.userId)`

**第 181 行**（`const userKey = 'default-user'`）：改为 `const userKey = input.userId`

**第 343 行**（`userKey: 'default-user'`，在 `readPreferredNickname`）：此方法没有 userId 参数，需改为接受 `userKey` 参数，并从 `assemble` 中传入：

将 `readPreferredNickname()` 改为 `readPreferredNickname(userKey: string)`，内部 `where.userKey = userKey`

同理处理 **第 380 行** 的另一个 `userKey: 'default-user'`（在 `readInteractionTuning`）。

**第 614, 645, 669 行**（`buildClaimAndSessionContext`）：

将 `buildClaimAndSessionContext(conversationId: string)` 改为 `buildClaimAndSessionContext(conversationId: string, userId: string)`，内部将 `'default-user'` 全部替换为 `userId`。

**调用点**（第 149 行）改为：

```typescript
this.buildClaimAndSessionContext(input.conversationId, input.userId),
```

**调用 `readPreferredNickname` 和 `readInteractionTuning` 的地方**（第 125-128 行附近）：

```typescript
const [preferredNickname, interactionTuning] = await Promise.all([
  this.readPreferredNickname(input.userId),
  this.readInteractionTuning(input.userId),
]);
```

#### 7c. multi 模式下停止 SocialEntity 注入

注入 `ConfigService`（或通过 `FeatureFlagConfig` 引入一个新的字段），在 `buildSocialContext` 调用之前判断：

```typescript
// 在 turn-context-assembler.service.ts 构造函数中读取
private readonly appUserMode: string;

constructor(
  // ... 现有参数
  config: ConfigService,  // 如已有 FeatureFlagConfig，可从中读
) {
  this.appUserMode = getAppUserMode(config);
  // ...
}
```

在 `assemble` 方法中（当前第 157-176 行的 social/relationship 构建逻辑）：

```typescript
if (shouldSkipSocialRelationship || this.appUserMode === 'multi') {
  socialCtx = { entities: [], insights: [], relationSignals: [] };
} else {
  socialCtx = await this.buildSocialContext({ ... });
}
```

> **注意**：`RelationshipState` 通过 `buildRelationshipContext` 注入（含 `sharedExperiences`, `rhythmObservations`），这些是小晴层面的记忆，phase 1 继续注入，不必停止。

---

### Step 8：IdentityAnchorService + UserProfileService 接受运行时 userKey

**文件：`backend/src/assistant/identity-anchor/identity-anchor.service.ts`**

`getActiveAnchors()` 改为 `getActiveAnchors(userKey?: string)`：

```typescript
async getActiveAnchors(userKey?: string): Promise<AnchorDto[]> {
  const key = userKey ?? this.defaultUserKey;
  return this.prisma.identityAnchor.findMany({
    where: { userKey: key, isActive: true },
    orderBy: { sortOrder: 'asc' },
    take: MAX_ANCHORS,
  });
}
```

同理，`list()` 改为 `list(userKey?: string)`，使用 `userKey ?? this.defaultUserKey`。

**文件：`backend/src/assistant/persona/user-profile.service.ts`**

找到 `getOrCreate()` 方法。当前它使用 `config.get('DEFAULT_USER_KEY') || 'default-user'` 作为 key。

改为接受 `userKey` 参数：

```typescript
async getOrCreate(userKey?: string): Promise<UserProfileDto> {
  const key = userKey ?? this.defaultUserKey; // this.defaultUserKey 从 config 读
  return this.prisma.userProfile.upsert({
    where: { userKey: key },
    update: {},
    create: { userKey: key },
  });
}
```

**controller 中调用这些 service 的地方（`identity-anchor.controller.ts` 等）**：
- 这些 controller 暂时保持使用 `this.defaultUserKey`（即 `list()` 不传参）
- 多用户化 controller 层是 Phase 2 工作，Phase 1 只确保 chat 主链路正确

---

### Step 9：Memory 隔离

**文件：`backend/src/assistant/memory/memory.service.ts`**

#### 9a. `getCandidatesForRecall` 加 userId 过滤

在方法签名中加 `userId?: string` 参数（通过 `RecallContext` 传入，或直接在 opts 中加）：

方案：在 `RecallContext` interface（`memory-recaller.interface.ts`）中加 `userId?: string`，然后在 `getCandidatesForRecall` 的 `findMany` 的 `where` 条件加 `userId`。

```typescript
// memory-recaller.interface.ts 中的 RecallContext 加：
userId?: string;

// memory.service.ts 的 getCandidatesForRecall 的 findMany where 条件：
where: {
  type: 'long',
  decayScore: { gt: 0 },
  ...(opts.userId ? { userId: opts.userId } : {}),
},
```

**注意**：在 `APP_USER_MODE=single` 且 userId='default-user' 时，存量数据（已有 `userId='default-user'`）能正常查询到。

#### 9b. `create()` 加 userId

```typescript
async create(data: {
  type: 'mid' | 'long';
  content: string;
  sourceMessageIds: string[];
  confidence?: number;
  category?: string;
  frozen?: boolean;
  correctedMemoryId?: string;
  userId?: string;  // 新增
}) {
  return this.prisma.memory.create({
    data: {
      // ...
      userId: data.userId ?? 'default-user',
    },
  });
}
```

#### 9c. 其他查询方法（`list`, `getForInjection`, `getExistingCognitiveMemories` 等）

这些方法目前被 Memory Controller（管理界面）调用，不在 chat 主链路。Phase 1 **不需要改这些**——它们继续查全局数据，这在 single 模式下是正确的。记为技术债。

#### 9d. Summarizer 写入 Memory 时的 userId

Summarizer 通过 `conversationId` 触发，需要在写入 Memory 时携带 userId。

在 Summarizer（`backend/src/assistant/summarizer/`）写入记忆的代码处，先查 conversation.userId：

```typescript
const conv = await this.prisma.conversation.findUnique({
  where: { id: conversationId },
  select: { userId: true },
});
const userId = conv?.userId ?? 'default-user';
// 然后在 memoryService.create({ ..., userId }) 中传入
```

> 注意：需要找到 Summarizer 调用 `memoryService.create` 的位置，统一添加此逻辑。

#### 9e. TurnContextAssembler 中的 recall 调用需传 userId

在 `recallMemories` 私有方法中，将 `userId` 传入 `RecallContext`：

```typescript
private async recallMemories(
  conversationId: string,
  recentMessages: ...,
  personaDto: ...,
  profile: ...,
  quickRoute: ...,
  userId: string,  // 新增
): Promise<...> {
  // ...
  const ctx: RecallContext = {
    // ...
    userId,
  };
}
```

调用点改为 `this.recallMemories(..., input.userId)`。

---

### Step 10：Execution Domain 真实收口

#### 10a. DesignAgent Controller 加 multi-user 拒绝

**文件：找到 `design-agent.controller.ts`**（路径：`backend/src/design-agent/design-agent.controller.ts`）

读取该文件后，在所有 handler 方法开头加：

```typescript
// 注入 ConfigService，构造函数中：
private readonly appUserMode: string;
private readonly featureEnabled: boolean;

constructor(
  ...,
  config: ConfigService,
) {
  this.appUserMode = getAppUserMode(config);
  this.featureEnabled = isFeatureEnabled(config, 'designAgent');
}

// 在每个 handler 开头调用：
private assertDesignAgentAvailable(): void {
  if (!this.featureEnabled) {
    throw new HttpException('DesignAgent is disabled', HttpStatus.FORBIDDEN);
  }
  if (this.appUserMode === 'multi') {
    throw new HttpException(
      'DesignAgent is not available in multi-user mode',
      HttpStatus.FORBIDDEN,
    );
  }
}
```

#### 10b. OpenClaw

无需额外改动。`OPENCLAW_AGENTS` 为空时 `featureOpenClaw = false`，intent 路由不会选中 OpenClaw 路径。在 multi 模式下建议在 `.env.example` 注释中说明「multi 模式应清空 OPENCLAW_AGENTS」。

#### 10c. 本地技能下载 / 打工 / 工时上报

这三项已有 `isAvailable()` 机制：
- 书籍下载：`RESOURCE_BASE_URL` 为空则 `isAvailable()=false`
- 打卡：`CHECKIN_TARGET_URL` 为空则不可用
- 工时：`FEATURE_TIMESHEET=false` 则不可用

**需要补充**：当 `APP_USER_MODE=multi` 时，无论上述配置如何，这些能力都应该返回 `isAvailable()=false`。

找到 capability 的 `isAvailable()` 方法并添加 user mode 检查，或在 `CapabilityRegistry` 的 `listExposed()` 方法中统一过滤。

推荐方案：在这几个 Skill service 的构造函数中注入 ConfigService 并读取 userMode，在 `isAvailable()` 中加一行：

```typescript
if (this.appUserMode === 'multi') return false;
```

---

### Step 11：前端入口更新

> ⚠️ 这一步是防止「前端入口残留」，不影响后端安全性。

#### 11a. 在所有 HTTP 请求中携带 `X-User-Id` 头

前端维护一个当前登录用户 ID。在 HTTP client（`HttpClient` interceptor 或 service）中统一注入：

```typescript
// Angular HTTP Interceptor 示例
req = req.clone({
  setHeaders: {
    'X-User-Id': this.authService.getCurrentUserId(),
  }
});
```

如果前端尚未有登录态，可先 hardcode 为一个固定值（`'local-dev-user'`）用于开发，等 Phase 2 再接真实登录。

#### 11b. DevAgent 入口

找到前端的 DevAgent 面板入口组件（`frontend/src/app/dev-agent/**`）。

在 `APP_USER_MODE=multi` 时：
- 隐藏或禁用 DevAgent 面板入口按钮
- 若用户已进入 DevAgent 界面，显示「当前模式不支持开发能力」提示

#### 11c. DesignAgent 入口

同 DevAgent，在 `APP_USER_MODE=multi` 时隐藏入口。

前端读取 app 配置的方式：可以通过 `GET /app/config`（新增一个轻量配置端点）或前端环境变量（`environment.ts`）来获取 `APP_USER_MODE`。

**推荐**：后端新增 `GET /app/mode` 端点，返回 `{ userMode: 'single' | 'multi' }`，前端启动时调用一次并缓存。

---

### Step 12：配置与文档收口

#### 12a. `.env.example` 已在 Step 1 中更新

确认包含：
- `APP_USER_MODE=single`
- `DEFAULT_USER_KEY=default-user`
- `FEATURE_DEV_AGENT=true`
- `FEATURE_DESIGN_AGENT=true`

#### 12b. 检查 GatewayModule 是否需要导出新内容

无需变更，ConfigModule 已是 global。

---

## 改动范围汇总

| 文件 | 改动类型 | 关键改动 |
|---|---|---|
| `prisma/schema.prisma` | Schema | `Conversation` + `Memory` 加 `userId` 字段 |
| `config/feature-flags.ts` | 业务逻辑 | 新增 `devAgent`, `designAgent` flags |
| `infra/user-mode.config.ts` | 新建 | APP_USER_MODE 读取工具函数 |
| `gateway/gateway.controller.ts` | 业务逻辑 | 提取 X-User-Id，传给 dispatcher |
| `orchestrator/agent.interface.ts` | 类型 | AgentRequest 加 userId |
| `orchestrator/dispatcher.service.ts` | 业务逻辑 | dispatch 加 userId；dev channel 拒绝逻辑 |
| `orchestrator/assistant-agent.adapter.ts` | 业务逻辑 | handle() 传 userId 给 sendMessage |
| `assistant/conversation/conversation.service.ts` | 业务逻辑 | 全部方法加 userId；conversation 归属校验 |
| `assistant/conversation/conversation.controller.ts` | 业务逻辑 | 所有端点提取 userId 并传给 service |
| `assistant/conversation/assistant-orchestrator.service.ts` | 业务逻辑 | processTurn input 加 userId；传给 assembler |
| `assistant/conversation/turn-context-assembler.service.ts` | 业务逻辑 | assemble 加 userId；替换所有 default-user；multi 模式停止 SocialEntity 注入 |
| `assistant/identity-anchor/identity-anchor.service.ts` | 业务逻辑 | getActiveAnchors/list 接受 userKey 参数 |
| `assistant/persona/user-profile.service.ts` | 业务逻辑 | getOrCreate 接受 userKey 参数 |
| `assistant/memory/memory.service.ts` | 业务逻辑 | create 加 userId；getCandidatesForRecall 加 userId 过滤 |
| `assistant/memory/memory-recaller.interface.ts` | 类型 | RecallContext 加 userId |
| `assistant/summarizer/**` | 业务逻辑 | 写入 Memory 时查 conversation.userId |
| `design-agent/design-agent.controller.ts` | 业务逻辑 | 所有 handler 加 feature flag + multi mode 拒绝 |
| `backend/.env.example` | 配置 | 新增 APP_USER_MODE, DEFAULT_USER_KEY, FEATURE_DEV_AGENT, FEATURE_DESIGN_AGENT |

---

## Chat 多用户闭环验证清单

完成以上步骤后，验证以下闭环：

```
[ ] 用户 A 发消息 → 只写入 userId=A 的 Conversation/Message
[ ] 用户 A GET /conversations → 只看到 userId=A 的对话列表
[ ] 用户 A GET /conversations/:id 详情 → 若 id 属于用户 B，返回 404
[ ] 用户 A 聊天时 → Memory 召回只查 userId=A 的记忆
[ ] 用户 A 聊天时 → UserProfile/IdentityAnchor/UserClaim/SessionState 只读 userKey=A 的数据
[ ] 用户 A 聊天时 → SocialEntity 不被注入 prompt（multi 模式）
[ ] multi 模式 POST /conversations/:id/messages 不带 X-User-Id → 返回 401
[ ] multi 模式 POST /conversations/:id/messages mode=dev → 返回 403
[ ] multi 模式调用 DesignAgent 端点 → 返回 403
[ ] single 模式（DEFAULT_USER_KEY=default-user）→ 系统行为与改造前完全一致
```

---

## 遗留风险

| 等级 | 风险点 | 处理时机 |
|---|---|---|
| 高 | Memory 的 `list/getForInjection/getExistingCognitiveMemories` 等管理接口仍返回全局数据 | Phase 2 |
| 高 | Summarizer 触发的 Claim/SessionState 写入尚未 userId 化 | Phase 2 |
| 中 | `RelationshipState`/`CognitiveProfile`/`SharedExperience` 继续注入，多用户下会给出不精准的关系语境 | Phase 2 |
| 中 | IdentityAnchorController/UserProfileController 管理端点未接 userId，多用户下所有用户共享同一管理界面 | Phase 2 |
| 中 | Plan/Reminder/TaskOccurrence 无 userId，scheduler 触发的提醒消息会进入第一个 active conversation | Phase 2 |
| 低 | WorkspaceManager/AbortController 进程内状态无 userId（DevAgent 已在 multi 模式下整体关闭） | Phase 3 |
| 低 | `SocialEntity` 全局数据继续写入（post-turn 提取路径），只是 multi 模式下不注入 prompt | Phase 2 |

---

## 下一步（Phase 2）

Phase 1 完成后，若需要继续推进，优先级顺序：

1. 管理端 API（Memory/Anchor/Profile）加 userId 过滤
2. RelationshipState/CognitiveProfile 加 userId 字段并隔离
3. Plan/Reminder/Scheduler 加 userId，提醒只推给对应用户
4. 前端实现真正的登录态（而不是 hardcode X-User-Id）
5. SocialEntity 加 userId 字段并隔离写入
