# Context Boundary 设计与约束（最小集）

> 目的：防止 Chat / DevAgent / Tool/Capability 之间的上下文混用与越界查询，让后续开发在不大改架构的前提下也不容易打穿边界。

## 一、三条硬边界（V1）

### 1. Chat 链路

- **唯一可以读取 memory / claim / recent messages 的路径**。  
- 上下文由 `ConversationService` / TurnContext 组合：只在这里拉取 Message 表、Memory、Claim、UserProfile、WorldState 等，并注入到 `ChatContext`。  
- 其他模块如 DevAgent、Tool/Capability 不得直接访问这些表来“自己组装聊天上下文”。

### 2. DevAgent 链路

- **不得读取 chat history / memory**。  
- Dev 任务只使用 `DevTaskContext`（`goal`、`plans`、`stepResults`、`errors` 等），不接入：  
  - `MemoryService` / Summarizer  
  - `CognitivePipeline` / `ClaimEngine`  
  - `ConversationService`（不直接查 Message 表）  
  - PostTurn / DailyMoment 等聊天后处理模块  
- 该约束与 `docs/dev-agent-architecture.md` 9.3 中的“隔离边界”保持一致：DevAgent 视自己为“独立执行轨道”，只复用 LLM / OpenClaw / 部分基础设施。

### 3. Tool / Capability 链路

- `CapabilityRequest.conversationId` **仅用于日志与追踪**（例如关联 run、记录 audit），**禁止**在 capability 内部按此 id 查询：  
  - Message（对话消息表）  
  - Memory（记忆表）  
  - Claim / Profile（画像与偏好）  
- Tool/Capability 不得自行“按 conversationId 拉完整对话”来理解当前轮对话语境。  
- `ToolRequest.recentMessages` 目前只用于 OpenClaw fallback，不传入 `ICapability.execute()`；**保持现状**，如需变更必须更新本文件与相关类型注释。

---

## 二、类型与代码位置绑定

为便于开发者在代码中快速对齐上述边界，以下类型/模块显式引用本文件：

- **Chat 链路（可读 memory/claim/messages）**  
  - `ChatContext`：`backend/src/assistant/prompt-router/prompt-router.service.ts`
- **DevAgent 链路（不得读 chat history/memory）**  
  - `DevTaskContext`：`backend/src/dev-agent/dev-task-context.ts`  
  - 架构说明：`docs/dev-agent-architecture.md`（9.3 隔离边界）
- **Tool/Capability 链路（禁止按 conversationId 查库）**  
  - `CapabilityRequest` / `CapabilityResult` / `CapabilityMeta`：`backend/src/action/capability.types.ts`  
  - `ICapability` 接口：`backend/src/action/capability.interface.ts`  
  - 能力注册模块：`backend/src/action/action.module.ts`

后续若有新模块需要加入上下文边界约束，应在对应类型或模块文件顶部增加一行注释，显式指向本文件。

---

## 三、后续可能扩展（当前不做）

> 本节仅记录方向，**当前实现不包含**这些“重”措施。

- 为 DevAgent 增加 token 级预算（planner/evaluator/report 的 `maxTokens`），并对 LLM messages 使用统一的 `truncateToTokenBudget`。  
- 拆分 `CapabilityRequest` 为更窄的只读版本（不包含 `conversationId`），用于某些单纯执行类能力。  
- 在 CI 或自定义 lint 中增加依赖图检查，例如禁止 `backend/src/action/**` 直接 import `assistant/conversation/*` / `memory/*` / `claim-engine/*`。

