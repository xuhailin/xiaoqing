# 记忆与认知资产（Memory System）

## 1. 模块目标

- **负责什么**：长期记忆（分类、衰减、召回、写入规则）、总结与记忆提取、用户 Claim/画像证据链、身份锚定（跨会话稳定注入）、人生轨迹（TracePoint / DailySummary）、认知溯源 L1（CognitiveObservation）、以及相关调度与后处理。  
- **不负责什么**：DevAgent 任务上下文；工具执行器内部的「业务记忆」；Debug 管线 trace 的产品化叙事（与 cognitive trace 分工）。

## 2. 领域边界

- **Memory / Claim**：参与 Chat 上下文组装与回合后写入；**不得**被 DevAgent 当作任务推理上下文拉取（见 `docs/context-boundary.md`）。  
- **IdentityAnchor**：用户侧稳定身份表述；**不衰减**、不参与记忆竞争排序；与 **WorldState**（会话前提）、**印象**、**人格**区分（见 `docs/identity-anchor-design.md`）。  
- **Life Record**：用户生活事件流；与 **Cognitive Trace**（小晴侧认知观测）、**Debug Trace**（工程调试）并列，勿混为一谈。  
- **WorldState**：默认前提，服务意图补全；设计在 `docs/world-state-design.md`，本 skill 不展开字段细节。

## 3. 核心模型 / 状态 / 服务 / 入口

| 能力 | 代码入口（优先阅读） |
|------|----------------------|
| 记忆 CRUD / 召回 / WriteGuard | `backend/src/assistant/memory/**` |
| 总结 → 提取 → 与进化联动 | `backend/src/assistant/summarizer/summarizer.service.ts` |
| Claim 引擎 / 画像 | `backend/src/assistant/claim-engine/**` |
| 身份锚定 | `backend/src/assistant/identity-anchor/**`（以代码为准；旧文档若写 `src/identity-anchor` 为历史路径） |
| 人生轨迹 | `backend/src/assistant/life-record/**` |
| 认知溯源 L1 | `backend/src/assistant/cognitive-trace/**`；post-turn 任务与 `AssistantOrchestrator` 协作 |
| 人格 / 印象 / 进化调度 | `backend/src/assistant/persona/**` |
| 回合后处理类型与任务 | `backend/src/assistant/post-turn/**` |

**Prisma 模型**：以 `backend/prisma/schema.prisma` 为准（Memory、UserClaim、TracePoint、DailySummary、CognitiveObservation 等）。

## 4. 主流程

1. **触发**：用户消息进入 Chat 链 → 可能触发召回注入 → 模型回复 → post-turn（总结、记忆写入、观测落库等）。  
2. **写入**：Summarizer / WriteGuard / Claim 更新遵循各设计文档中的规则与状态机。  
3. **展示**：前端记忆列表、人生轨迹、认知看板、人格/偏好页面等消费 API 与投影表（如 UserProfile）。  
4. **排查偏好不展示**：多数与 Claim 状态、`draft.*` key 有关（见偏好触发手册）。

## 5. 关键文档来源

- `docs/cognitive-trace-design.md`  
- `docs/memory-growth-plan.md`  
- `docs/preference-evolution-trigger-guide.md`  
- `docs/life-record-design.md`  
- `docs/identity-anchor-design.md`  
- `docs/world-state-design.md`（会话前提；与长期记忆区分）

## 6. 修改原则

- 新写入路径优先复用 **WriteGuard / Claim 状态机 / Summarizer 钩子**，避免第三处「偷偷写 Memory」。  
- 认知观测（L1）增量字段时保持与 **Debug Trace** 解耦：观测面向可解释叙事，trace 面向工程步骤。  
- 身份锚定变更需可追溯（历史表/审计），避免与 summarizer 自动写入混用（设计原则见 identity-anchor 文档）。  
- 计划文档中的 Phase B/C「未实现」能力（如部分晋升自动化）实现前先对照 `memory-growth-plan.md` 与当前 Prisma。

## 7. 常见坑

- **把 Cognitive Trace 当 Life Record**：前者是小晴推理侧观测，后者是用户生活事件。  
- **Claim 已写入但 UI 不显示**：多为 `CANDIDATE` / `draft.*` 过滤规则（见 `preference-evolution-trigger-guide.md`）。  
- **IdentityAnchor 路径**：实现均在 `assistant/identity-anchor/`，勿按旧文档找错目录。  
- **在 Dev 轨读 Memory**：违反隔离边界，会造成隐式耦合与安全/一致性风险。  
- **L2/L3 认知文档已定义但服务未全量落地**：以 `cognitive-trace-design.md`「当前落地情况」为准。
</think>


<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace