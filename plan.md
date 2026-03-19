# 小晴演进计划

> 更新：2026-03-19
> 以目标为导向，按里程碑组织。每个目标有明确验收标准。

---

## 里程碑 1：认知闭环（Cognitive Loop）

**目标**：小晴能自主产出「我这段时间是怎么陪你的」叙事，而不只是被动记录。

### M1.1 L1 数据源补齐 `P0` -- done

- 填充 `TurnCognitiveResult.memoryOps` / `claimOps`，让 `memory_written`、`claim_promoted` 观测真实产出
- 路径：post-turn 任务重排为 `record_growth → summarize_trigger → record_cognitive_observation`，通过 `opsCollector` 跨任务传递数据
- **验收**：DB 中能查到 dimension=memory / dimension=growth 且 payload 与当轮操作一致的 CognitiveObservation

### M1.2 L2 认知洞察 `P1`

- InsightGeneratorService：每日 23:50 聚合当天观测 → LLM 生成日度叙事与模式
- 每周一 02:00 聚合本周观测 → 周度洞察
- API：`GET /cognitive-trace/insights?scope=daily&periodKey=2026-03-19`
- **验收**：连续 3 天有观测数据后，DB 中有 3 条 daily insight + 1 条 weekly insight；API 可查询

### M1.3 L3 认知进化 `P2`

- EvolutionService：从洞察中提炼进化提议（如「最近偏好变了」→ 调整默认 voiceStyle）
- 用户确认 → 应用到 Persona / 策略默认值；支持回滚
- **验收**：至少一条进化提议能走完 proposed → applied 全流程；回滚后行为恢复

---

## 里程碑 2：Agent 协作成熟（Agent Bus Maturity）

**目标**：小晴与小勤的双向协作从「能跑通」到「可日常使用」。

### M2.1 MemoryProposal 前端审批面板 `P1`

- 前端 `agent-bus/` 下新增 proposal 审批页面
- 列表展示 pending proposals（来源 agent、内容、置信度）
- 支持逐条 approve / reject / merge 操作
- **验收**：用户在前端能看到并审批 pending proposals，审批后状态正确变更

### M2.2 高置信度自动审批 `P1`

- 当 proposal.confidence >= 阈值（如 0.85）且 kind 在白名单内时，自动 approve
- 配置化：阈值与白名单可通过环境变量调整
- **验收**：高置信度 proposal 创建后自动变为 approved 且写入 Memory

### M2.3 多 Agent 注册与权限治理 `P2`

- Agent 注册表（agentId、endpoint、capabilities、tokenHash）
- 基于注册表的鉴权替代硬编码 token
- 按 agent 配置允许的 delegation kind
- **验收**：新增一个测试 agent 注册后可发起 delegation；未注册 agent 被拒绝

---

## 里程碑 3：DevAgent 稳定化

**目标**：agent 模式成为 DevAgent 的默认且唯一模式。

### M3.1 Agent 模式端到端验证 `P0` -- done

- 执行链路已完整：routing → queue → executor → SDK → result persistence → polling
- 后端 `agentTurns` 累积 tool_use / text 事件，节流写 DB（每 2s）
- 前端 1.5s 轮询读取 `result.agentTurns`，渲染为 tool-call / assistant 消息
- **验收**：需运行时跑通一次完整诊断任务

### M3.2 Agent 模式进度推送 `P0` -- done

- 后端 `onProgress` 回调收集 `agentTurns[]`（最多 30 条），含 toolName / text 预览 / 时间戳
- 前端 view-model `buildAgentTurnMessages` 从 agentTurns 构建消息流
- 前端 `DevChatRunState` 新增 `toolCallCount` 字段，header 显示工具调用次数
- **验收**：需运行时验证前端能看到执行中进展（工具调用、文字摘要）

### M3.3 Agent 模式 Cancel `P1`

- AbortController → ClaudeCodeStreamService 取消信号传递
- 前端 cancel 按钮
- **验收**：执行中点击取消，agent 在合理时间内停止，run 状态为 cancelled

### M3.4 下线 Orchestrated 模式 `P2`

- 确认 agent 模式在所有场景下可用后，移除 Planner / StepRunner / ShellExecutor 等编排层
- **验收**：代码中不再有 orchestrated 分支；所有 DevAgent 任务走 agent 模式

---

## 里程碑 4：跨系统联动

**目标**：认知、生活轨迹、记忆三个系统不再各自孤立。

### M4.1 CognitiveTrace × LifeRecord 关联 `P2`

- 同一回合的观测与 TracePoint 自动关联（relatedTracePointIds）
- UI 上从生活轨迹某天可进入当日认知观测，反之亦然
- **验收**：至少一条 CognitiveObservation 的 relatedTracePointIds 非空；前端可双向跳转

### M4.2 认知洞察驱动记忆整理 `P3`

- 周度洞察发现高频主题 → 提议合并/晋升相关记忆
- **验收**：洞察产出的记忆操作建议可被用户确认执行

---

## 里程碑 5：认知链路质量

**目标**：对话质量可衡量、可防退化。

### M5.1 回归样例集 `P1`

- 8-12 条核心对话样例，覆盖 intent / reasoning / persona / tool / devagent
- **验收**：样例集可重复执行，产出评分报告

### M5.2 退化判定与门禁 `P2`

- 定义退化判定标准
- CI 中加入对话回归检查（可选 gate）
- **验收**：有明确的 pass/fail 标准；一次故意引入退化的改动被检出

---

## 优先级排序

```
现在
 │
 ├─ M1.1  L1 数据源补齐          ← 认知闭环的基础
 ├─ M3.1  Agent 端到端验证        ← DevAgent 可用性
 ├─ M3.2  Agent 进度推送          ← DevAgent 体验
 │
近期
 ├─ M1.2  L2 认知洞察             ← 认知闭环核心
 ├─ M2.1  Proposal 审批面板       ← Agent 协作体验
 ├─ M2.2  自动审批策略            ← Agent 协作效率
 ├─ M3.3  Agent Cancel            ← DevAgent 完善
 ├─ M5.1  回归样例集              ← 质量基线
 │
中期
 ├─ M1.3  L3 认知进化             ← 认知闭环高阶
 ├─ M2.3  多 Agent 注册           ← Agent 协作扩展
 ├─ M3.4  下线 Orchestrated       ← DevAgent 收敛
 ├─ M4.1  跨系统关联              ← 系统联动
 ├─ M5.2  退化门禁                ← 质量防线
 │
远期
 ├─ M4.2  洞察驱动记忆整理
 └─ 多 agent 并行协作
```

---

## 已完成（归档参考）

| 能力 | 状态 |
|------|------|
| L1 认知观测采集与前端展示 | done |
| 生活轨迹 TracePoint + DailySummary + 前端时间线 | done |
| 记忆自动总结 / 衰减 / 晋升降级 | done |
| 表达策略 voiceStyle / adaptiveRules | done |
| Agent Bus 双向 delegation + 鉴权 + 幂等 | done |
| MemoryProposal 后端存储与审批流 | done |
| 异步结果回调 + 结构化结果解析 | done |
| DevAgent agent 模式基础 + resume + 成本追踪 | done |
| 基础设施重构（enum / queue / workspace） | done |
