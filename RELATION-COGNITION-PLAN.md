# 关系认知（Relation Cognition）实施评估与后续计划

> 基于代码审查生成，完成后删除。
> 审查日期：2026-03-19

---

## 一、当前实现评估

### 线 A：社会关系认知

| 阶段 | Plan 状态 | 实现质量 | 评分 | 备注 |
|------|----------|---------|------|------|
| A1 SocialEntity | 完成 | 高 | 9/10 | CRUD + alias 匹配 + syncFromTracePointIds 增量同步 + findRelevant 上下文召回均已实现 |
| A2 Classification | 完成 | 高 | 9/10 | LLM 分类 + 定时调度 + mentionCount>=3 阈值 + 自动合并(confidence>=0.85) + classifyPending 批量处理 |
| A3 SocialRelationEdge | 完成（超出计划） | 高 | 9/10 | edge CRUD + syncFromTracePoints + trend 计算 + SocialCarePlannerService 主动关怀 + 14天冷却 + 证据要求 |
| A4 SocialInsight | 完成（超出计划） | 高 | 9/10 | weekly/monthly 洞察生成 + LLM+fallback 双路径 + 区分 direct/reflected 事件源 + findRelevant 上下文召回 |

**线 A 亮点：**
- 全链路自动化：TracePoint -> Entity -> Classification -> Edge -> Insight，每层有独立 scheduler
- SocialInsight 区分了 direct relation events 和 session reflection bridged events，洞察更准确
- SocialCarePlannerService 实现了完善的主动关怀：declining+quality<=0.55 触发、冷却期、证据充分性检查、最近用户提及检查
- 4 个 feature flag 控制所有 scheduler，可独立开关

**线 A 不足：**
- 无前端 UI（API 已完备但无消费者）

---

### 线 B：小晴与用户关系

| 阶段 | Plan 状态 | 实现质量 | 评分 | 备注 |
|------|----------|---------|------|------|
| B1 RelationshipOverview | 完成 | 高 | 8/10 | 聚合 RelationshipState + Claim rr.* + milestones(stage 变化 + SharedExperience) |
| B2 SessionReflection | 完成（超出计划） | 高 | 9/10 | LLM 回顾 + socialRelationSignals 提取 + newRhythmSignal 发现 + 回流 Claim rr.* + 回流 TracePoint(relation_bridge) + trust/closeness delta 应用 |
| B3 SharedExperience | 完成（超出计划） | 高 | 9/10 | promoteFromReflections LLM 提炼 + 延续检测(7天+关键词+实体重叠) + findRelevant 上下文召回 + followup Plan 生成 |
| B4 关系召回 | 完成 | 高 | 8/10 | TurnContextAssembler 已注入 SharedExperience(significance>0.6) + rhythmObservations(最近3条 reflections) |

**线 B 亮点：**
- SessionReflection -> ClaimEngine rr.* 的闭环完成（rhythmNote 观测 -> newRhythmSignal -> ClaimUpdateService.upsertFromDraft）
- SessionReflection -> TracePoint(relation_bridge) -> SocialEntity/Edge 的跨线桥接完成
- SharedExperience followup 使用 Plan 系统，有 pattern 匹配（面试/考试等）和 cooldown 控制
- TurnContextAssembler 完成了 social + relationship 双维度注入

**线 B 不足：**
- B1 milestones 中缺少 `rhythm_shift` 类型的里程碑（plan 中提到但未实现）
- B1 缺少 `summary` 字段（小晴对关系的一句话描述）
- 无前端 UI

---

### 集成完成度

