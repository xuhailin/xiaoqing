# 小晴 Schema 收口与依赖重组执行计划

> **与已有文档的关系**
>
> - `schema-and-dependency-convergence-plan.md`：边界固化与防回退 Prompt（后续阶段）
> - `schema-convergence-plan.md`：Pipeline 调试可视化面板 Prompt（并行阶段）
>
> 本文档是**当前阶段（Schema 收口 → 依赖迁移）的工程执行计划**，供 Codex / Claude Code 逐 Phase 执行。
> 上述两份文档所描述的工作依赖本计划完成后才能可靠进行。

---

## 1. 文档目标

本计划解决从「散乱参数 + 隐式上下文」向「结构化对象显式流动」的迁移问题。

**现在进入 Schema 收口阶段的原因：**
- Quick Intent Router 已前置；ActionReasoner 已移出 TurnContextAssembler；
- ResponseComposer 已消除 CognitivePipeline fallback 分析；
- `captureStructuredWorkItem` 已纳入 PostTurnPipeline.beforeReturn；
- 六个核心 Schema 对象均已有 TypeScript 类型定义。

**本轮不做大爆破式重构的原因：**
- 系统未上线但主链路功能仍在持续迭代，稳定性优先；
- `TurnContext` 是已有大量调用的中心对象，直接整体替换风险高；
- 允许过渡态：新 Schema 与 `TurnContext.runtime.*` 并存，逐步迁移消费点。

---

## 2. 当前阶段判断

**为什么可以开始 Schema 收口：**
六个核心对象均已有明确 TypeScript 类型且已在主链路中被实际使用：
- `QuickRouterOutput` → `quick-intent-router.types.ts`（生产者：QuickIntentRouterService）
- `PerceptionState` → `perception.types.ts`（已在 Orchestrator 中显式构造并传入 ActionReasoner）
- `DecisionState` (= `ActionDecision`) → `action-reasoner.types.ts`（已有类型别名）
- `ExecutionResult` → `orchestration.types.ts`（ChatCompletionEngine → Orchestrator）
- `ExpressionParams` → `expression.types.ts`（已定义 union type，ResponseComposer 已 import）
- `PostTurnUpdatePlan` (= `PostTurnPlan`) → `post-turn.types.ts`（已有类型别名）

**不再是结构阻塞项：**
- 类型文件的模块归属已基本稳定（均在 `conversation/` 或各自域）
- 感知/决策分离已落地（`decideFromPerception` 接受 `PerceptionState`）
- PostTurn 写回入口已收口（`PostTurnPlanBuilder.build()` 结构化）

**过渡保留层：**
- `ChatCompletionEngine`：仍承接 chat/tool 路径执行编排；已标注冻结注释；**不允许新增职责**
- `TurnContext.runtime.*` 中的 `@deprecated` 字段：尚未从消费点移除，是当前主要迁移目标

---

## 3. 目标对象清单

| 对象 | 所属层 | 作用 | 当前现状 | 建议落点 | 优先级 |
|------|--------|------|----------|----------|--------|
| `QuickRouterOutput` | Router | Quick Router 分流结果 | ✅ 已有类型；Orchestrator 传入 Assembler；`TurnContext.runtime.quickRoute` 标 deprecated | `conversation/quick-intent-router.types.ts`（已在此）| 低（稳定） |
| `PerceptionState` | Perception | 感知层结构化快照（意图+认知+情绪） | ✅ 已有类型；Orchestrator 已显式构造并传 ActionReasoner；但 ChatCompletionEngine 仍读 `runtime.mergedIntentState` | `conversation/perception.types.ts`（已在此） | 高（迁移消费点） |
| `DecisionState` | Decision | ActionReasoner 输出的行动决策 | ✅ 已有类型（alias）；Orchestrator 已消费；PostTurnPlanBuilder 已接收 | `action-reasoner/action-reasoner.types.ts`（已在此） | 中（消费点基本到位，需清理 runtime 读取） |
| `ExecutionResult` | Execution | ChatCompletionEngine 向 Orchestrator 暴露的执行路径摘要 | ✅ 已有类型；Orchestrator 通过 `composeExecutionReply` 消费；注释清晰 | `conversation/orchestration.types.ts`（已在此，可考虑未来拆分） | 低（已稳定） |
| `ExpressionParams` | Expression | ResponseComposer 各方法的统一入参 union | ✅ 已有类型；ResponseComposer 已 import；**但方法签名仍用散参** | `conversation/expression.types.ts`（已在此） | 高（ResponseComposer 方法签名待迁移） |
| `PostTurnUpdatePlan` | Post-turn | PostTurnPipeline 接受的回合后处理计划 | ✅ 已有类型（alias）；PostTurnPlanBuilder.build() 已结构化 | `post-turn/post-turn.types.ts`（已在此） | 低（已稳定） |

