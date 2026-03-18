# 小晴认知溯源 - 计划

> 透明呈现小晴的认知演进：她如何感知、记忆、决策与随时间适应。

---

## 动机

用户人生轨迹（PLAN-trace-points.md）记录的是**用户生活中发生的事**。小晴认知溯源记录的是**小晴内部发生的事**——她的感知变化、记忆操作、决策调整与人格演进。

通过透明化建立信任（「我能看到她记住了什么、为什么」），让小晴的成长可被看见，而不是模糊感受。

**核心定位**：认知溯源是一个**分析层**，不只是事件日志。它回答的是「小晴理解了什么、决定了什么、学到了什么」，而不是「发生了什么」。

---

## 架构：四层认知金字塔

```
+-------------------------------------------+
|  L3  认知进化（Cognitive Evolution）        |  <- 周/月级，驱动 Persona/策略调整
|      「我应该怎么改变」                      |
+-------------------------------------------+
|  L2  认知洞察（Cognitive Insight）          |  <- 日/周级，LLM 聚合分析
|      「我发现了什么规律」                    |
+-------------------------------------------+
|  L1  认知观测（Cognitive Observation）      |  <- 回合级，模块自动采集
|      「这一轮我做了什么」                    |
+-------------------------------------------+
|  L0  管线信号（Pipeline Signals）           |  <- 已存在：TurnTrace、CognitiveProfile、
|      原始管线输出                           |     RelationshipState、BoundaryEvent
+-------------------------------------------+
```

- **L0** 已存在，分散在 `CognitivePipelineService`、`TraceCollector`、`CognitiveGrowthService` 等模块中。
- **L1** 是本次核心建设：从 L0 信号中提取有意义的认知观测，写入数据库。
- **L2** 是聚合分析层：按日/周生成洞察叙事与模式发现。
- **L3** 是闭环层：洞察驱动行为变化（Persona 调整、策略默认值偏移等），需用户确认。

---

## 数据来源（L0，已存在）

| 来源 | 位置 | 采集内容 |
|------|------|----------|
| CognitiveTurnState | `cognitive-pipeline/` | 每回合：情境、用户情绪、需求模式、回应策略 |
| TraceStep / TurnTraceEvent | `infra/trace/` | 管线步骤耗时与状态 |
| Memory writes | `assistant/memory/` | 小晴写入新事实或偏好时 |
| Claim lifecycle | `assistant/claim/` | 用户主张状态晋升 |
| CognitiveProfile | `cognitive-pipeline/cognitive-growth` | 已确认的认知模式 |
| RelationshipState | `cognitive-pipeline/cognitive-growth` | 关系阶段变化 |
| BoundaryEvent | `cognitive-pipeline/cognitive-growth` | 安全/边界记录 |
| Persona 参数变化 | `assistant/persona/` | 风格偏移、自适应规则 |

要点：**L1 不需要新的抽取管线**。这些事件已在产生——我们通过每回合统一的 `TurnCognitiveResult` 收集即可。

---

## 数据模型

### L1：CognitiveObservation（认知观测）

每回合的认知观测，从管线信号中采集。

```prisma
model CognitiveObservation {
  id              String   @id @default(cuid())
  dimension       String   // 'perception' | 'decision' | 'memory' | 'expression' | 'growth'
  kind            String   // 具体类型，见下方 dimension-kind 表
  title           String   // 可读标题，如「记住了用户偏好结构化方案」
  detail          String?
  source          String   // 产出模块：'cognitive-pipeline' | 'memory' | 'persona' | ...
  conversationId  String?
  messageId       String?
  significance    Float    @default(0.5) // 0-1，用于噪音过滤
  happenedAt      DateTime @default(now())
  createdAt       DateTime @default(now())
  payload         Json?
  insightId       String?
  relatedTracePointIds String[]
}
```

**维度-类型（dimension-kind）表：**