| 集成点 | 状态 | 实现方式 |
|--------|------|---------|
| PostTurnPipeline: life_record_sync | 已完成 | afterReturn task，提取 TracePoint -> sync Entity + Edge -> classify |
| PostTurnPipeline: session_reflection | 已完成 | afterReturn task，条件触发(>=4轮 or 情感/共思 or fragility) |
| TurnContextAssembler: social 注入 | 已完成 | entities(desc非空, top3) + insights(conf>=0.58, top2) + relationSignals(declining/quality<=0.5, top2) |
| TurnContextAssembler: relationship 注入 | 已完成 | sharedExperiences(significance>0.6, top2) + rhythmObservations(top3) |
| orchestration.types TurnContext | 已完成 | social{} + relationship{} 字段定义完整 |
| ConversationModule 注册 | 已完成 | imports: RelationshipOverviewModule, SessionReflectionModule, SharedExperienceModule |
| Feature Flags | 已完成 | 4 个 scheduler flag 均注册 |
| Prisma Schema | 已完成 | SocialEntity + SocialRelationEdge + SocialInsight + SessionReflection + SharedExperience 5 个 model |
| SessionReflection -> Claim rr.* 回流 | 已完成 | writeRhythmSignalClaim with ClaimSchemaRegistry validation |
| SessionReflection -> SocialEntity/Edge 桥接 | 已完成 | writeSessionReflectionRelationEvents -> TracePoint(relation_bridge) -> sync |
| SessionReflection -> RelationshipState delta | 已完成 | applySessionReflectionRelationshipDelta |

---

### 总体评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 后端数据层 | 10/10 | 所有 Prisma model 已建立，索引合理 |
| 后端服务层 | 9/10 | 全部 service 实现完整，超出原计划（增加了 SocialCarePlanner, SharedExperienceFollowup） |
| 后端集成层 | 9/10 | PostTurn + TurnContext + Orchestrator 集成完成，跨线桥接完成 |
| 后端 API 层 | 9/10 | 所有 controller 和 REST 端点就绪 |
| 调度与自动化 | 9/10 | 4 个 cron scheduler + 2 个 Plan-based followup 完成 |
| 前端 | 0/10 | 完全未开始 |

---

## 二、后端遗留项（优先级低，可选）

### 2.1 RelationshipOverview 增强
- [ ] 添加 `summary` 字段：小晴对关系的一句话描述（LLM 生成或模板）
- [ ] 添加 `rhythm_shift` 里程碑类型（当 rr.* claim 的 level 发生变化时记录）
- [ ] 考虑是否缓存 overview 结果（当前每次请求都聚合）

### 2.2 prompt 注入质量优化
- [ ] 在 chat-completion.engine 中确认 social/relationship context 被正确拼入 system prompt
- [ ] 添加 token budget 控制，避免 social 上下文过长

### 2.3 .env.example 同步
- [ ] 确认 4 个新 feature flag 已在 .env.example 中记录

---

## 三、前端实施计划

### 阶段 F1: 基础服务层 + 路由

**目标**: 建立前端 service 和路由基础设施

**新增文件**:
```
frontend/src/app/core/services/
  relation.service.ts        # 聚合: social-entity + social-relation-edge + social-insight API
  relationship.service.ts    # B线: relationship-overview + session-reflection + shared-experience API
```

**路由扩展** (`app.routes.ts`):
```
/memory/relations     -> 关系认知主页面（新 tab 加入 MemoryHub）
```

**MemoryHub 扩展**:
- 在 memory-hub.component.ts 的模块列表中添加 `relations` 模块
- keywords: `relation, social, 关系, 社会, 人物`

**产出**: 2 个 service + 1 个路由 + MemoryHub 配置更新

---

### 阶段 F2: 社会关系人物列表

**目标**: 在关系页面展示用户社会世界中的人物

**新增组件**:
```
frontend/src/app/memory/
  memory-relations-page.component.ts     # 关系认知主页面，包含 tab 切换
  relation-entity-list.component.ts      # 人物实体列表
```

**功能**:
- 人物卡片列表：显示 name, relation, description, mentionCount, lastSeenAt
- 按 relation 类型分组/筛选（family, friend, colleague, romantic, pet, other）
- 支持手动编辑 relation/description（PATCH API）
- 支持合并重复实体（merge API）
- mentionCount 用于排序/视觉权重
- lastSeenAt 用于显示"最近提及"标签

**设计要点**:
- 使用 CSS 变量的卡片式布局
- relation 类型用不同色点标识
- 空状态提示："小晴还没有观察到你提到身边的人，多和我聊聊吧"

