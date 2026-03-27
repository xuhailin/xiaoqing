# Assistant Pipeline Boundary

## 主链路总览

```text
Quick Router
  → Perception
  → Decision
  → Execution
  → Expression
  → Post-turn
```

- Quick Router：在不加载重上下文的前提下做轻量分流。
- Perception：组装上下文并产出结构化理解结果，不做行动决策。
- Decision：基于感知结果做本回合唯一主动作决策。
- Execution：按决策调用能力、技能或兼容执行层，并汇总结果。
- Expression：把聊天/工具/缺参等结果组织成最终面向用户的回复。
- Post-turn：在回复落库后执行记忆、成长、反思等收尾写回。

## 分层职责定义

### Quick Router

- 职责：对用户输入做快速 chat/tool 分流，并提供 `toolHint`。
- 不做什么：不加载会话上下文；不读取 memory/claim/messages；不做最终工具决策。
- 输入：原始 `userInput`。
- 输出：`QuickRouterOutput`。

### Perception

- 职责：组装 `TurnContext`，完成意图补全、认知状态分析、情绪趋势与上下文拼装。
- 不做什么：不决定最终行动；不直接返回用户回复；不启动 post-turn 写回。
- 输入：`conversationId`、`userInput`、`userMessage`、`QuickRouterOutput`。
- 输出：`PerceptionState` 与供下游消费的 `TurnContext`。

### Decision

- 职责：根据 `PerceptionState` 生成本回合唯一 `DecisionState`。
- 不做什么：不拼接最终回复；不直接执行工具；不重新读取散落 runtime 字段做隐式判断。
- 输入：`PerceptionState`、必要的 `userInput`。
- 输出：`DecisionState`（语义别名为 `ActionDecision`）。

### Execution

- 职责：消费 `DecisionState.toolPolicy`，执行 capability / skill / OpenClaw / 兼容执行分支。
- 不做什么：不重新判定用户意图；不直接产出最终面向用户的自然语言；不写 post-turn plan。
- 输入：`TurnContext`、`DecisionState`、`ToolPolicyDecision`。
- 输出：`ExecutionResult` 或兼容层直接产出的已持久化回复结果。

### Expression

- 职责：基于上下文、人格、执行结果生成最终用户可见回复。
- 不做什么：不重新做意图判断；不重新选择系统路由；不越权做工具决策。
- 输入：`ExpressionParams`、`TurnContext`、`ExecutionResult`。
- 输出：回复文本、边界审查结果、最终助手消息。

### Post-turn

- 职责：根据本回合快照执行 memory / claim / growth / relation / reflection 等收尾任务。
- 不做什么：不影响本回合主动作决策；不重新组织返回给用户的正文；不反向修改感知/决策结论。
- 输入：`PostTurnUpdatePlan`。
- 输出：异步/同步写回副作用与调试日志。

## 关键对象流转（Schema 流）

| Schema | 生产者 | 消费者 | 是否允许跨层访问 |
| --- | --- | --- | --- |
| `QuickRouterOutput` | `QuickIntentRouterService` | `TurnContextAssembler`、`AssistantOrchestrator` | 仅允许 Router → Perception / Orchestrator 读取，不允许 Execution 反向改写 |
| `PerceptionState` | `AssistantOrchestrator`（基于 assembler + cognitive state 补齐） | `ActionReasonerService` | 仅允许 Decision 读取；Expression/Post-turn 需消费其派生快照而非回写 |
| `DecisionState` | `ActionReasonerService` | `AssistantOrchestrator`、Execution、Post-turn plan builder | 允许向 Execution / Post-turn 单向流转，不允许 Perception 反向依赖 |
| `ExecutionResult` | `ChatCompletionEngine` / 执行层能力 | `AssistantOrchestrator.composeExecutionReply`、Expression | 允许 Execution → Expression 单向流转，不允许 Router / Perception 直接消费 |
| `ExpressionParams` | `AssistantOrchestrator` | `ResponseComposer` / `ExpressionControlService` | 仅允许 Expression 层消费，不允许 Decision/Execution 读取表达内部 prompt 细节 |
| `PostTurnUpdatePlan` | `PostTurnPlanBuilder` | `PostTurnPipeline`、post-turn tasks | 仅允许 Post-turn 层消费，不允许前面各层据此回改主链路 |

## 禁止行为清单

- ❌ Quick Router 禁止读取 memory / claim / messages。
- ❌ Perception 层禁止做工具决策或最终行动选择。
- ❌ Decision 层禁止拼接最终回复文本。
- ❌ Execution 层禁止直接把自然语言判断当成最终用户回复出口。
- ❌ Expression 层禁止重新做意图判断或系统路由。
- ❌ Post-turn 禁止反向修改本回合主链路决策结果。
- ❌ Tool / Capability 禁止按 `conversationId` 查询完整聊天上下文。
- ❌ ChatCompletionEngine 禁止新增职责（冻结层）。

## 当前过渡层说明

### 冻结过渡层

- `ChatCompletionEngine`

### 当前策略

- 允许该层继续承接历史兼容路径。
- 禁止继续叠加感知、决策、表达新职责。
- 新能力必须优先接入 `AssistantOrchestrator` + 显式分层 schema。
- 若需要新增执行能力，应优先扩展 executor / registry，而不是在该层增加新的大分支。
