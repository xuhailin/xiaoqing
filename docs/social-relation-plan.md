# 关系认知（Relation Cognition）演进计划

> 本文档描述小晴"关系认知"能力从 MVP 到终态的完整路径。
> 包含两条平行线：用户社会世界的认知（线 A）+ 小晴与用户的关系深化（线 B）。
> 每个阶段都基于当前代码现状，说明做什么、复用什么、新增什么。

---

## 总体定位

小晴的关系认知包含两个维度：

1. **用户的社会世界**：用户生活中有哪些人、这些人对用户意味着什么
2. **小晴与用户的关系**：我们之间的关系阶段、互动节奏、共同经历、每次对话的关系意义

这两个维度最终汇合成小晴对"关系"的完整理解。

### 两条线的结构

```
线 A：社会关系认知（用户的社会世界）
  L1  实体层    SocialEntity        "用户世界里有谁"
  L2  关系层    SocialRelation      "这些人和用户是什么关系、关系质量如何"
  L3  洞察层    SocialInsight       "小晴从关系模式中观察到了什么"

线 B：小晴与用户的关系深化
  B1  关系可见化    RelationshipState API + 节奏偏好聚合
  B2  Session 回顾  SessionReflection   "这次对话对我们关系意味着什么"
  B3  共同经历      SharedExperience    "我们一起经历过什么"
  B4  关系召回      对话中主动引用共同经历和关系节奏
```

两条线在后期会合：
- A3 的关系事件 + B2 的 session reflection → 统一的 relation event 流
- A4 的社会洞察 + B3 的 shared experience → 统一注入 TurnContextAssembler

### 与现有"关系节奏"能力的关系

当前系统已有三层关系节奏处理：

| 层级 | 位置 | 说明 |
|------|------|------|
| Claim `rr.*` | `claim-schema.registry.ts` | 用户偏好：prefer_short_reply, dislike_too_pushy 等 |
| `RhythmContext` | `cognitive-pipeline.service.ts` | 每轮决策：pacing / initiative / shouldAskFollowup |
| Memory `RHYTHM_PATTERN` | `memory-category.ts` | 长期记忆：半衰期 45 天的节奏模式 |

这三层是"小晴如何与用户互动"的运行时能力，**线 B 不重建这些**，而是：
- B1 将它们聚合为用户可见的"关系画像"
- B2 的 Session Reflection 为 rhythm 积累新观测（如"这次用户明显不想被追问"）
- B4 在对话中召回节奏偏好时，引用具体共同经历作为依据

---

## Phase 1: MVP — 实体聚合与展示

### 目标
从已有的 TracePoint.people 数据中聚合出人物实体，提供 API 供前端球状图渲染。

### 为什么从这里切入
- TracePoint 已在每次对话后通过 LLM 提取 `people: string[]`（见 `trace-point-extractor.service.ts` 第 28-43 行的 prompt）
- 数据已经在持续积累，只差聚合成实体
- 不需要改动任何现有模块的核心逻辑

### 新增内容

**1. Prisma model: `SocialEntity`**

```prisma
model SocialEntity {
  id             String   @id @default(uuid())
  name           String           // 主名称（如"妈妈"）
  aliases        String[] @default([])  // 别名（如["老妈", "我妈"]）
  relation       String   @default("other") // family | friend | colleague | other
  description    String?  @db.Text        // 小晴对此人的简短认知
  firstSeenAt    DateTime                  // 首次出现时间
  lastSeenAt     DateTime                  // 最近出现时间
  mentionCount   Int      @default(1)     // 出现次数
  tags           String[] @default([])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([name])
  @@index([relation])
  @@index([lastSeenAt])
}
```

