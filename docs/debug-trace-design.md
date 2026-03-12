# Debug 溯源模式 — 技术设计文档

## 1. 现状分析

当前 debug 信息分两部分：

| 现有能力 | 内容 | 问题 |
|---|---|---|
| `openclawUsed` 标签 | 仅显示 "via OpenClaw" | 只有结果，没有过程 |
| `debugMeta` 面板 | 模型信息、token 统计、feature flags、记忆候选数 | 只有静态配置/统计，无法看到**决策链路** |

**缺失的关键信息**：用户无法看到"为什么走了这条路"——意图识别判断了什么、记忆查了什么、为何调用了 OpenClaw、传了什么参数过去。

---

## 2. 目标：Pipeline 溯源 Trace

每次 `sendMessage` 返回一条 **有序的决策步骤链**，展示完整的思考过程：

```
[Step 1] 意图识别
  ├─ 输入：用户说 "北京明天天气怎么样"
  ├─ 结果：mode=task, toolNeed=openclaw, preferredSkill=weather
  ├─ 置信度：0.92
  └─ 缺失参数：无

[Step 2] 本地技能尝试：weather
  ├─ 提取城市：北京
  ├─ 调用 QWeather API
  └─ 结果：失败（API key 未配置）

[Step 3] 降级到 OpenClaw
  ├─ 任务描述："执行任务：查天气。城市为：北京。"
  ├─ sessionKey: conv_xxx
  └─ 结果：成功，返回天气数据

[Step 4] 生成回复
  ├─ 使用 buildToolResultMessages 包装工具结果
  ├─ 人格注入：小晴
  └─ LLM 生成最终回复
```

对于**纯聊天路径**，trace 也同样有价值：

```
[Step 1] 意图识别
  ├─ 结果：mode=chat, toolNeed=none
  └─ 置信度：0.85 → 走聊天路径

[Step 2] 记忆召回
  ├─ 关键词预筛：开启
  ├─ 提取关键词：["旅行", "日本"]
  ├─ 候选记忆：12 条（long: 7, mid: 5）
  ├─ LLM 精排：关闭（候选数 < 阈值 5）
  └─ 最终注入：3 条（budget 消耗 280/450 tokens）

[Step 3] Prompt 构建
  ├─ system prompt tokens: 680
  ├─ 历史轮次：8（实际 6 条消息）
  ├─ 总 token 预估：2100/3000
  └─ 是否截断：否

[Step 4] LLM 生成
  ├─ 模型：gpt-4o-mini (openai)
  └─ 回复生成完成
```

---

## 3. 数据结构设计

### 3.1 TraceStep

```typescript
interface TraceStep {
  /** 步骤序号 */
  seq: number;
  /** 步骤标签：intent | policy-decision | world-state | memory-recall | skill-attempt | openclaw | prompt-build | llm-generate | missing-params | auto-summarize | auto-evolution */
  label: string;
  /** 步骤中文名 */
  title: string;
  /** 耗时 ms */
  durationMs: number;
  /** 该步骤的结论/状态 */
  status: 'success' | 'fail' | 'skip';
  /** 该步骤的详细数据（不同 label 内容不同） */
  detail: Record<string, unknown>;
}
```

### 3.1.1 TurnTraceEvent（新 schema，当前与 TraceStep 并行）

```typescript
interface TurnTraceEvent {
  traceId: string;
  conversationId: string;
  turnId: string; // 初期可直接复用 userMessageId
  phase:
    | 'input_understanding'
    | 'context_assembly'
    | 'strategy_decision'
    | 'memory_recall'
    | 'tool_execution'
    | 'cognitive_integration'
    | 'prompt_assembly'
    | 'llm_invoke'
    | 'postprocess';
  step: string;
  component: string;
  status: 'success' | 'fail' | 'skip';
  startedAt?: string;
  durationMs: number;
  detail: Record<string, unknown>;
}
```

当前实现策略：

- 主链继续产出 `TraceStep[]`（旧协议稳定）。
- 通过 adapter 将 `TraceStep` 映射为 `TurnTraceEvent[]`（新协议并行可读）。
- 在 UI/调用方全部切换前，不移除 `trace` 字段。