---

## 4. 目标依赖方向

```text
QuickIntentRouterService  →  QuickRouterOutput
  ↓
TurnContextAssembler（组装 TurnContext，含 runtime.quickRoute 过渡字段）
  ↓
TurnCognitiveStateService  →  CognitiveTurnState（注入 PerceptionState）
  ↓
[Orchestrator 显式构造 PerceptionState]
  ↓
ActionReasonerService.decideFromPerception(PerceptionState)  →  DecisionState / ActionDecision
  ↓
ChatCompletionRunner（目标：接受 DecisionState，不再读 runtime.*）
  ↓
  ├── ChatCompletionEngine（过渡层冻结；消费 ToolPolicyDecision，不再直接读 runtime.mergedIntentState）
  │     └──  →  ExecutionResult
  └── ResponseComposer（目标：接受 ExpressionParams union，不再散参）
        └──  →  ReplyComposition
  ↓
PostTurnPlanBuilder.build(PostTurnPlanBuildInput)  →  PostTurnUpdatePlan / PostTurnPlan
  ↓
PostTurnPipeline.runBeforeReturn / runAfterReturn
```

**各层允许依赖：**
- Router：只依赖用户输入字符串，不依赖 TurnContext
- Perception（Assembler + TurnCognitiveState）：依赖 DB / Session / Memory / QuickRouterOutput
- Decision（ActionReasoner）：只依赖 `PerceptionState`，不依赖 TurnContext 全量
- Execution（Engine + CapabilityRegistry）：依赖 `DecisionState.toolPolicy` + TurnContext（可接受，过渡）
- Expression（ResponseComposer）：依赖 `ExpressionParams`，通过 union type 区分路径
- Post-turn（PostTurnPipeline）：依赖 `PostTurnUpdatePlan`，不依赖主链路实时对象

**各层不应依赖：**
- Decision 层不应自行读 `TurnContext.runtime.mergedIntentState`（应通过 PerceptionState）
- Expression 层不应做意图判断或路由决策
- ChatCompletionEngine 不应新增任何感知/决策/表达职责

**旧模块过渡策略：**
- `TurnContext.runtime.*` deprecated 字段：保留但不新增读取点，Phase 3 清理
- `PostTurnBuildMeta`（`orchestration.types.ts` 中）：Phase 3 删除，当前不新增使用

---

## 5. 分阶段执行计划

### Phase 1：Schema 落定与文件稳定

> 目标：确认六个核心对象类型完整、注释清晰、模块归属稳定。不做大规模调用迁移。

---

**任务 1.1：完善 `PerceptionState` 注释与字段对齐**

- 修改范围：`backend/src/assistant/conversation/perception.types.ts`
- 本次动作：补充 JSDoc 说明「谁生产（Orchestrator）、谁消费（ActionReasoner）」；确认字段与 `TurnContext.runtime.*` 一一对应（已有注释说明但可更明确）
- 明确不做：不修改消费方代码；不删除 `TurnContext.runtime` deprecated 字段
- 验收标准：`PerceptionState` 注释中可见「生产者 / 消费者 / 与 TurnContext.runtime 的过渡关系」
- 风险说明：纯注释修改，无运行风险
- 建议单独 PR：否（可合入 Phase 1 PR）

---

**任务 1.2：完善 `ExpressionParams` 注释与变体完整性**