| dimension | kind | 含义 | 来源模块 |
|-----------|------|------|----------|
| perception | situation_read | 识别出的情境类型 | CognitivePipeline |
| perception | emotion_detected | 检测到的用户情绪变化 | CognitivePipeline |
| perception | need_recognized | 识别的用户需求模式 | CognitivePipeline |
| decision | strategy_chosen | 选定的回应策略 | CognitivePipeline |
| decision | tool_policy_set | 决定调用/跳过工具 | ActionReasoner |
| decision | comfort_before_advice | 先安抚再建议的决策 | CognitivePipeline |
| memory | memory_written | 写入新记忆 | MemoryService |
| memory | memory_recalled | 召回相关记忆 | MemoryService |
| memory | claim_promoted | 主张状态晋升 | UserClaimService |
| memory | anchor_updated | 身份锚点更新 | IdentityAnchorService |
| expression | style_shifted | 表达风格调整 | Persona |
| expression | depth_adjusted | 回复深度调整 | CognitivePipeline |
| growth | profile_confirmed | 认知画像确认 | CognitiveGrowth |
| growth | stage_promoted | 关系阶段晋升 | CognitiveGrowth |
| growth | boundary_noted | 边界事件记录 | CognitiveGrowth |

### L2：CognitiveInsight（认知洞察）

由 LLM 生成的日/周级聚合洞察。

```prisma
model CognitiveInsight {
  id               String   @id @default(cuid())
  scope            String   // 'daily' | 'weekly' | 'monthly'
  periodKey        String   // '2026-03-18' | '2026-W12' | '2026-03'
  dimension        String?  // 聚焦维度，null 表示综合
  title            String   // 如「本周我学会了在用户压力大时先倾听」
  narrative        String   // LLM 生成的叙事
  patterns         Json?    // [{pattern, frequency, trend}]
  metrics          Json?    // {memoryWrites: 12, strategyShifts: 3, ...}
  observationCount Int
  status           String   @default("generated") // 'generated' | 'reviewed' | 'acted_upon'
  createdAt        DateTime @default(now())
}
```

### L3：CognitiveEvolution（认知进化）

由洞察驱动的进化提议，需用户确认后生效。

```prisma
model CognitiveEvolution {
  id               String    @id @default(cuid())
  title            String    // 如「开始主动在晚间对话中降低信息密度」
  description      String
  evolutionType    String    // 'persona_drift' | 'strategy_default_shift' | 'memory_priority_change' | 'capability_expansion'
  triggerInsightId String?
  changeDiff       Json      // {field, before, after}
  status           String    @default("proposed") // 'proposed' | 'applied' | 'reverted'
  appliedAt        DateTime?
  createdAt        DateTime  @default(now())
}
```

---

## 数据流

```
回合执行（同步）                              回合后（异步，fire-and-forget）
+------------------------+                    +------------------------------+
| CognitivePipeline      |--+                 | PostTurnPipeline             |
| ActionReasoner         |  |                 |   record_cognitive_observation
| ChatCompletionRunner   |  | TurnCog         |        |                    |
| MemoryService          |--+--Result-------->|        v                    |
| CognitiveGrowth        |                    | ObservationEmitterService    |
+------------------------+                    |   .emit(turnCogResult)      |
                                              |        |                    |
                                              |        v                    |
                                              | CognitiveObservation[] (DB) |
                                              +------------------------------+

定时任务
+------------------------------------------+
| 每日 23:50                               |
|   InsightGenerator.generateDaily()       |
|     -> 查询当日观测                       |
|     -> 按维度分组、统计                   |
|     -> LLM 生成日度叙事                   |
|     -> 写入 CognitiveInsight (daily)      |
|                                          |
| 每周一 02:00                             |
|   InsightGenerator.generateWeekly()      |
|     -> 聚合当周日度洞察                   |
|     -> 与上周对比                         |
|     -> LLM 生成周度叙事                   |
|     -> 写入 CognitiveInsight (weekly)     |
|     -> 若建议进化 -> CognitiveEvolution (proposed) |
+------------------------------------------+
```

---

## 实施阶段

### 阶段 0（P0）- 观测管线 [当前]

**目标**：从现有管线信号采集 L1 观测并写入 DB。

- [x] 用四层架构更新计划
- [ ] Prisma 模型：`CognitiveObservation`、`CognitiveInsight`、`CognitiveEvolution`
- [ ] `TurnCognitiveResult` 类型定义
- [ ] `cognitive-trace` NestJS 模块结构
- [ ] `ObservationService` —— CRUD、查询、按日分组
- [ ] `ObservationEmitterService` —— 将 `TurnCognitiveResult` 转为观测并做显著性过滤
- [ ] 接入 `PostTurnPipeline` 的 `record_cognitive_observation` 任务
- [ ] `ObservationController` —— REST API

### 阶段 1（P1）- 前端观测视图

**目标**：在小晴页签中展示认知观测。

