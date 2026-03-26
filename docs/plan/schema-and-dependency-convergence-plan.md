

# 🧠 小晴主链路边界固化与防回退 Prompt（Claude Code 专用）

## 🎯 你的唯一任务

在当前仓库中完成以下 3 件事：

1. **补充主链路分层边界文档**
2. **为关键模块添加“职责注释（不可增责约束）”**
3. **补充最小验证/日志点，确保链路符合分层设计**

⚠️ 注意：

* 不做大规模重构
* 不修改核心业务逻辑
* 不新增复杂功能
* 目标是：**锁边界、防回退、可验证**

---

# 🧩 一、当前前提（必须遵守）

请基于以下事实：

* 主链路已完成 Schema 收口与依赖重组
* 系统已接近稳定架构
* Expression 已基本成为统一出口
* Quick Router 已前置
* ChatCompletionEngine 属于**过渡层（冻结增责）**

你的工作不是再设计架构，而是：

> **把现有架构“写死为规则”，防止未来被破坏**

---

# 📄 二、任务 1：生成分层边界文档

## 文件路径

新增：

```id="q7ub2s"
docs/architecture/assistant-pipeline-boundary.md
```

---

## 文档必须包含以下内容

### 1. 主链路总览（简洁版）

说明当前链路：

```text
Quick Router
  → Perception
  → Decision
  → Execution
  → Expression
  → Post-turn
```

要求：

* 不写长篇解释
* 每层一句话定义职责

---

### 2. 分层职责定义（重点）

每一层必须包含：

* 职责（做什么）
* 不做什么（禁止事项）⭐
* 输入
* 输出

必须覆盖：

* Quick Router
* Perception
* Decision
* Execution
* Expression
* Post-turn

---

### 3. 关键对象流转（Schema 流）

列出：

* QuickRouterOutput
* PerceptionState
* DecisionState
* ExecutionResult
* ExpressionParams
* PostTurnUpdatePlan

说明：

* 谁生产
* 谁消费
* 是否允许跨层访问

---

### 4. 禁止行为清单（必须有）

必须写明确规则，例如：

* ❌ Perception 层禁止做工具决策
* ❌ Decision 层禁止拼接最终回复
* ❌ Execution 层禁止直接返回用户文本
* ❌ Expression 层禁止重新做意图判断
* ❌ ChatCompletionEngine 禁止新增职责（冻结层）

---

### 5. 当前过渡层说明

明确：

* 哪些模块属于过渡层（例如 ChatCompletionEngine）
* 当前策略：允许存在，但**禁止继续加逻辑**

---

# 🧱 三、任务 2：关键模块添加“职责注释”

请在以下核心模块顶部添加注释（不改逻辑）：

---

## 必须处理的模块

* assistant-orchestrator.service.ts
* turn-context-assembler（或等价）
* action-reasoner
* response-composer / expression control
* post-turn pipeline
* quick-intent-router
* chat-completion-engine（重点）

---

## 注释格式要求

每个模块顶部必须补：

```ts
/**
 * [模块名称] - 职责说明
 *
 * 所属层：
 *  - Perception / Decision / Execution / Expression / Post-turn / Router
 *
 * 负责：
 *  - xxx
 *
 * 不负责：
 *  - xxx
 *  - xxx
 *
 * 输入：
 *  - xxx
 *
 * 输出：
 *  - xxx
 *
 * ⚠️ 约束：
 *  - 不得新增 xxx 逻辑
 *  - 不得承担 xxx 职责
 */
```

---

## 特别要求（非常重要）

### ChatCompletionEngine 必须加：

```ts
/**
 * ⚠️ 过渡层（冻结增责）
 *
 * 当前仍承载部分历史逻辑，但：
 * - 不允许新增职责
 * - 不允许继续叠加感知/决策/表达逻辑
 * - 新能力必须接入新主链路（orchestrator + 分层体系）
 */
```

---

# 🔍 四、任务 3：最小验证与日志补充

目标：

👉 能够“肉眼验证链路是否按分层运行”

---

## 需要补充的内容

### 1. 在 orchestrator 主链路加日志

输出结构类似：

```ts
[Pipeline]
route=tool/chat
perception=...
decision=...
execution=...
expression=...
postTurn=...
```

---

### 2. 标记 Expression 最终出口

确保：

* 所有最终返回前，都有统一日志点
* 能确认没有 bypass expression

---

### 3. Quick Router 命中日志

```ts
[QuickRouter]
source=rule/llm
path=tool/chat
confidence=0.xx
```

---

### 4. Post-turn 写回日志

确认：

* 是否执行
* 写回哪些类型（memory / claim / relation 等）

---

# 🧭 五、输出要求

Claude Code 必须完成：

### 1. 新增文档

* `docs/architecture/assistant-pipeline-boundary.md`

### 2. 修改文件

* 为核心模块补充职责注释（不改逻辑）

### 3. 补充日志

* orchestrator 主链路
* quick router
* expression 出口
* post-turn

---

# ⚠️ 六、执行原则

必须遵守：

* ❌ 不做大规模代码重构
* ❌ 不调整已有主流程逻辑
* ❌ 不新增复杂抽象
* ✅ 只做边界固化、注释、轻量验证
* ✅ 保持当前行为不变

---

# ✅ 七、验收标准

完成后必须满足：

* 有一份清晰的分层边界文档
* 核心模块顶部都有职责说明
* ChatCompletionEngine 明确标记为冻结层
* 主链路关键步骤可通过日志观测
* 能快速判断是否发生“跨层污染”

---