- 修改范围：`backend/src/assistant/conversation/expression.types.ts`
- 本次动作：确认 `ChatExpressionParams / ToolExpressionParams / MissingParamsExpressionParams` 三个变体与 `ResponseComposer` 三个方法（`composeChatReply / composeToolReply / composeMissingParamsReply`）一一对应；补充「谁消费哪个变体」的 JSDoc
- 明确不做：不修改 ResponseComposer 方法签名
- 验收标准：三个变体注释中均说明对应的 ResponseComposer 方法名
- 风险说明：纯注释修改
- 建议单独 PR：否

---

**任务 1.3：为 `DecisionState` 和 `PostTurnUpdatePlan` 别名补充说明**

- 修改范围：`action-reasoner/action-reasoner.types.ts`、`post-turn/post-turn.types.ts`
- 本次动作：在 `DecisionState` 和 `PostTurnUpdatePlan` 的类型别名声明处补充注释，说明别名存在的意义（语义区分 vs 结构共用）
- 明确不做：不修改类型结构；不重命名
- 验收标准：别名声明处有一句注释说明语义别名的目的
- 风险说明：纯注释修改
- 建议单独 PR：否

---

**任务 1.4：确认 `ExecutionResult` 模块归属**

- 修改范围：`backend/src/assistant/conversation/orchestration.types.ts`
- 本次动作：检查 `ExecutionResult` 是否适合长期留在 `orchestration.types.ts`（当前与大量其他类型混放），补充一行注释说明「当前暂留此处，未来可拆分至独立 execution 类型文件」
- 明确不做：不做实际文件拆分
- 验收标准：`ExecutionResult` 定义处有「@future migration」注释
- 风险说明：纯注释
- 建议单独 PR：否

---

### Phase 2：依赖迁移——关键消费点改为读结构化对象

> 目标：让主链路不再通过 `TurnContext.runtime.*` deprecated 字段传递感知信息。
> 允许增加 adapter / mapper 函数；不要求一次删掉所有旧字段。

---

**任务 2.1：`ChatCompletionEngine` 停止直接读 `context.runtime.mergedIntentState`**

- 修改范围：`backend/src/assistant/conversation/chat-completion.engine.ts`
- 本次动作：在 `processTurnInternal` 中，`intentState` 的赋值改为优先读 `forcedPolicy`（已传入）提供的决策结果，而不是从 `context.runtime.mergedIntentState ?? context.runtime.intentState` 中重新读取；若 Engine 内确实需要 intentState 做槽位提取，则从 `ToolPolicyDecision` 上补充 intentState 字段，或通过参数显式传入
- 明确不做：不删除 `TurnContext.runtime.mergedIntentState` 字段本身；不重构 ChatCompletionEngine 其余逻辑
- 验收标准：`processTurnInternal` 中不出现 `context.runtime.mergedIntentState` 的直接读取；TypeScript 编译通过
- 风险说明：Engine 内多处用到 intentState 做槽位提取，需逐一确认替换后槽位数据来源不变；改动前先打 debug log 确认当前值
- 建议单独 PR：**是**

---

**任务 2.2：`ResponseComposer` 方法签名迁移为接受 `ExpressionParams`**

- 修改范围：`backend/src/assistant/conversation/response-composer.service.ts`
- 本次动作：将 `composeChatReply / composeToolReply / composeMissingParamsReply` 的方法签名改为接受对应的 `ChatExpressionParams / ToolExpressionParams / MissingParamsExpressionParams`；调用方（Orchestrator `composeExecutionReply`）同步修改，从当前散参构造对应的 `ExpressionParams` 对象后传入
- 明确不做：不修改 ResponseComposer 内部 prompt 构建逻辑；不删除 ExpressionBaseParams 中尚未用到的字段
- 验收标准：三个方法签名均接受对应的 ExpressionParams 变体；Orchestrator 中不再有散参展开调用；TypeScript 编译通过
- 风险说明：Orchestrator 中需同步修改三处调用点，改动涉及主链路表达层入口，需仔细核对参数映射
- 建议单独 PR：**是**

---

**任务 2.3：`Orchestrator.composeExecutionReply` 停止读 deprecated runtime 字段**