---

### 阶段 F3: 关系画像（小晴与用户）

**目标**: 展示小晴与用户的关系状态

**新增组件**:
```
frontend/src/app/memory/
  relation-overview.component.ts        # 关系画像卡片
```

**功能**:
- 关系阶段标签: early / familiar / steady，带简要说明
- 信任度 + 亲密度进度条（trustScore, closenessScore 0~1）
- 节奏偏好列表: rhythmPreferences[] 展示为标签
- 里程碑时间线: milestones[] 按时间排列

**设计要点**:
- 作为关系页面顶部的"概览卡片"
- 进度条用 CSS 变量中的颜色
- 里程碑按时间倒序，用 stage_change / shared_experience 图标区分

---

### 阶段 F4: 共同经历时间线

**目标**: 展示小晴与用户一起经历的重要时刻

**新增组件**:
```
frontend/src/app/memory/
  relation-shared-experiences.component.ts  # 共同经历时间线
```

**功能**:
- 时间线布局：按 happenedAt 排列，每条卡片显示 title, summary, category, emotionalTone, significance
- category 用不同色标（emotional_support=温暖蓝, co_thinking=思考紫, celebration=庆祝金, crisis=紧张红, milestone=里程碑绿, daily_ritual=日常灰）
- 按 category 筛选
- 按 significance 排序或按时间排序切换

**设计要点**:
- 竖向时间线，左侧圆点+线条
- emotionalTone 用于微调卡片背景色调
- significance 用于卡片视觉权重（如字体大小/边框粗细）

---

### 阶段 F5: 关系动态与洞察

**目标**: 展示社会关系的变化趋势和小晴的洞察

**新增组件**:
```
frontend/src/app/memory/
  relation-insights.component.ts       # 社会洞察展示
  relation-edge-list.component.ts      # 关系趋势列表（可选）
```

**功能**:
- 洞察卡片：展示 SocialInsight 内容，显示 scope(weekly/monthly), confidence, relatedEntities
- 关系趋势（可选）：展示 SocialRelationEdge 的 quality+trend，标红 declining 的关系

---

### 阶段 F6: Session Reflection 浏览（可选）

**目标**: 让用户可查看每次对话的关系回顾

**方案**: 在聊天页面的对话详情中，如果该 conversation 有 SessionReflection，显示一个小卡片：
- summary + relationImpact 标签
- rhythmNote（如有）
- sharedMoment 标记

**优先级**: 低，可延后。SessionReflection 的价值主要在后端闭环（驱动 Claim 和 Experience），用户直接浏览的需求较弱。

---

## 四、实施优先级排序

```
后端遗留 (可并行):
  [可选] 2.1 RelationshipOverview summary + rhythm_shift milestone
  [建议] 2.3 .env.example 同步

前端实施:
  F1 基础服务层 + 路由  ────────── 基础设施
       |
  F2 社会关系人物列表  ─────────── 核心：A线可视化
  F3 关系画像(小晴与用户) ──────── 核心：B线可视化
       |                    (F2, F3 可并行)
       |
  F4 共同经历时间线  ──────────── 情感价值高
       |
  F5 关系动态与洞察  ──────────── 完善 A线
       |
  F6 Session Reflection 浏览 ──── 可选，优先级最低
```

**建议一期交付（MVP 前端）**: F1 + F2 + F3 + F4
**建议二期交付**: F5 + F6 + 后端遗留项

---

## 五、各阶段验收标准

| 阶段 | 验收标准 |
|------|---------|
| F1 | service 能正确调用后端 API 并返回类型化数据；路由可访问；MemoryHub 新 tab 可切换 |
| F2 | 人物列表正确渲染；筛选/排序工作正常；编辑和合并操作可执行；空状态正确显示 |
| F3 | 关系画像卡片正确展示 stage/scores/preferences/milestones |
| F4 | 共同经历时间线正确渲染；分类筛选和排序工作正常 |
| F5 | 洞察卡片正确展示；confidence 和 scope 标签正常 |
| F6 | 对话详情中 SessionReflection 卡片正确显示（如有） |