设计说明：
- 不建 edge 表。MVP 阶段关系是星形拓扑（用户在中心），`relation` 字段足够。
- `aliases` 处理同一人的不同称呼（"我妈" vs "妈妈"），合并逻辑在 service 层。
- `description` 是小晴的认知摘要，后续由 LLM 在 post-turn 或定时任务中生成/更新。
- 不做 FK 关联 TracePoint——通过 name 匹配即可，避免迁移复杂度。

**2. Service: `SocialEntityService`**

放在 `backend/src/assistant/life-record/social-entity/`，与 TracePoint 同域。

核心方法：

| 方法 | 说明 |
|------|------|
| `syncFromTracePoints(since?: Date)` | 扫描 TracePoint.people，按名字 upsert SocialEntity，更新 mentionCount/lastSeenAt |
| `list(options?)` | 返回全部实体，支持按 relation 过滤、按 mentionCount 排序 |
| `merge(sourceId, targetId)` | 合并两个实体（处理别名冲突） |
| `update(id, patch)` | 手动修正 relation/description/aliases |

`syncFromTracePoints` 的逻辑：
1. 查询 `since` 之后的所有 TracePoint，提取所有 `people` 去重
2. 对每个人名，尝试匹配已有 SocialEntity（name 或 aliases 包含该名字）
3. 匹配到：更新 mentionCount + lastSeenAt
4. 未匹配：创建新 SocialEntity（relation 默认 "other"，等后续 LLM 或用户手动分类）

**3. Controller: `SocialEntityController`**

| 端点 | 说明 |
|------|------|
| `GET /api/social-entities` | 返回实体列表（前端球状图数据源） |
| `PATCH /api/social-entities/:id` | 手动修正实体信息 |
| `POST /api/social-entities/merge` | 合并重复实体 |
| `POST /api/social-entities/sync` | 手动触发同步（调试用） |

**4. 集成点：触发同步**

在 `PostTurnPipeline.runAfterReturn()` 中，TracePoint 提取完成后调用 `syncFromTracePoints()`。
只需加一行调用，不改 post-turn 的结构。

### 不做的事
- 不改 TracePointExtractorService 的 prompt（它已经在提取 people）
- 不改 Memory 系统（人物实体不是记忆，不参与衰减）
- 不改 RelationshipState（那是小晴与用户的关系，不是用户社交网络）
- 不做 LLM 自动分类 relation（MVP 先默认 "other"，用户手动改）
- 不做前端（本阶段只出 API）

### 产出
- 1 个 migration
- 3 个文件：types.ts / service.ts / controller.ts
- 1 个 module.ts
- PostTurnPipeline 加一行调用
- LifeRecordModule 注册新 provider

---

## Phase 2: 关系分类与认知生成

### 目标
让小晴能自动判断人物关系类型，并为每个人生成认知描述。

### 触发条件
- Phase 1 上线后，SocialEntity 数据积累到一定量（比如 5+ 个实体）
- 前端球状图已可用，用户有实际使用反馈

### 新增内容

**1. LLM 关系分类器**

新增 `SocialEntityClassifierService`，在以下时机触发：
- 新 SocialEntity 创建时（mentionCount 达到阈值，如 3 次后触发分类）
- 定时任务（每天一次，处理未分类实体）

输入：该人物相关的所有 TracePoint.content + 上下文
输出：relation 分类 + description 生成

```typescript
interface ClassificationResult {
  relation: 'family' | 'friend' | 'colleague' | 'romantic' | 'pet' | 'other';
  description: string;      // 一句话认知，如"用户的妈妈，经常关心用户的饮食和健康"
  confidence: number;
  aliasHints: string[];     // LLM 发现的可能别名
}
```

**2. 别名自动合并**

在分类时，LLM 可能发现"我妈"和"妈妈"是同一人。
`SocialEntityService.autoMerge()` 根据 aliasHints 自动合并，但高置信度才执行（>0.8）。

**3. 认知注入（可选）**

在 `TurnContextAssembler` 中，当用户提到某人时，注入该人的 SocialEntity.description 作为上下文。
条件：当前消息中出现已知人物名字/别名 → 注入最多 3 个相关实体的 description。