- 修改范围：`backend/src/assistant/conversation/assistant-orchestrator.service.ts`（`composeExecutionReply` 方法）
- 本次动作：`composeExecutionReply` 中读取 `context.runtime.mergedIntentState ?? context.runtime.intentState` 的地方，改为从 `context.runtime.actionDecision`（已注入）的上层传参中获取，或直接从 PostTurnPlanBuilder 调用时传入的 `PerceptionState`
- 明确不做：不修改 `composeExecutionReply` 的整体结构；不删除 TurnContext.runtime 中的字段
- 验收标准：`composeExecutionReply` 内不再出现 `runtime.mergedIntentState` / `runtime.intentState` 的直接读取
- 风险说明：需确认 PostTurnPlan context.intentState 的来源链不断
- 建议单独 PR：否（可与 2.2 合并）

---

### Phase 3：过渡层收敛——清理冗余桥接，冻结遗留层

> 目标：清除不再被主链路读取的 deprecated 字段和桥接结构。不要求删除 ChatCompletionEngine。

---

**任务 3.1：从 `TurnContext.runtime` 移除已无消费的 deprecated 字段**

- 修改范围：`backend/src/assistant/conversation/orchestration.types.ts`、`turn-context-assembler.service.ts`（写入方）
- 本次动作：Phase 2 完成后，grep 确认 `runtime.intentState`、`runtime.mergedIntentState`、`runtime.quickRoute`、`runtime.cognitiveState`、`runtime.emotionTrend` 的实际使用点；对已无消费的字段，从 `TurnContext` 类型和 Assembler 写入逻辑中移除
- 明确不做：不删除整个 TurnContext；不一次性删除所有 deprecated 字段（先删无消费的）
- 验收标准：`@deprecated` 字段数量减少；TypeScript 编译通过；相关 grep 无剩余消费点
- 风险说明：需先做全量 grep 确认，不要盲目删除
- 建议单独 PR：**是**

---

**任务 3.2：删除 `PostTurnBuildMeta` 桥接类型**

- 修改范围：`backend/src/assistant/conversation/orchestration.types.ts`
- 本次动作：grep `PostTurnBuildMeta` 的所有使用点；确认 ChatCompletionRunner 的 `postTurnMeta` 字段在主链路中是否仍有生产；若已无生产，删除 `PostTurnBuildMeta` 类型定义及 `ChatCompletionResult.postTurnMeta` 字段
- 明确不做：不修改 PostTurnPlanBuilder；不删除 `ChatCompletionResult` 本身
- 验收标准：`PostTurnBuildMeta` 类型不再出现在代码库中
- 风险说明：需先确认 ChatCompletionRunner 是否仍生产 `postTurnMeta`
- 建议单独 PR：否（可与 3.1 合并）

---

**任务 3.3：为 `ChatCompletionEngine` 补充冻结增责注释**

- 修改范围：`backend/src/assistant/conversation/chat-completion.engine.ts`
- 本次动作：在类顶部 JSDoc 中已有冻结说明的基础上，补充：(1) 当前仍承载哪些职责（执行编排、能力路由）；(2) 明确列出「不允许新增」的职责类型（感知、新型决策分支、新表达控制）
- 明确不做：不重构 Engine 内部逻辑；不拆分现有能力
- 验收标准：Engine 类 JSDoc 中可见「冻结增责」的明确禁止条款
- 风险说明：纯注释
- 建议单独 PR：否（可合入 3.1）

---

## 6. Codex 执行建议

### 推荐执行顺序

1. **先并行执行** Phase 1 的四个任务（纯注释，无依赖）
2. **串行执行** Phase 2：
   - 先做 2.1（Engine 停止读 deprecated），再做 2.2（ResponseComposer 签名迁移），最后 2.3（Orchestrator 清理）
   - 2.1 完成后需验证聊天/工具路径均正常，再推进 2.2
3. **等 Phase 2 全部合入** 后，执行 Phase 3（grep 确认无消费后再删）

### 单任务粒度建议

**适合一次交给 Codex 的任务：**
- 单个文件的注释补充（1.1 ~ 1.4）
- 单个方法的签名修改 + 对应调用方同步（2.2 = ResponseComposer + Orchestrator 调用点）
- 单个 grep → 删除流程（3.1、3.2）

