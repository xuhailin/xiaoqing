# Trace Points - Life Record System Plan

> 持续从对话中采集结构化的「生活碎片」，作为未来时间线、日记摘要、洞察分析的数据基础。

---

## Phase 1 - MVP: Store Points [已完成]

**目标**：能跑、能存、能查。3 天后回头看，存下来的碎片有意义。

### 已完成

- [x] `TracePoint` Prisma model（schema + db push）
- [x] 目录重构：`assistant/life-record/` 统一容纳 `daily-moment/` + `trace-point/`
- [x] `TracePointService` — 存储 & 查询
- [x] `TracePointExtractorService` — LLM 批量提取 + 回填
- [x] `TracePointController` — REST API（全局查询 / 按会话查询 / 手动提取 / 回填）
- [x] `trace-point-backfill.cli.ts` — 独立 CLI 脚本
- [x] `LifeRecordModule` — 统一 module 接入 ConversationModule
- [x] npm script `trace-point:backfill`
- [x] 首次回填验证通过（5 会话，12 碎片）
- [x] prompt 调优：修复同消息多角度拆分 + 小晴误入 people

### 验证结果

> 回填 3 天数据，12 个碎片：
> - 大部分碎片真实有意义
> - 跨消息语义重复存在（预期，Phase 2 处理）
> - 无离谱错误提取

---

## Phase 2 - Structure & Organization [已完成]

**前提**：Phase 1 数据质量验证通过。

### 2.1 日分组与日摘要 [已完成]

- [x] `TracePointService.queryByDay()` — 按 `dayKey = date(happenedAt ?? createdAt)` 分组
- [x] `TracePointService.getPointsForDay()` — 获取某天所有碎片
- [x] `DailySummary` Prisma model（dayKey unique, title, body, moodOverall, sourcePointIds）
- [x] `DailySummaryGenerator` — LLM 从 TracePoints 生成日摘要
- [x] `DailySummaryService` — 生成/查询/批量生成
- [x] `DailySummaryController` — REST API
- [x] `DailySummaryModule` 接入 LifeRecordModule
- [x] 验证通过：3 天日摘要质量优于 DailyMoment（结构化碎片 → 连贯叙述）

### 验证结果

```
3/18 (8 points → frustrated):
  "今天我又忙到忘记吃晚饭...代码怎么改都不对...想每天中午12点被提醒去吃午饭"

3/16 (3 points → neutral):
  "今天我还惦记着昨天需要做工时上报的事。很快就要开线上会议了..."
```

### 2.2 DailyMoment 合并路径 [已完成]

```
旧管线（已退役）：
  Messages -> SnippetExtractor -> DailyMomentGenerator -> DailyMoment

新管线：
  Messages -> TracePointExtractor -> TracePoints
                                         |
                                 DailySummaryGenerator -> DailySummary
                                         |
                        （用户手动触发）DailyMomentService -> DailyMomentRecord
```

已完成的合并步骤：
- [x] DailyMomentService 改为消费 TracePoints + DailySummaryService，不再直接处理原始 messages
- [x] SnippetExtractor / TriggerEvaluator / DailyMomentGenerator 从 Module 退役（文件保留作参考）
- [x] DailyMomentModule 依赖 TracePointModule + DailySummaryModule
- [x] maybeSuggest() 简化为"今天有 >= 3 个 TracePoint 时建议" + Policy 限流
- [x] chat-completion.engine 和 orchestrator 调用方更新（移除 recentMessages 参数）
- [x] DailyMoment 表暂保留（backward compat），新生成内容来自 DailySummary

### 2.3 去重与合并 [已完成]

- [x] `TracePointService.deduplicateDay(dayKey)` — 同 kind + bigram 相似度 > 0.8 的碎片去重
- [x] 去重策略：保留 content 最长的一条，重复项标记 confidence=0（append-only 软删除）
- [x] `TracePointService.deduplicateRecent(days)` — 批量去重最近 N 天
- [x] REST API：`POST /trace-points/deduplicate/:dayKey` + `POST /trace-points/deduplicate-recent`

### 2.4 前端时间线视图 [未开始]

- 按天分组的碎片列表
- 每天可展开查看 TracePoint 详情
- 日摘要折叠在天标题下

---

## Phase 3 - Insight & Intelligence [远期/概念]

> 以下为方向性描述，不做详细设计。

