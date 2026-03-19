## Life Record（人生轨迹）— TracePoint / DailySummary 架构设计说明

> 文档定位：从对话中沉淀“用户生活碎片”（TracePoint），并按天组织与聚合生成“日摘要”（DailySummary），提供可查询 API 与前端时间线视图。
>
> 代码对齐：本文以当前实现为准（`backend/src/assistant/life-record/**` + `frontend/src/app/life-trace/**`），并明确哪些属于后续拓展。

---

## 1. 背景与目标

Life Record 解决的问题是“把对话变成可回看的生活记录”，但不把它混入长期事实记忆（Memory）或 debug 数据（Trace）。

核心产物：

- **TracePoint**：结构化“生活碎片”（事件/情绪/人物/计划/反思）
- **DailySummary**：基于当天 TracePoints 的日摘要叙事（可重生成）
- **（兼容保留）DailyMoment**：今日日记表达产物（当前实现中已转为消费 TracePoint/DailySummary 的产物）

---

## 2. 数据模型（已落地）

### 2.1 Prisma：`TracePoint`

定义在 `backend/prisma/schema.prisma`：

- `kind: String`：`event | mood | mention | plan | reflection`
- `content: Text`：碎片内容
- `happenedAt?: DateTime`：事件发生时间（可空，空则用 `createdAt` 参与日分组）
- `mood?: String`、`people: String[]`、`tags: String[]`
- `extractedBy: String`：`batch | realtime | backfill`
- `confidence: Float`：去重时会将重复项标记为 `0`（append-only 软标记）

TypeScript 对齐：`backend/src/assistant/life-record/trace-point/trace-point.types.ts`

### 2.2 Prisma：`DailySummary`

同样定义在 `backend/prisma/schema.prisma`：

- `dayKey: String`（`YYYY-MM-DD`，unique）
- `title: String`
- `body: Text`
- `moodOverall?: String`
- `pointCount: Int`
- `sourcePointIds: String[]`
- `generatedBy: 'llm' | 'manual'`

---

## 3. 后端模块结构（已落地）

LifeRecord 统一目录：`backend/src/assistant/life-record/`

`LifeRecordModule` 负责聚合导出（`backend/src/assistant/life-record/life-record.module.ts`）：

- `trace-point/`：TracePoint 数据层 + 提取与去重
- `daily-summary/`：日摘要生成与查询
- `daily-moment/`：今日日记（现已改为消费 TracePoints/DailySummary 的产物）

---

## 4. TracePoint：保存、查询与去重（已落地）

### 4.1 查询与按天分组

控制器：`backend/src/assistant/life-record/trace-point/trace-point.controller.ts`

- `GET /trace-points`：跨会话全局查询（`since/until/kind/limit`）
- `GET /trace-points/conversation/:conversationId`：按会话查询
- `GET /trace-points/conversation/:conversationId/count`：会话统计
- `GET /trace-points/by-day`：按天分组（可选 `conversationId`）
- `GET /trace-points/day/:dayKey`：某天所有 points（按 `happenedAt` 或 `createdAt` 归属）

服务：`backend/src/assistant/life-record/trace-point/trace-point.service.ts`

- `queryByDay()`：分组 key 使用 `effectiveDate = happenedAt ?? createdAt`
- `getPointsForDay()`：同日范围内：`happenedAt` 命中或 `happenedAt=null 且 createdAt 命中`

### 4.2 去重策略（append-only）

`TracePointService.deduplicateDay(dayKey)`：

- 按 `kind` 分组
- 相似度：bigram Dice coefficient
- 阈值：`> 0.8`
- 保留策略：保留 `content` 最长的一条
- 重复项处理：`confidence = 0`（软标记，不删除）

API：

- `POST /trace-points/deduplicate/:dayKey`
- `POST /trace-points/deduplicate-recent`（默认 7 天）

---

## 5. DailySummary：生成与查询（已落地）

控制器：`backend/src/assistant/life-record/daily-summary/daily-summary.controller.ts`

- `GET /daily-summaries`：列表（`limit/since/until`）
- `GET /daily-summaries/:dayKey`：某天日摘要（含关联 TracePoints）
- `POST /daily-summaries/generate/:dayKey`：生成/重生成
- `POST /daily-summaries/generate-recent`：批量生成最近 N 天

---

## 6. 前端时间线（已落地）

前端入口：

- `frontend/src/app/life-trace/life-trace.component.ts`
- `frontend/src/app/life-trace/life-trace-board.component.ts`（points/day/week）
- `frontend/src/app/core/services/life-trace.service.ts`

当前 UI 能力（以代码为准）：

- 近 30 天拉取：
  - `/trace-points/by-day?since=...`
  - `/daily-summaries?since=...&limit=30`
- 支持选择某天并加载当天明细：
  - `/trace-points/day/:dayKey`
- 日摘要与轨迹碎片同时展示，并用 tags/people/mood 做轻量统计与周览主题。

> 说明：这意味着早期 plan 中“前端时间线未开始”的阶段性描述已过期；当前前端视图已经存在并可工作。

---

## 7. 与 Memory / CognitiveTrace 的边界

- **不等于 Memory**：TracePoint 记录“事件流”，不承担长期事实与偏好写入规则；与 Memory 的联动（如作为 Claim Evidence）属于后续增强方向。
- **不等于 CognitiveTrace**：LifeRecord 关注“用户发生了什么”，CognitiveTrace 关注“小晴做了什么/理解了什么”。两者通过 `relatedTracePointIds`（在 CognitiveObservation）预留关联，但自动关联策略未落地。

---

## 8. 后续演进方向（不代表当前已实现）

- **更强的结构化**：kind 细分、标签体系、人物消歧、计划->事件闭环等。
- **跨对话关联**：把长期主题串联为可导航的时间线（与 memory/claim 联动时要保持边界清晰）。
- **与 CognitiveTrace 的双向联动**：同回合/同日关联展示，帮助用户同时理解“发生了什么”与“小晴如何理解/响应”。