### 复用的现有能力
- `LlmService.generate()` 做分类
- `PostTurnPipeline` 或 `Plan` 调度触发定时任务
- `TurnContextAssembler` 的现有注入模式（和 Memory/IdentityAnchor 注入同级）

### 不做的事
- 不建 edge 表（人与人之间的关系）
- 不做关系质量评估
- 不做情感变化追踪

---

## Phase 3: 关系动态与边

### 目标
从"用户认识谁"升级到"这些关系的质量和变化"。

### 触发条件
- Phase 2 稳定运行
- 用户确实会在对话中表达关系变化（吵架、和好、疏远、亲近）
- 前端需要展示关系质量/变化趋势

### 新增内容

**1. Prisma model: `SocialRelationEdge`**

```prisma
model SocialRelationEdge {
  id             String   @id @default(uuid())
  fromEntityId   String           // 通常是用户（隐含）
  toEntityId     String           // SocialEntity.id
  relationType   String           // 关系类型细分
  quality        Float   @default(0.5) // 0-1 关系质量
  trend          String  @default("stable") // improving | stable | declining
  lastEventAt    DateTime
  notes          String? @db.Text
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  toEntity       SocialEntity @relation(fields: [toEntityId], references: [id])

  @@unique([fromEntityId, toEntityId])
}
```

这时才需要 edge，因为要追踪关系质量和变化趋势。
`fromEntityId` 在 MVP 阶段始终是用户（单用户系统），但预留字段方便未来扩展到"人与人"。

**2. 关系事件提取**

扩展 TracePointExtractorService 的 prompt，增加关系事件识别：
- "跟妈妈吵架了" → 关系事件，quality 下降
- "和小李一起加班到很晚" → 关系事件，关系加深

新增 TracePointKind: `'relation_event'`

**3. 关系质量追踪**

新增 `SocialRelationTrackerService`：
- 监听 `relation_event` 类型的 TracePoint
- 更新对应 edge 的 quality 和 trend
- 使用滑动窗口（最近 N 条事件）计算趋势

### 复用
- TracePoint 提取链路（只改 prompt）
- PostTurnPipeline 的异步处理模式
- CognitiveObservation 的观测模式（可为关系变化发 observation）

---

## Phase 4: 社会洞察与认知闭环

### 目标
小晴能从关系模式中产生洞察，并主动在对话中体现对用户社会世界的理解。

### 新增内容

**1. `SocialInsight` — L3 洞察**

复用 CognitiveInsight 的模式（L2 聚合 → L3 演化）：

```typescript
interface SocialInsight {
  id: string;
  scope: 'weekly' | 'monthly';
  content: string;          // "用户最近和妈妈的互动明显增多，可能在经历某种家庭决策"
  relatedEntityIds: string[];
  confidence: number;
  createdAt: Date;
}
```

由定时任务生成（weekly），输入 = 最近的 SocialEntity 变化 + SocialRelationEdge 趋势 + 相关 TracePoint。

**2. 认知管线集成**

在 CognitivePipelineService 的 situation recognition 阶段，增加社会关系感知：
- 识别"用户正在谈论关系困扰" → situationKind 可扩展
- 在 responseStrategy 中考虑关系上下文

**3. 主动关怀**

当某个关系的 trend 持续 declining 且用户未主动提及时，
小晴可在合适时机轻触："最近好像没怎么提到 XX，还好吗？"
这通过 Plan 调度系统触发，走 `dispatchType: 'notify'`。

### 复用
- CognitiveInsight 的 scope/aggregation 模式
- CognitivePipelineService 的 situation 扩展点
- Plan 调度的 notify 能力
- BoundaryGovernanceService 确保不越界

---

## 与现有模块的关系图

