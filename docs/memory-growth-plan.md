# 记忆成长体系说明

> 目标：让小晴从「被动回忆」变成「自动积累、自动遗忘、自动成长」，真正越聊越懂你（本节描述当前已落地能力与整体闭环）。

排查「偏好为什么没展示」「重新总结是否生效」时，可配合查看：
[`docs/preference-evolution-trigger-guide.md`](preference-evolution-trigger-guide.md)。

---

## 现状总结

### 已完成（各模块独立可用）

| 模块 | 状态 | 说明 |
|------|------|------|
| 记忆分类（9 类） | ✅ | identity_anchor, shared_fact, commitment, correction, soft_preference, general, judgment_pattern, value_priority, rhythm_pattern |
| 记忆衰减公式 | ✅ | `2^(-daysSinceAccess / halfLife) + hitCount * hitBoost`，按分类不同半衰期 |
| WriteGuard 规则写入 | ✅ | WRITE / MERGE / OVERWRITE / SKIP，去重合并 |
| 记忆召回 + 注入 | ✅ | 两阶段（关键词候选 → 评分排序 → 预算裁剪） |
| 人格 7 字段 + 双池约束 | ✅ | 进化建议 → 违规校验 → 人工确认 → 版本化写入 |
| 印象管理（core/detail） | ✅ | 增量更新，注入 prompt |
| 手动总结 → 记忆提取 | ✅ | POST /conversations/:id/summarize |
| 总结自动触发 | ✅ | 阈值触发（AUTO_SUMMARIZE_THRESHOLD=15）+ 即时关键词触发；FEATURE_AUTO_SUMMARIZE 开关，ConversationService 内异步触发 |

### 核心缺口（自动化串联断裂）

| # | 缺口 | 影响 |
|---|------|------|
| 1 | ~~总结没有自动触发~~ | 已实现（见上） |
| 2 | 记忆没有晋升/降级（mid↔long） | "反复提到的事"不会越记越牢 |
| 3 | 衰减没有定时重算 | 衰减公式形同虚设 |
| 4 | 总结后不更新印象 | "整体感觉"跟不上 |
| 5 | 记忆积累不触发人格进化提议 | 人格和认知脱节 |
| 6 | 跨对话无关联 | 话题之间没有时间线串联 |
| 7 | Reading 模块只有 Schema | 读物无法丰富认知 |

---

## 能力分阶段演进概览

### Phase A：成长闭环基础（优先）

#### A1. 总结自动触发 ✅ 已完成
- **触发条件**：对话累计 N 条用户消息（默认 15）后自动运行 summarize；另支持即时关键词触发。
- **实现位置**：`ConversationService.sendMessage()` 内计数与异步触发；trace 步骤 `auto-summarize`。
- **配置**：环境变量 `AUTO_SUMMARIZE_THRESHOLD=15`，feature flag `FEATURE_AUTO_SUMMARIZE=true`（默认开启）。

#### A2. 衰减定时重算
- **实现**：通过 NestJS `@nestjs/schedule` 的 `@Cron('0 3 * * *')` 每天凌晨 3 点重算衰减分。
- **逻辑**：调用 `recalculateDecay()` + `getDecayCandidates()`，对低分记忆做软删候选，避免记忆无限堆积。

#### A3. 记忆晋升/降级
- **晋升规则**：mid 记忆 hitCount ≥ 5 且 age > 7 天时，进入「升级为 long」候选。
- **降级规则**：long 记忆 30 天未命中且非 frozen 时，候选降为 mid。
- **触发时机**：与衰减重算一并执行。
- **展示方式**：前端展示候选列表，由用户确认（或按策略自动执行）。

### Phase B：认知闭环

#### B1. 总结 → 印象更新
- summarize 完成后，额外调用 LLM 提取印象增量（delta）。
- 生成候选，由前端展示确认后写入 impressionCore/impressionDetail，使「整体印象」随对话演进更新。

#### B2. 记忆密度 → 人格进化提议
- 当某分类记忆累计超过一定阈值（如 > 5 条）时，自动调用 `suggestEvolution()` 生成进化建议。
- 仅生成候选，仍需用户在前端确认后才写入 Persona 进化池，遵守双池约束。

### Phase C：深度理解

#### C1. 跨对话话题关联
- 基于 category 与 keyword 构建简单话题关联图。
- 在记忆召回时优先拉取相关话题链，使跨对话的长期主题能够串联起来。

#### C2. Reading 摄入集成
- 补齐 ReadingService 与 ReadingController，并将读物解析结果写入 Reading 模块。
- 支持从 ReadingInsight 采纳到记忆/印象，丰富长期认知来源。

### Phase D：可观测

#### D1. Token 用量追踪
- 在 Message/Memory 维度记录 tokenCount，便于观测成本与上下文长度。

#### D2. 调试 Dashboard
- 前端提供可视化 Dashboard：包括当前活跃记忆、衰减曲线、人设版本 diff 等，方便调试与体验优化。

---

## 完成后的理想流程

```
用户发消息
  ↓
小晴回复（注入人格 + 记忆 + 印象）
  ↓
消息计数 +1
  ↓ 达到阈值？
  ↓ YES
异步总结 → 提取记忆（WriteGuard 过滤）
  ↓
记忆写入/合并
  ↓
印象更新提议 → 用户确认
  ↓
每日凌晨：衰减重算 + 晋升/降级
  ↓
记忆密度检查 → 人格进化提议 → 用户确认
  ↓
下次对话：更精准的记忆 + 更贴合的人格
```

---

## 状态追踪

| 任务 | 状态 | 完成日期 |
|------|------|----------|
| A1. 总结自动触发 | ✅ 完成 | 2026-03-03 |
| A2. 衰减定时重算 | ✅ 完成 | 2026-03-03 |
| A3. 记忆晋升/降级 | ✅ 完成 | 2026-03-03 |
| B1. 总结→印象更新 | ✅ 完成 | 2026-03-03 |
| B2. 记忆密度→进化提议 | ✅ 完成 | 2026-03-03 |
| C1. 跨对话话题关联 | ✅ 完成 | 2026-03-03 |
| C2. Reading 摄入集成 | ✅ 已有 | 2026-03-03 |
| D1. Token 用量追踪 | ✅ 完成 | 2026-03-03 |
| D2. 调试 Dashboard | ✅ 完成 | 2026-03-03 |
