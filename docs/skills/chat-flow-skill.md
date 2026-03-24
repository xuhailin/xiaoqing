# Chat 流与路由（Chat Flow）

## 1. 模块目标

- **负责什么**：用户消息从 Gateway 入站后的 **channel 判定**（chat / dev）、Chat 轨上的对话编排、意图识别（含义结构化）、世界状态补全、**决策层**行动选择、工具/Capability 执行、Prompt 组装、LLM 回复、trace 采集与回合后处理触发。
- **不负责什么**：DevAgent 执行轨内的规划/Shell/OpenClaw 任务细节；Capability 内部按 `conversationId` 拉取全量对话/记忆（见边界）。

## 2. 领域边界

- **Chat 轨**是唯一应组装 `Message` / `Memory` / `Claim` / `WorldState` 等完整对话上下文的路径（见 `docs/context-boundary.md`）。
- **Dev 轨**不得读取 chat history / memory 做推理上下文。
- **Tool/Capability**：`conversationId` 仅用于日志与审计，禁止在能力内查 Message/Memory/Claim。
- **意图**只描述用户含义；**最终行动**由决策层决定（见 `docs/assistant-architecture-principles.md`）。
- **回复组织**只做表达，不在生成阶段重新做系统路由。

## 3. 核心模型 / 状态 / 服务 / 入口

| 类型 | 位置（以仓库现状为准） |
|------|------------------------|
| 路由 | `backend/src/gateway/message-router.service.ts` — 显式 `mode` > `/dev` `/task` 前缀 > LLM 意图（`dev_task` 高置信）> chat |
| 调度 | `backend/src/orchestrator/dispatcher.service.ts` — 锁 + 委派到 `IAgent` |
| Chat 适配器 | `backend/src/orchestrator/assistant-agent.adapter.ts` → `ConversationService` |
| 对话主服务 | `backend/src/assistant/conversation/conversation.service.ts` |
| 编排（Turn） | `backend/src/assistant/conversation/assistant-orchestrator.service.ts` |
| 意图 | `backend/src/assistant/intent/intent.service.ts`，prompt 片段 `backend/src/assistant/prompts/intent.ts` |
| WorldState | 会话级 JSON；设计见 `docs/world-state-design.md`，合并逻辑在对话链内 |
| Debug Trace | `docs/debug-trace-design.md`；响应中 `trace` / `TraceStep`（需 `FEATURE_DEBUG_META` 等开关时可见） |

**最先读**：`message-router.service.ts` → `dispatcher.service.ts` → `conversation.service.ts`（理解一轮 chat 的主轴）。

## 4. 主流程

1. **输入**：`POST /conversations/:id/messages`（及元数据如 `mode`）。  
2. **路由**：`MessageRouterService.route` → `chat` | `dev`。  
3. **Chat 路径**：持久化用户消息 → 意图识别 → WorldState 合并 → **决策**（工具策略等）→ Capability / 本地技能 / OpenClaw → Prompt 组装 → LLM → 保存回复 → post-turn（总结、记忆、认知观测等，异步或按设计触发）。  
4. **可观测**：`trace` 中关注 `intent`、`policy-decision`、执行步骤等（见回归文档）。  
5. **UI**：聊天主界面消费消息与可选 trace 展示。

## 5. 关键文档来源

- `docs/context-boundary.md`  
- `docs/dialogue-regression-standard.md`  
- `docs/intent-policy-regression.md`  
- `docs/assistant-architecture-principles.md`  
- `docs/world-state-design.md`  
- `docs/debug-trace-design.md`  
- `docs/PROJECT-SUMMARY.md`（总链路图）

## 6. 修改原则

- 新需求先判断属于五能力中哪一层，避免在 Prompt 路由或意图里「顺手决策」。  
- 路由优先级与保守降级策略不要随意改；不确定时应落 chat。  
- 回归相关改动应对照 `dialogue-regression-standard.md`，意图/策略改动用 `intent-policy-regression.md` 的最小集自测 trace。  
- 优先扩展 `CapabilityRegistry` / 决策表，而非在 `ConversationService` 内堆长分支。

## 7. 常见坑

- **误读路径**：旧文档中的 `backend/src/xiaoqing/**` 已迁移为 **`backend/src/assistant/**`**。  
- **把意图输出当最终行为**：`taskIntent` / slots 需经决策与策略才会执行工具。  
- **在 Capability 内查库拼上下文**：违反 `context-boundary`，后续难审计且易循环依赖。  
- **跳过真实入口做「伪回归」**：标准强调通过真实 chat 入口验证 Q→A（见对话回归标准）。  
- **混淆 Debug Trace 与 Cognitive Trace**：前者是管线调试步骤，后者是用户向认知观测（见 memory-system skill）。