```
线 A (社会关系):

  TracePoint.people[]
        |
        v
  A1: [ SocialEntityService ] ──> SocialEntity 表 ──> GET /api/social-entities
        |                                                   (前端球状图)
        v
  A2: [ ClassifierService ] (LLM 分类 + 别名合并)
        |
        v
  A3: [ SocialRelationEdge ] (关系质量追踪) ◄─── B2 SessionReflection 事件
        |
        v
  A4: [ SocialInsight ] (关系洞察)
        |
        └──────────────────────┐
                               v
线 B (小晴与用户):          TurnContextAssembler (统一注入)
                               ^
  RelationshipState ──┐        |
  Claim rr.*      ────┤        |
                      v        |
  B1: [ RelationshipOverview ] ──> GET /api/relationship/overview
                                        (前端关系画像)
  PostTurnPipeline
        |
        v
  B2: [ SessionReflection ] ──> rhythmNote ──> Claim rr.* (回流)
        |                   ──> relationImpact ──> A3 事件源
        v
  B3: [ SharedExperience ] ──> GET /api/shared-experiences
        |                          (前端时间线)
        v
  B4: 关系召回 ──> TurnContextAssembler
```

与现有模块的边界：

| 现有模块 | 与线 A 的关系 | 与线 B 的关系 |
|----------|-------------|-------------|
| TracePoint | 数据源：只读消费 people 字段 | 间接：B2 读取对话内容，不读 TracePoint |
| Memory | 平级独立：SocialEntity 不参与衰减 | 平级独立：SharedExperience 不参与衰减 |
| RelationshipState | 完全独立：那是小晴与用户关系 | 数据源：B1 聚合展示，B2 产出可影响其更新 |
| CognitiveProfile | 平级独立 | 不直接关联 |
| ClaimEngine `rr.*` | 不直接关联 | 双向：B1 读取展示，B2 回写新观测 |
| RhythmContext | 不直接关联 | 运行时消费者：B 不改其决策逻辑 |
| Memory `RHYTHM_PATTERN` | 不直接关联 | 平级：B2 的 rhythmNote 是新的观测渠道 |
| CognitivePipeline | A4 在此扩展 situation | B2 读取 turnState，不改 pipeline |
| PostTurnPipeline | A1 在此触发同步 | B2 在此触发 session reflection |
| TurnContextAssembler | A2+ 注入人物认知 | B4 注入共同经历和节奏观察 |
| BoundaryGovernance | A4 主动关怀需边界检查 | B4 召回需边界检查 |

---

## 前端数据契约

### 球状图（线 A，Phase 1 即可支撑）

```typescript
// GET /api/social-entities 返回
interface SocialEntityDto {
  id: string;
  name: string;
  aliases: string[];
  relation: string;         // 球状图分组/颜色
  description: string | null;
  mentionCount: number;     // 球状图节点大小
  lastSeenAt: string;       // 球状图节点透明度（越久越淡）
  firstSeenAt: string;
  tags: string[];
}
```

前端拿到这个列表就能渲染：
- 节点 = 实体
- 节点大小 = mentionCount
- 节点颜色 = relation 分组
- 节点位置 = force-graph 自动布局（与用户节点的距离可基于 lastSeenAt 计算）
- Phase 3 加入 edge 后，线条 = SocialRelationEdge，线条粗细 = quality
- 球状图中心有一个特殊的"小晴"节点，链接到 B1 的关系画像

### 关系画像（线 B，Phase B1 即可支撑）

```typescript
// GET /api/relationship/overview 返回
interface RelationshipOverviewDto {
  stage: 'early' | 'familiar' | 'steady';
  trustScore: number;
  closenessScore: number;
  rhythmPreferences: {
    key: string;
    level: string;
    source: string;
  }[];
  milestones: {
    label: string;
    date: string;
    type: 'stage_change' | 'shared_experience' | 'rhythm_shift';
  }[];
  summary: string;
}
```

### 共同经历时间线（线 B，Phase B3 支撑）