**不要合并在一个 prompt 里的任务：**
- 不要把 2.1 和 2.2 合并：两者修改的文件不同，且 2.2 依赖 2.1 完成后验证主链路稳定
- 不要把 Phase 2 和 Phase 3 合并：Phase 3 的前提是 Phase 2 消费点已迁移完

### 风险控制建议

**改动前要先读调用链的模块：**
- `ChatCompletionEngine.processTurnInternal`：读完整 intentState 使用链（约 15 处），再做 2.1
- `ResponseComposer.composeChatReply`：确认入参是否有隐式依赖 `TurnContext` 全量，再做 2.2
- `TurnContextAssembler`：做 3.1 前必须读，确认 deprecated 字段写入点

**必须先读调用链再动实现的任务：**
- 2.1、2.3、3.1：修改前 grep 确认所有消费点，建议先加注释 `// TODO: migrate to PerceptionState`，PR 后再做实际替换

**最容易"表面结构化，实际没减耦"的地方：**
- `ResponseComposer` 改签名后，如果 Orchestrator 只是把散参打包成 ExpressionParams 再拆包传进去，等于没减耦——需要确保 ExpressionParams 的构造在 Orchestrator 中完整，而不是只做参数重命名
- `ChatCompletionEngine` 读取 intentState 的场景较多，若只改入口读取但内部仍大量展开 slots，效果有限——Phase 2.1 的目标是「停止从 TurnContext.runtime 读取意图」，不是彻底解耦 Engine

---

## 7. 本轮不做什么

- **不做 `TurnContext` 整体替换**：TurnContext 是 Assembler / Engine / ResponseComposer 的共同载体，整体替换影响面过大
- **不强拆 `ChatCompletionEngine`**：当前作为过渡执行编排层保留，冻结增责即可
- **不将 `ExecutionResult` 从 `orchestration.types.ts` 迁移到独立文件**：类型归属稳定后再考虑拆分
- **不追求「零散参数全消除」**：允许 Assembler 内部仍用散参，收口目标是主链路的模块间边界
- **不补测试**：按项目约定，不主动新增测试文件
- **不重构 PostTurnPipeline 任务运行器**：当前任务分发机制稳定，不在本轮动

---

## 8. 验收总标准

本轮计划完成后，应满足：

1. **六个核心对象均有清晰 JSDoc**，说明生产者、消费者和过渡状态
2. **`ChatCompletionEngine.processTurnInternal` 不再直接读 `context.runtime.mergedIntentState`**（可 grep 验证）
3. **`ResponseComposer` 三个方法接受对应的 `ExpressionParams` 变体**（TypeScript 类型可验证）
4. **`Orchestrator.composeExecutionReply` 不再读 deprecated runtime 字段**（grep 验证）
5. **Phase 3 完成后，`TurnContext.runtime` 中至少 3 个 `@deprecated` 字段已移除**（grep 验证）
6. **`PostTurnBuildMeta` 桥接类型已删除或有明确删除路线**
7. **`ChatCompletionEngine` 顶部注释明确列出禁止新增的职责**
8. **新增任何链路逻辑时，不继续向 `ChatCompletionEngine` 堆分支**（Code Review 可观察）

---

## 9. 简短总结

**现在最值得先做的 3 个任务：**
1. **2.1**：停止 ChatCompletionEngine 读 `runtime.mergedIntentState`——最高价值，直接推进依赖收敛
2. **2.2**：ResponseComposer 方法签名迁移为 ExpressionParams——让 Expression 层输入正式结构化
3. **1.1**：PerceptionState 注释完善——成本极低，为 Phase 2 执行者提供明确导航

**现在不要急着做的 2 个任务：**
1. **3.1**（删除 TurnContext deprecated 字段）：必须等 Phase 2 消费点全部迁移完成后才安全
2. **2.3**（Orchestrator composeExecutionReply 清理）：依赖 2.2 稳定后再做，避免反复改同一区域

**推荐先交给 Codex 的第一个 Phase：Phase 1**（四个任务全为注释修改，可在一个 PR 内完成，零风险，同时为 Phase 2 提供清晰的类型文档基础）