### 3.2 各步骤的 detail 定义

**intent（意图识别）**
```typescript
{
  userInput: string;                    // 用户原文
  intentNormalized: DialogueIntentState; // 结构化意图结果
  policyDecision: 'chat' | 'ask_missing' | 'run_local_weather' | 'run_openclaw';
  reason: string;                       // 决策原因描述
}
```

**policy-decision（策略决策）**

策略决策步骤的 detail 中附带**管道快照**（`pipeline`），便于在 Step 2 详情中查看当前管道状态。不再单独产出 `pipeline-decision` step，管道信息归属本业务 step。

```typescript
{
  policyDecision: 'chat' | 'ask_missing' | 'run_local_weather' | 'run_openclaw';
  reason: string;
  confidence?: number;
  threshold?: number;
  taskIntent?: string;
  requiresTool?: boolean;
  missingParams?: string[];
  fallbackReason?: string;   // 本地技能失败回退 OpenClaw 时
  pipeline?: {               // 管道状态快照（currentStep / canonicalMatchSoFar 等）
    currentStep: 'idle' | 'cognition' | 'decision' | 'expression';
    events: number;
    firstSeenOrder: string[];
    canonicalOrder: string[];
    canonicalMatchSoFar: boolean;
    strictCanonical: boolean;
  };
}
```

**memory-recall（记忆召回）**
```typescript
{
  keywordPrefilter: boolean;
  extractedKeywords?: string[];         // 提取的关键词
  candidatesCount: number;              // 候选总数
  candidatesBreakdown: { long: number; mid: number };
  llmRankUsed: boolean;
  llmRankReason?: string;               // "候选数 12 > 阈值 5，触发精排"
  needDetail: boolean;
  injectedCount: number;
  memoryBudgetTokens: number;
  budgetUsed: number;                   // 实际消耗
  injectedMemories: Array<{ id: string; type: string; contentPreview: string }>;
}
```

**skill-attempt（本地技能尝试）**
```typescript
{
  skill: 'weather';
  input: Record<string, unknown>;       // { city: '北京' }
  success: boolean;
  result?: string;
  error?: string;
  fallback: 'openclaw' | 'chat' | null;
}
```

**openclaw（OpenClaw 调用）**
```typescript
{
  taskMessage: string;                  // 发给 Claw 的任务描述
  sessionKey: string;
  success: boolean;
  resultPreview?: string;               // 结果前 200 字
  error?: string;
}
```

**prompt-build（Prompt 构建）**
```typescript
{
  promptVersion: string;
  systemPromptTokens: number;
  historyRounds: number;
  actualMessagesUsed: number;
  estimatedTotalTokens: number;
  maxContextTokens: number;
  truncated: boolean;
  impressionCoreInjected: boolean;
  impressionDetailInjected: boolean;
}
```

**llm-generate（LLM 生成）**
```typescript
{
  model: { provider: string; modelName: string; isMock: boolean };
  inputMessages: number;                // 发给 LLM 的消息数
}
```

**missing-params（缺失参数追问）**
```typescript
{
  missingParams: string[];
  paramLabels: string[];                // 中文化的参数名
}
```

**world-state（世界状态）**
```typescript
// 更新时
{ updated: string[]; }                  // 本次更新的字段名（如 city、timezone）
// 槽位补全时
{ filledFromWorldState: string[]; mergedMissingParams: string[]; }
```

**auto-summarize（自动/即时总结）**
```typescript
{
  trigger: 'instant' | 'threshold';     // 即时（关键词触发）或 阈值触发
  keyword?: string;                     // 即时触发时用户输入片段
  newUserMessages?: number;            // 阈值触发时本对话新增用户消息数
  threshold?: number;                  // 阈值（如 15）
}
```

**auto-evolution（人格进化建议）**
```typescript
{
  suggestionsCount: number;             // 建议条数
  fields: string[];                    // 涉及字段（如 voiceStyle、identity）
}
```

### 3.3 响应结构变更