- [ ] 前端 `CognitiveTraceService` —— 调用观测 API
- [ ] 小晴页签接入实时观测数据
- [ ] 按日分组视图，复用人生轨迹卡片布局
- [ ] 每条观测卡片支持「为什么是这样？」展开说明

### 阶段 2（P2）- 洞察生成

**目标**：日/周级由 LLM 生成认知洞察。

- [ ] `InsightGeneratorService` —— 日/周叙事的 LLM 提示与生成
- [ ] `InsightSchedulerService` —— 定时触发
- [ ] `InsightService` —— CRUD、查询
- [ ] `InsightController` —— REST API
- [ ] 前端周度洞察视图

### 阶段 3（P3）- 进化闭环

**目标**：闭环——洞察驱动行为变化。

- [ ] `EvolutionService` —— 提议、应用、回滚
- [ ] `EvolutionController` —— REST API，含用户确认
- [ ] 集成：将进化应用到 Persona / CognitivePipeline 默认值
- [ ] 前端进化提议 UI

### 阶段 4（P4）- 跨链关联

**目标**：用户人生轨迹与小晴认知溯源双向关联。

- [ ] 同一回合的观测与 TracePoint 自动关联
- [ ] UI：点击用户轨迹点可查看相关认知观测
- [ ] 两条轨迹统一的时间线视图

---

## 模块结构

```
backend/src/assistant/cognitive-trace/
  cognitive-trace.module.ts
  cognitive-trace.types.ts              // TurnCognitiveResult、dimensions、kinds

  observation/
    observation.service.ts              // CRUD、查询
    observation-emitter.service.ts      // TurnCogResult -> Observations
    observation.controller.ts          // REST API

  insight/
    insight.service.ts                  // CRUD、查询
    insight-generator.service.ts        // LLM 聚合
    insight-scheduler.service.ts        // 定时触发
    insight.controller.ts               // REST API

  evolution/
    evolution.service.ts                // 提议 / 应用 / 回滚
    evolution.controller.ts             // REST API
```

---

## API 设计

```
GET  /cognitive-trace/observations           ?dimension=&kind=&from=&to=&minSignificance=
GET  /cognitive-trace/observations/by-day     ?from=&to=
GET  /cognitive-trace/insights                ?scope=daily|weekly&from=&to=
GET  /cognitive-trace/insights/:id
GET  /cognitive-trace/evolutions              ?status=proposed|applied
POST /cognitive-trace/evolutions/:id/apply
POST /cognitive-trace/evolutions/:id/revert

POST /cognitive-trace/insights/generate-daily   ?dayKey=2026-03-18
POST /cognitive-trace/insights/generate-weekly  ?weekKey=2026-W12
```

---

## 架构决策

| 决策 | 理由 |
|------|------|
| 四层金字塔而非扁平事件流 | 认知溯源是分析而非日志；不同层服务不同时间尺度 |
| 与 TracePoint 分离 | 数据主体不同（小晴 vs 用户），生命周期不同 |
| 统一 TurnCognitiveResult，不按模块各自上报 | 单点收集避免分散的 emit 逻辑，保证一致性 |
| 基于显著性过滤 | 多数回合是常规；只持久化有意义的观测（目标约 3–8 条/天） |
| 进化需用户确认 | 行为变化必须透明且可回滚 |
| P0 不新增 LLM 调用 | 只采集现有模块已计算的内容 |
| 复用 PostTurnPipeline 异步机制 | 不影响对话延迟 |

---

## 与现有系统的关系

- **不替代** `CognitiveProfile` / `RelationshipState` —— 它们是已确认的稳定认知；观测是每回合快照。
- **不替代** `TurnTraceEvent` / `TraceStep` —— 后者是调试可观测性；观测是面向用户的认知透明。
- **复用** `PostTurnPipeline` 的回合后机制做异步写入。
- **复用** `CognitivePipelineService.analyzeTurn()` 输出作为 L0 信号来源。

---

## 风险与应对

| 风险 | 应对 |
|------|------|
| 低价值观测过多 | 显著性阈值（>= 0.3）；目标 3–8 条/天 |
| 上报性能 | PostTurnPipeline 内异步 fire-and-forget，批量写 DB |
| 用户混淆两条轨迹 | 明确视觉区分；不同页签/区块 |
| 隐私顾虑 | 定位为透明能力；用户控制可见范围 |
| 进化反馈环不稳定 | 必须用户确认；仅做小幅增量变更 |
