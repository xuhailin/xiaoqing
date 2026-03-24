# 人格与表达（Persona & Expression）

## 1. 模块目标

- **负责什么**：小晴侧 **人格**（稳定人设、价值边界、双池进化等）、**印象**、**表达调度**（说多少、节奏、voiceStyle / adaptiveRules / silencePermission）、**用户称呼与偏好**在 Prompt 中的注入（含 Claim 路径如昵称）、以及**关系认知**演进设计与现有节奏能力（Claim `rr.*`、RhythmContext、RHYTHM_PATTERN 记忆）的协同。  
- **不负责什么**：工具选路与执行（属决策/执行层）；世界状态字段补全（属 WorldState）；用户生活事件时间线（属 Life Record）。

## 2. 领域边界

- **人格 vs 表达**：人格回答「是谁、边界是什么」；表达调度回答「这轮说多少、用什么密度」，类比「嗓音 vs 音量」（见表达策略文档）。  
- **表达不参与记忆写入/召回**：只影响呈现方式；记忆仍由 memory/claim 管线负责。  
- **昵称/偏好**：多走 **Claim**（如 `ip.nickname.primary`）与 `TurnContext` 注入；需区分 **提议态/确认态**、**STABLE/CORE 才可进默认展示**（见昵称计划与偏好手册）。  
- **社会关系计划**：描述线 A（社交世界）与线 B（与小晴关系）演进，**部分为路线图**；实现进度需对照 `assistant/life-record/**`、`relationship-overview` 等代码。

## 3. 核心模型 / 状态 / 服务 / 入口

| 类型 | 位置 |
|------|------|
| 人格服务 / 进化 | `backend/src/assistant/persona/**` |
| Prompt 组装与注入 | `backend/src/assistant/prompt-router/prompt-router.service.ts` |
| Turn 上下文组装 | `backend/src/assistant/conversation/turn-context-assembler.service.ts` |
| Claim 选择与注入 | `backend/src/assistant/claim-engine/claim-selector.service.ts` |
| Claim schema / 昵称 key | `backend/src/assistant/claim-engine/claim-schema.registry.ts` |
| 认知管道中的节奏 | `backend/src/assistant/cognitive-pipeline/cognitive-pipeline.service.ts`（RhythmContext 等） |
| 总结中提取画像/昵称 | `backend/src/assistant/summarizer/summarizer.service.ts` |
| 关系/社交扩展 | `assistant/life-record/social-*`、`relationship-overview/**`（按需求深入） |

**前端**：人格/偏好/记忆相关页面遵循 `docs/frontend-ui-rules.md` 与设计 token。

## 4. 主流程

1. **加载**：Turn 组装阶段拉取 Persona、IdentityAnchor、Injectable Claims、印象、表达策略字段。  
2. **注入**：`prompt-router` 按约定顺序组装 system messages（人格 → 锚定 → 印象 → 记忆 → 意图 → 世界状态 → **表达调度**）。  
3. **生成**：模型在表达约束下输出；回复组织层不做新的路由决策。  
4. **回合后**：总结/Claim 更新可能触发新的偏好证据；人格进化仍走双池与用户确认（见 memory-growth / persona 文档）。  
5. **昵称 MVP**：计划见 `docs/design/nickname-preference-plan.md`；实现须与 `readPreferredNickname`、prompt 指引、Claim 状态一致。

## 5. 关键文档来源

- `docs/expression-policy-design.md`  
- `docs/language-style.md`  
- `docs/design/nickname-preference-plan.md`  
- `docs/social-relation-plan.md`  
- `docs/preference-evolution-trigger-guide.md`（Claim 展示与晋升）  
- `docs/memory-growth-plan.md`（人格与记忆闭环）  
- `docs/assistant-architecture-principles.md`（回复层职责）

## 6. 修改原则

- 新表达规则优先落在 **表达调度数据结构 + prompt-router 单点拼接**，避免复制到多个 prompt 模板。  
- 用户可见偏好变更应能追溯到 **Claim 状态与投影规则**。  
- 昵称/称呼类需求优先复用 **Claim key + TurnContext + prompt 指引**，慎增平行字段。  
- 关系/社交大改前对照 `social-relation-plan.md` 分阶段，避免一次改穿多层。

## 7. 常见坑

- **Claim 已写入但模型仍不称呼**：可能未达 STABLE/CORE，或 `preferredNickname` 未注入 prompt（见昵称计划）。  
- **把 language-style 当硬编码系统 prompt**：应与 expression-policy 中的机制字段配合。  
- **social-relation-plan 全盘当已实现**：文档含 L2/L3 与多条线，需按代码目录核对。  
- **在生成阶段改路由**：违反「回复组织不做系统行为决策」原则。  
- **draft.* 与正式偏好混淆**：展示与注入规则不同（见偏好触发手册）。