```typescript
// sendMessage 返回值新增字段
{
  // ... 原有字段 ...
  debugMeta?: DebugMeta;       // 保留原有（兼容）
  trace?: TraceStep[];          // 新增：有序步骤链
  // debugMeta.turnTraceEvents?: TurnTraceEvent[] // 兼容期并行输出（可选）
}
```

---

## 4. 后端采集方案

在 `ConversationService.sendMessage` 的各分支中，用一个 `TraceCollector` 工具类收集步骤：

```typescript
class TraceCollector {
  private steps: TraceStep[] = [];
  private seq = 0;

  /** 记录一个步骤 */
  add(label: string, title: string, fn: () => Promise<Record<string, unknown>>): Promise<void>;

  /** 返回完整 trace */
  getTrace(): TraceStep[];
}
```

**采集点**（在 conversation.service.ts 中插桩）：

| 位置 | label | 触发条件 |
|---|---|---|
| 意图识别后 | `intent` | `featureOpenClaw === true` |
| 策略决策后 | `policy-decision` | `featureOpenClaw === true` |
| 缺参追问 | `missing-params` | `hasMissingParams === true` |
| 天气技能尝试后 | `skill-attempt` | `preferredSkill === 'weather'` |
| OpenClaw 调用后 | `openclaw` | 走 OpenClaw 路径 |
| 记忆召回后 | `memory-recall` | 走聊天路径 |
| Prompt 构建后 | `prompt-build` | 走聊天路径 |
| LLM 生成后 | `llm-generate` | 所有路径 |

**Feature Flag 控制**：

复用 `FEATURE_DEBUG_META=true`，当此 flag 开启时同时返回 `trace`。或者新增独立 flag `FEATURE_DEBUG_TRACE=true`。

**promptVersion 一致性**：`prompt-build` 步骤中的 `promptVersion` 字段应直接从 `PromptRouterService.CHAT_PROMPT_VERSION` 等常量注入，避免与 system 中实际注入的版本标记（如 `[chat_v6]`）不一致。

---

## 5. 前端展示方案

### 5.1 替换现有 "via OpenClaw" 标签

现在的 `openclaw-tag` 只显示一个标签。改为一个可展开的 **Pipeline Badge Bar**：

**收起状态**（默认）：
```
[意图识别 ✓] → [天气技能 ✗] → [OpenClaw ✓] → [生成回复 ✓]
```
每个 badge 用颜色区分状态：绿色=success，红色=fail，灰色=skip。

**展开状态**（点击任意 badge 或展开按钮）：
显示每个步骤的 detail，类似现有 debugMeta 面板但结构化为步骤卡片。

### 5.2 纯聊天路径的展示

```
[意图: 聊天] → [记忆: 3条注入] → [Prompt: 2100 tokens] → [回复 ✓]
```

### 5.3 与现有 debugMeta 面板的关系

- `trace` 面板取代现有 `debugMeta` 的 JSON dump
- `debugMeta` 数据可以合并进 trace 的各步骤中，不再单独展示
- 保留 "调试信息" 按钮，但内容改为 trace 步骤视图

---

## 6. 实现步骤

1. **后端**：定义 `TraceStep` 类型 + `TraceCollector` 工具类
2. **后端**：在 `sendMessage` / `handleChatReply` / `handleOpenClawTask` 中插桩采集
3. **后端**：响应中加入 `trace` 字段
4. **前端**：定义 `TraceStep` 接口，`ConversationService` 解析 `trace`
5. **前端**：`ChatComponent` 新增 trace badge bar 组件
6. **前端**：点击展开显示步骤详情卡片

---

## 7. 开放问题

| # | 问题 | 建议 |
|---|---|---|
| 1 | trace 是否跟随每条 assistant 消息持久化到 DB？ | 建议不存 DB，仅实时返回（debug 用途，不需持久化） |
| 2 | 独立 flag `FEATURE_DEBUG_TRACE` 还是复用 `FEATURE_DEBUG_META`？ | 建议复用，减少配置项 |
| 3 | trace 中是否包含完整的 prompt 文本？ | 建议不包含（太大），只包含 token 统计和版本号 |
| 4 | 前端 trace 视图是跟在消息气泡下方，还是独立面板？ | 建议跟在气泡下方，更直观 |
