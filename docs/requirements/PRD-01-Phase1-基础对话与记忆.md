# PRD-01 Phase1 基础对话与记忆

**依赖**：[PRD-00-总览与约定.md](PRD-00-总览与约定.md)

---

## 一、对话系统（Conversation）

### 功能描述

* 用户与 AI 进行多轮**纯聊天**（自然语言对话，不参与写代码）
* **初始不预设用户画像**：通过对话与总结逐步建立对用户的理解；用户可后续在记忆/画像中自行补充
* 默认不立即总结；支持手动总结；并且可配置启用自动总结（如 `FEATURE_AUTO_SUMMARIZE` + `AUTO_SUMMARIZE_THRESHOLD`、以及 `FEATURE_INSTANT_SUMMARIZE` 关键词即时触发）。自动总结触发 SummarizerService，把“未来仍有价值的判断”提取出来，并通过 `MemoryWriteGuardService` 的规则与置信度门控写入 mid/long 记忆（不是无条件写入）

### 需求点

* 保留最近 **N 轮对话**（可配置，默认 8）
* 每一轮对话前，由**规则/配置**决定是否注入记忆（非模型自决）
* 对话结束后默认不立即总结；当满足自动总结触发条件（即时关键词或达到阈值）时，会在后台触发总结并写入记忆
* **原始消息需持久化**（含 messageId），以便总结可回溯

---

## 二、Prompt Router（模式路由）

### 支持的模式（V1）

* `chat`：日常对话（**唯一面向用户的模式**，纯聊天）
* `summary`：只在后台触发（如手动触发、或规则/自动总结触发；由 feature flags 控制是否启用）

> ⚠️ V1 **不做 code 模式**；Router 由**规则驱动**，不是模型自决

---

## 三、记忆系统（Memory System）

### 记忆分层（强制）

##### A. Short-term Memory

* 最近对话
* 不入库 / 或短期缓存
* 不参与长期人格

##### B. Mid-term Memory（阶段记忆）

* 对话中的**阶段性结论**
* 可被覆盖
* 有来源 messageId

##### C. Long-term Memory（人格记忆）

* 稳定价值观 / 判断模式
* 写入由规则门控：例如 `MemoryWriteGuardService` 的置信度阈值（默认 `>= 0.4`）与去重/纠错/一次性事实跳过等规则决定是否写入 long（由系统保证可控，不依赖模型自决）
* 数量极少（10–30 条级别）

### Memory 数据结构（示意）

```ts
Memory {
  id: uuid
  type: 'mid' | 'long'
  content: string
  sourceMessageIds: string[]
  confidence: number
  createdAt
  updatedAt
}
```

---

## 四、记忆总结模块（Summarizer）

### 触发方式（V1）

* **手动触发**
* 规则/自动触发（如 `FEATURE_INSTANT_SUMMARIZE` 的关键词命中即时触发、或 `FEATURE_AUTO_SUMMARIZE` + `AUTO_SUMMARIZE_THRESHOLD` 的阈值触发；触发后异步执行，不阻塞聊天）

### 总结规则

* 不复述对话
* 只抽取“未来仍有价值的判断”
* 输出必须是 **抽象描述**

---

## 五、前端（Angular）Phase1 要求

### 页面

* 单一聊天窗口
* 左侧（或抽屉）：可预留「当前人格摘要」「已注入记忆」占位（Phase2 再填充）

### 操作

* 纯聊天（无模式切换）
* **手动触发总结**（自动总结在启用时也会写入记忆结果，用户可在记忆页查看对应变化）
* **查看 / 编辑记忆**

---

## 本需求达成目标

* 用户可与 AI 在本地进行多轮纯聊天，对话内容持久化（含 messageId）
* 可手动触发总结，并支持规则/自动总结在启用时写入 mid/long 记忆（由 WriteGuard / 置信度门控保证可控）
* 记忆可查看、可编辑，且总结可回溯原始对话（依赖 message 持久化）
* 为 Phase2 的记忆注入与人格提供「对话 + 记忆库」基础