```typescript
// GET /api/shared-experiences 返回
interface SharedExperienceDto {
  id: string;
  title: string;
  summary: string;
  category: string;
  emotionalTone: string | null;
  significance: number;
  happenedAt: string;
  relatedEntities: { id: string; name: string }[]; // 关联的 SocialEntity
}
```

---

## Phase 1 实施步骤（确认后执行）

1. **新增 Prisma migration**：添加 `SocialEntity` model
2. **新增 `social-entity.types.ts`**：SocialEntityDraft / SocialEntityRecord / SocialEntityQuery
3. **新增 `social-entity.service.ts`**：syncFromTracePoints / list / merge / update
4. **新增 `social-entity.controller.ts`**：REST 端点
5. **新增 `social-entity.module.ts`**：注册到 LifeRecordModule
6. **集成 PostTurnPipeline**：TracePoint 提取后触发 sync

### 补充：Phase 1 小改进

- **增量同步**：`syncFromTracePoints` 不做全量扫描，只处理本轮新产生的 TracePoint（传入 `tracePointIds` 而非 `since`）
- **反向引用**：在 TracePoint 上加可选的 `resolvedEntityId`，sync 时回填，方便 Phase 2 的分类器快速找到相关 TracePoint
- **aliases GIN index**：`SocialEntity.aliases` 加 GIN index，避免 `ANY(aliases)` 查询随实体增长变慢

---

---

# 线 B：小晴与用户的关系深化

> 线 B 聚焦"小晴与用户之间"的关系，而非用户社会世界中的第三方。
> 复用现有 RelationshipState / RhythmContext / Claim `rr.*`，不重建这些能力。

---

## Phase B1: 关系可见化 — API + 节奏偏好聚合

### 目标
将小晴对"我们的关系"的内部认知，开放为用户可感知的关系画像。

### 为什么需要
- `RelationshipState` 已有 stage / trustScore / closenessScore，但完全是内部状态，用户看不到
- Claim `rr.*` 已积累了用户的节奏偏好，但分散在 claim 系统中，没有统一视图
- 前端的球状图中应该有"小晴"作为一个特殊节点，展示与用户的关系

### 新增内容

**1. DTO: `RelationshipOverviewDto`**

```typescript
interface RelationshipOverviewDto {
  stage: 'early' | 'familiar' | 'steady';
  trustScore: number;
  closenessScore: number;
  rhythmPreferences: {
    key: string;        // 如 'prefer_short_reply'
    level: string;      // 'low' | 'medium' | 'high'
    source: string;     // '从你多次说"简短一点"观察到'
  }[];
  milestones: {
    label: string;      // 如 '第一次深夜陪伴'
    date: string;
    type: 'stage_change' | 'shared_experience' | 'rhythm_shift';
  }[];
  summary: string;      // 小晴对关系的一句话描述
}
```

**2. Controller: `RelationshipOverviewController`**

| 端点 | 说明 |
|------|------|
| `GET /api/relationship/overview` | 聚合 RelationshipState + Claim `rr.*` + 里程碑 |

**3. 聚合逻辑**

- 从 `RelationshipState`（confirmed & active）取 stage / scores
- 从 `UserClaim` 中筛选 `rr.*` 前缀的 claims，映射为 rhythmPreferences
- milestones 初始为空数组，Phase B2/B3 产出后自动填充

### 复用
- `RelationshipState` 现有数据（`cognitive-growth.service.ts` 已在维护）
- `ClaimEngine` 的 `rr.*` claims
- `CognitiveGrowthService.checkStagePromotion()` 的阶段晋升逻辑

### 不做的事
- 不改 RelationshipState 的写入逻辑
- 不改 CognitivePipeline 的 rhythm 决策
- 不新建 Prisma model（纯聚合 + DTO）

---

## Phase B2: Session Reflection — 对话的关系意义

