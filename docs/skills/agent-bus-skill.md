# Agent 总线与 Dev 协作（Agent Bus）

## 1. 模块目标

- **负责什么**：多 Agent 场景下的**受控协作**——`entryAgentId`、委托（Delegation）生命周期、回执/结果投影到用户线程、外部 Agent 的 **memory proposal** 入口；与统一消息入口配合，使「小晴前台 + 小勤等执行体」可审计、可拒绝。  
- **不负责什么**：Chat 轨内常规单轮对话逻辑（属 `ConversationService` / 编排器）；DevAgent 内部 plan/execute 细节（属 `dev-agent/**`）；Capability 的普通工具执行（属 `action/**`）。

## 2. 领域边界

- **单前台、非群聊**：用户线程只有一个前台 Agent；协作方不直接抢答（见协议）。  
- **Agent Bus 不是自然语言控制面**：内部委托须结构化协议，不能把普通用户消息当内部指令。  
- **主记忆与人格审批权在小晴**：外部 Agent 只能提交 `memory proposal`，不得直接写入小晴长期记忆/人格。  
- **Dev 与 Chat 隔离**：DevAgent 不读 memory/history；与 `docs/context-boundary.md`、`docs/dev-agent-architecture.md` 一致。  
- **协作结果 ≠ 前台人格输出**：执行体返回结构化结果，由前台组织语气与呈现。

## 3. 核心模型 / 状态 / 服务 / 入口

| 类型 | 位置 |
|------|------|
| 协议与 DTO | `backend/src/agent-bus/agent-bus.protocol.ts`、`agent-bus.dto.ts`、`agent-bus.types.ts` |
| 委托执行 / 投影 | `agent-delegation-executor.service.ts`、`agent-delegation-projection.service.ts` |
| 入站委托 | `agent-inbound-delegation.service.ts`、`agent-inbound.controller.ts` |
| 入站结果 | `agent-inbound-result.service.ts` |
| Memory proposal | `memory-proposal.service.ts`、`memory-proposal.controller.ts` |
| 与会话链接 | `agent-conversation-link.service.ts` |
| HTTP 聚合 | `agent-bus.controller.ts`、`agent-bus.module.ts` |

**对照阅读**：`docs/agent-collaboration-protocol.md`（术语、状态机、载荷结构）与上述 `agent-bus` 实现。

**DevAgent/OpenClaw**：执行轨实现见 `backend/src/dev-agent/**`、执行器 `executors/**`；架构说明见 `docs/dev-agent-architecture.md`。

## 4. 主流程

1. **入站**：用户消息经 Gateway → Router；若走 chat，可能触发前台 Agent 发起委托（结构化）。  
2. **委托**：创建 Delegation → 状态推进（queued / acknowledged / running / completed|failed 等）→ 事件流可审计。  
3. **执行**：由目标 Agent（如远端 OpenClaw/小勤）执行；结果非直接当最终用户文案。  
4. **投影**：`agent_receipt` / `agent_result` 等消息形态进入会话，用户可见轨迹。  
5. **记忆**：外部仅 proposal → 小晴侧审批/合并链路（不绕过 Claim/Memory 规则）。

## 5. 关键文档来源

- `docs/agent-collaboration-protocol.md`  
- `docs/dev-agent-architecture.md`  
- `docs/context-boundary.md`  
- `docs/PROJECT-SUMMARY.md`（Gateway / Dev 总览）  
- `docs/requirements/TECH-OPENCLAW-INTEGRATION.md`（专项需求，实现以代码为准）

## 6. 修改原则

- 新协作通道优先**扩协议字段 + 专用 controller/service**，避免在 `ConversationService` 里加「特殊 if 分支」。  
- 委托与聊天消息模型保持可区分，便于前端渲染与追溯。  
- OpenClaw/执行器变更同步核对 **安全与 Workspace 约束**（Shell 白名单、路径校验）。  
- 需要用户可见状态时，走投影服务，保证与协议事件名一致。

## 7. 常见坑

- **把 DevAgent 当 Chat 后处理延伸**：两轨数据与上下文必须隔离。  
- **外部写 Memory**：只能通过 proposal 流程，否则破坏主记忆所有者原则。  
- **忽略 entryAgentId**：多 Agent 时前台错乱或重复回复。  
- **协议文档与代码漂移**：以 `agent-bus.protocol.ts` 与协议文档互相对照；冲突时先改代码再局部更新文档。  
- **把 implementation-plan 当已上线**：OpenClaw/Dev 集成以 `dev-agent-architecture` + 代码为准。