- **情绪趋势**：按 mood 聚合，生成周/月情绪曲线
- **行为模式**：从 event+tags 发现周期性（每周五加班、周末运动）
- **因果追踪**：plan -> event 的闭合（"说了要体检" -> "后来提到体检结果"）
- **主动洞察**：小晴主动提及"你最近提到工作压力比较多"
- **与 UserClaim / CognitiveProfile 联动**：TracePoint 作为 claim 的证据来源

---

## 当前目录结构

```
backend/src/assistant/life-record/
├── life-record.module.ts
├── daily-moment/            ← 已合并到 TracePoint 管线
│   ├── daily-moment.module.ts       (依赖 TracePointModule + DailySummaryModule)
│   ├── daily-moment.service.ts      (消费 TracePoints 生成日记)
│   ├── daily-moment.types.ts
│   ├── daily-moment-policy.ts       (限流仍在使用)
│   ├── daily-moment-prisma.repository.ts
│   ├── daily-moment-generator.ts    (已退役，保留参考)
│   ├── daily-moment-snippet.extractor.ts  (已退役)
│   └── daily-moment-trigger.evaluator.ts  (已退役)
├── trace-point/             ← 核心数据层
│   ├── trace-point.module.ts
│   ├── trace-point.types.ts
│   ├── trace-point.service.ts       (含去重逻辑)
│   ├── trace-point-extractor.service.ts
│   ├── trace-point.controller.ts
│   └── trace-point-backfill.cli.ts
└── daily-summary/           ← 日摘要聚合层
    ├── daily-summary.module.ts
    ├── daily-summary.types.ts
    ├── daily-summary.service.ts
    ├── daily-summary-generator.ts
    └── daily-summary.controller.ts
```

## API 全览

### Trace Points

| Method | Path | 说明 |
|--------|------|------|
| GET | /trace-points | 全局查询（since/until/kind/limit） |
| GET | /trace-points/by-day | 按天分组查询 |
| GET | /trace-points/day/:dayKey | 某天的所有碎片 |
| GET | /trace-points/conversation/:id | 按会话查询 |
| GET | /trace-points/conversation/:id/count | 统计数量 |
| POST | /trace-points/extract/:id | 手动触发某会话提取 |
| POST | /trace-points/backfill | 手动触发回填 |
| POST | /trace-points/deduplicate/:dayKey | 对某天碎片去重 |
| POST | /trace-points/deduplicate-recent | 批量去重最近 N 天 |

### Daily Summaries

| Method | Path | 说明 |
|--------|------|------|
| GET | /daily-summaries | 日摘要列表（limit/since/until） |
| GET | /daily-summaries/:dayKey | 某天的日摘要 + 关联碎片 |
| POST | /daily-summaries/generate/:dayKey | 为某天生成/重新生成摘要 |
| POST | /daily-summaries/generate-recent | 批量生成最近 N 天摘要 |

---

## 架构决策记录

| 决策 | 理由 |
|------|------|
| 批量提取优先于实时 | 减少 post-turn 链路负担；批量上下文更完整；调优方便 |
| kind 用 String 不用 enum | 初期种类会调整，避免频繁 migration |
| TracePoint 是 append-only | 写入后不修改，错了标 confidence=0 或未来软删除 |
| 不新建 agent | 这是数据采集层，不需要决策能力，Service 足够 |
| life-record/ 统一目录 | TracePoint + DailyMoment + DailySummary 属于同一关注点 |
| DailySummary dayKey unique | 每天最多一条摘要，重新生成时覆盖 |
| DailyMoment 合并而非替换 | 保留 DailyMoment 表和用户触发逻辑，内容生成切换到 TracePoint 管线 |
| 去重用 confidence=0 软标记 | 保持 append-only 不删数据；查询时可过滤 |
| bigram 相似度而非 LLM 去重 | 简单高效，0.8 阈值足够识别同一事件的不同表述 |

---

## 风险

| 风险 | 缓解 |
|------|------|
| LLM 提取噪声多 | 预过滤 + 保守 prompt + confidence 字段 |
| 每轮多一次 LLM 调用的成本 | 当前用批量模式，不在 post-turn 调用；用最便宜模型 |
| happenedAt 时间推断不准 | 不强求，null 时退回 createdAt |
| 与 Memory/UserClaim 职责模糊 | 明确边界：TracePoint 记事件流，Memory 记事实，Claim 记模式 |
| DailyMoment 表与 DailySummary 共存 | 合并已完成，DailyMoment 内部消费 DailySummary；长期可考虑表迁移 |