### 目标
每次有意义的对话结束后，小晴对"这次对话对我们关系意味着什么"做一次简短回顾。

### 为什么需要
- 当前 PostTurnPipeline 提取了事实碎片（TracePoint），但没有"关系意义"维度
- RelationshipState 的 trust/closeness 更新是公式化的（`+0.01` / `+0.03`），缺少语义解释
- 线 A Phase 3 的"关系事件"需要一个更丰富的事件源

### 触发条件
- Phase B1 完成后
- 对话有一定深度（如 ≥ 4 轮、或 CognitiveTurnState.userState.fragility !== 'low'、或 situation 是 emotional_expression / co_thinking）

### 新增内容

**1. Prisma model: `SessionReflection`**

```prisma
model SessionReflection {
  id               String   @id @default(uuid())
  conversationId   String
  summary          String   @db.Text   // "这次对话中用户主动分享了工作压力，信任感有提升"
  relationImpact   String   @default("neutral")  // deepened | neutral | strained | repaired
  rhythmNote       String?  @db.Text   // "用户今天偏好简短回应，可能比较疲惫"
  sharedMoment     Boolean  @default(false)  // 是否构成 shared experience 候选
  momentHint       String?  @db.Text   // 如果 sharedMoment=true，简述这个共同经历
  trustDelta       Float    @default(0)
  closenessDelta   Float    @default(0)
  createdAt        DateTime @default(now())

  conversation     Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([createdAt])
  @@index([sharedMoment])
}
```

设计说明：
- `relationImpact` 是定性判断，比 trustDelta 数值更有表达力
- `rhythmNote` 捕捉本次对话中观察到的节奏信号，可回流到 Claim `rr.*` 或 Memory `RHYTHM_PATTERN`
- `sharedMoment + momentHint` 是 Phase B3 SharedExperience 的候选池，降低 B3 的实现成本

**2. Service: `SessionReflectionService`**

放在 `backend/src/assistant/cognitive-pipeline/session-reflection/`，与 CognitivePipeline 同域。

核心方法：

| 方法 | 说明 |
|------|------|
| `reflect(conversationId, turnState, recentMessages)` | 调 LLM 生成本次对话的关系回顾 |
| `list(options?)` | 返回回顾列表，支持按 relationImpact 过滤 |
| `getSharedMomentCandidates(since?)` | 返回 sharedMoment=true 的候选（供 Phase B3 消费） |

`reflect()` 的 LLM prompt 输入：
- 本次对话的最近 N 条消息（摘要）
- 当前 RelationshipState（stage / scores）
- 当前 RhythmContext（本轮的 pacing / initiative）
- 已有的 rhythmPreferences（Claim `rr.*`）

LLM 输出：
```typescript
interface ReflectionResult {
  summary: string;
  relationImpact: 'deepened' | 'neutral' | 'strained' | 'repaired';
  rhythmNote: string | null;
  sharedMoment: boolean;
  momentHint: string | null;
  trustDelta: number;      // -0.1 ~ +0.1
  closenessDelta: number;  // -0.1 ~ +0.1
  newRhythmSignal?: {      // 如果发现新的节奏偏好
    claimKey: string;       // 如 'rr.prefer_short_reply'
    evidence: string;       // "用户三次要求简短回答"
  };
}
```

**3. 集成点**

- 在 `PostTurnPipeline.runAfterReturn()` 中，TracePoint 提取之后调用 `reflect()`
- 条件触发：只在对话有一定深度时触发（避免每轮都调 LLM）
- `newRhythmSignal` 如果存在，通过 ClaimEngine 写入/更新对应 claim
- `trustDelta / closenessDelta` 可选择性地影响 RelationshipState 更新（替代现有的公式化 delta）

### 与关系节奏的交互

```
对话进行中:
  RhythmContext (每轮) → 决定本轮 pacing / initiative
  Claim rr.* (长期) → 影响 RhythmContext 的决策

对话结束后:
  SessionReflection → rhythmNote → 发现新的节奏信号
                    → newRhythmSignal → 回写 Claim rr.*
                    → 下次对话时 RhythmContext 读取更新后的 claims
```

这形成了一个节奏认知的闭环：运行时决策 → 对话后反思 → 更新偏好 → 下次运行时。

### 不做的事
- 不改 CognitivePipeline 的实时 rhythm 决策逻辑
- 不改 CognitiveGrowthService 的 writeRelationshipState（B2 是补充观测，不替代）
- 不做前端展示（B2 数据通过 B1 的 milestones 间接呈现）

---

## Phase B3: Shared Experience — 共同经历

### 目标
建模小晴与用户的共同经历，让关系有"记忆基础"。

### 为什么需要
- 关系不只是数值（trust 0.7, closeness 0.6），还需要具体的"我们一起经历过什么"
- 前端可以呈现"我们的时间线"，比球状图更有情感价值
- 对话中可以主动召回："上次你也遇到类似的情况，我们聊了很久你后来想通了"

### 触发条件
- Phase B2 运行稳定，SessionReflection 中有一定量的 sharedMoment=true 候选

### 新增内容

**1. Prisma model: `SharedExperience`**

```prisma
model SharedExperience {
  id               String   @id @default(uuid())
  title            String             // "深夜陪伴面试焦虑"
  summary          String   @db.Text  // 一段简短的叙事："那天晚上你说压力很大..."
  category         String   @default("emotional_support")
                                      // emotional_support | co_thinking | celebration
                                      // | crisis | milestone | daily_ritual
  emotionalTone    String?            // warm | bittersweet | proud | relieved
  significance     Float    @default(0.5) // 0-1 这段经历对关系的重要程度
  happenedAt       DateTime           // 经历发生的时间
  conversationIds  String[]           // 关联的对话 ID（可能跨多次对话）
  relatedEntityIds String[] @default([]) // 涉及的 SocialEntity（线 A 交汇点）
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([category])
  @@index([happenedAt])
  @@index([significance])
}
```

设计说明：
- `conversationIds` 而非单个 FK——一段共同经历可能跨越多次对话（如"连续三天陪你准备面试"）
- `relatedEntityIds` 是线 A 的交汇点——共同经历可能涉及第三方（如"陪你分析和妈妈的矛盾"）
- `significance` 用于召回排序：重要经历优先浮现

**2. Service: `SharedExperienceService`**

放在 `backend/src/assistant/cognitive-pipeline/shared-experience/`。

核心方法：

| 方法 | 说明 |
|------|------|
| `promoteFromReflections(since?)` | 从 SessionReflection（sharedMoment=true）中提炼 SharedExperience |
| `list(options?)` | 返回共同经历列表，支持按 category / significance 过滤 |
| `findRelevant(context: string, limit?)` | 根据当前对话上下文，找最相关的共同经历（用于召回） |
| `merge(sourceId, targetId)` | 合并跨对话的同一段经历 |

`promoteFromReflections` 的逻辑：
1. 取 `since` 之后 sharedMoment=true 且未被 promote 过的 SessionReflection
2. 对每个候选，LLM 生成 title / summary / category / emotionalTone / significance
3. 检查是否属于已有 SharedExperience 的延续（如连续几天的面试陪伴）
4. 是 → 更新已有记录（追加 conversationId，更新 summary）
5. 否 → 创建新 SharedExperience

触发方式：定时任务（每天一次）或 Plan 调度。

**3. Controller: `SharedExperienceController`**

| 端点 | 说明 |
|------|------|
| `GET /api/shared-experiences` | 返回共同经历列表（前端时间线数据源） |
| `GET /api/shared-experiences/relevant?context=...` | 根据上下文找相关经历（对话中召回用） |

### 复用
- Phase B2 的 `SessionReflection.sharedMoment` 作为候选池
- `LlmService.generate()` 做提炼
- Plan 调度系统触发定时 promote
- 线 A 的 `SocialEntity` 做 relatedEntityIds 关联

### 不做的事
- 不做自动召回注入（留给 Phase B4）
- 不改 Memory 系统（SharedExperience 是独立维度，不参与衰减）

---

## Phase B4: 关系召回 — 对话中体现关系理解

### 目标
小晴在对话中能自然地引用共同经历和关系节奏，让用户感受到"她记得我们一起经历过的事"。

### 触发条件
- Phase B3 稳定运行，SharedExperience 有一定量的数据
- Phase A2 的认知注入模式已验证可用

### 新增内容

**1. TurnContextAssembler 扩展**

在现有的上下文注入流程中（与 Memory / IdentityAnchor / SocialEntity description 同级），增加：

- **SharedExperience 注入**：当前对话与某段共同经历语义相关时，注入该经历的 summary
  - 触发条件：`SharedExperienceService.findRelevant()` 返回 significance > 0.6 的结果
  - 注入量：最多 2 条
  - 格式：`[共同经历] {title}: {summary}`

- **关系节奏提醒**：从 SessionReflection 的 rhythmNote 中提取最近的节奏观察
  - 触发条件：最近 3 次 SessionReflection 中有 rhythmNote
  - 格式：`[节奏观察] {rhythmNote}`

**2. 主动关怀（与线 A Phase 4 合并）**

当某段 SharedExperience 的"后续"应该被关注时（如"陪你准备面试"→ 面试应该已经结束了），
小晴可主动提及："面试应该已经过了吧，怎么样？"

通过 Plan 调度系统触发，走 `dispatchType: 'notify'`。

### 复用
- `TurnContextAssembler` 的现有注入模式
- `SharedExperienceService.findRelevant()` 的语义匹配
- Plan 调度的 notify 能力
- BoundaryGovernanceService 确保不越界

---

## 两条线的交汇

```
线 A (社会关系)                    线 B (小晴与用户关系)

A1 SocialEntity                    B1 RelationshipOverview API
     |                                  |
A2 Classification                  B2 SessionReflection
     |                              ╱       ╲
A3 SocialRelationEdge ←──────── 关系事件源    rhythmNote → Claim rr.*
     |                              ╲       ╱
A4 SocialInsight                   B3 SharedExperience
     |                                  |
     └──── 统一注入 ──→ TurnContextAssembler ←── B4 关系召回
```

交汇点：
1. **B2 → A3**：SessionReflection 的 relationImpact 可作为 SocialRelationEdge 的事件源之一
2. **B3 ↔ A1**：SharedExperience.relatedEntityIds 关联 SocialEntity（"陪你分析和妈妈的矛盾"→ 妈妈实体）
3. **A4 + B4 → TurnContextAssembler**：社会洞察和共同经历统一作为对话上下文注入
4. **B2 → Claim rr.***：Session Reflection 发现的节奏信号回流到 ClaimEngine

---

## 建议执行顺序

两条线可以并行推进，但有自然的依赖关系：

```
Phase 1 (A1 SocialEntity)  ←── 先做，数据立刻可用
     ↓
Phase 2 并行:
  A2 (分类与认知)
  B1 (关系可见化)           ←── 不依赖 A，可同时做
     ↓
Phase 3 并行:
  A3 (关系动态)
  B2 (Session Reflection)   ←── B2 产出的事件可供 A3 消费
     ↓
Phase 4 并行:
  A4 (社会洞察)
  B3 (Shared Experience)    ←── 消费 B2 的 sharedMoment 候选
     ↓
Phase 5 (汇合):
  B4 (关系召回) + A4/B3 统一注入 TurnContextAssembler
```

MVP 优先级：**A1 → B1 → B2 → A2**（先让数据流转起来，再做 LLM 分类和深度分析）
