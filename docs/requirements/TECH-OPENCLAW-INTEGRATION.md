# 小晴 × OpenClaw 集成技术方案

> 版本：v2.0 | 日期：2026-03-17
> v2.0 变更：移除企业微信回调协议，改为直连自部署 OpenClaw；支持多 Agent 注册。

---

## 1. 设计目标

小晴擅长聊天、情感陪伴、思考引导，但不擅长"技能型"任务（查天气、发邮件、搜索、日程管理等）。
通过接入**远端 OpenClaw Agent**，让小晴在识别到用户意图需要工具时，将任务委派给 Agent 执行，拿到结果后用自己的语气回复用户。

**v2.0 新增目标**：支持多个 OpenClaw Agent 实例（如「情报喵」专注搜索情报，其他 Agent 各司其职），通过 Agent 注册表统一管理和路由。

**核心体验**：用户始终在和小晴对话，Agent 是小晴的"手"（被动工具层），用户感知不到切换。小晴主控，Agent 不拥有主控权。

---

## 2. 架构总览

```
用户
 │
 ▼
┌──────────────────────────────────────────────────────┐
│              NestJS Backend                           │
│                                                       │
│  ┌──────────┐    ┌──────────────┐                     │
│  │ Intent   │───▶│ Conversation │                     │
│  │ Service  │    │ Service      │                     │
│  └──────────┘    └──────┬───────┘                     │
│                         │                             │
│          toolNeed?      │                             │
│      ┌──────────────────┼──────────────┐              │
│      │                  │              │              │
│   'none'           'openclaw'      'memory'           │
│      │                  │              │              │
│      ▼                  ▼              ▼              │
│  直接 LLM 回复   ┌─────────────┐  记忆注入回复        │
│                  │ OpenClaw    │                       │
│                  │ Service     │                       │
│                  └──────┬──────┘                       │
│                         │                             │
│                  ┌──────┴──────┐                       │
│                  │  Registry   │                       │
│                  │  Service    │                       │
│                  └──┬───┬──┬──┘                       │
│                     │   │  │                          │
└─────────────────────┼───┼──┼──────────────────────────┘
                      │   │  │  JSON + Bearer Token
                      ▼   ▼  ▼
               ┌────┐ ┌────┐ ┌────┐
               │情报│ │Code│ │... │  自部署 OpenClaw 实例
               │ 喵 │ │Rev │ │    │
               └────┘ └────┘ └────┘
```

---

## 3. 意图识别 → 路由分流

### 3.1 现有基础

项目已有 `IntentService`，输出 `DialogueIntentState`，其中 `toolNeed` 字段已包含 `'openclaw'` 枚举值；`sendMessage()` 已接入意图分流，仅当 toolNeed === 'openclaw' 且 confidence 达标时才调用 Agent。

### 3.2 意图分流逻辑

当 `toolNeed === 'openclaw'` 且 `confidence >= 0.7` 时进入工具路径；**对「明确意图 + 明确结果格式」的任务（如查天气），优先执行本地 Skill，失败再走 OpenClaw**。

- 意图状态新增 `preferredSkill`：当明确为**查天气**时，意图输出 `preferredSkill: "weather"`。
- 若 `preferredSkill === 'weather'`：先调用本地天气 Skill（和风 API）；成功则用其结果走小晴转述并返回；失败或未配置 KEY 则 **fallback** 到 `handleOpenClawTask`。
- 其他 openclaw 任务（无 preferredSkill 或非 weather）：直接 `handleOpenClawTask`。
- 缺必要参数（如查天气缺城市）时仍走 `handleMissingParamsReply`，不调本地 Skill 也不调 OpenClaw。

### 3.3 意图 Prompt 与最小规则

**最小规则**（避免闲聊/思考误走 Agent）：
- **不得标为 openclaw**：闲聊、讨论、解释、思考、情绪回应、仅表达想法无明确执行意图 → 选 none 或 memory。
- **才标为 openclaw**：明确要「执行/查询/操作/调用外部能力」——例如「帮我查/搜/发/算/看一下…」、实时信息（天气/新闻/时间）、与外部系统交互（邮件/日历/文件）。

### 3.4 缺失参数追问（已实现）

当 `toolNeed === 'openclaw'` 且意图推断出缺少必要参数（如查天气缺城市）时，意图模块输出 `missingParams`。ConversationService 若 `missingParams?.length > 0`，走 `handleMissingParamsReply`：用小晴语气自然追问用户补全信息。

### 3.5 天气 Skill 来源

本仓库可执行的天气能力见 **本地天气 Skill**：`backend/src/action/skills/weather`（和风天气 API）；市场来源见 [docs/skills/clawhub-skills.md](../skills/clawhub-skills.md)。

---

## 4. OpenClaw 多 Agent 架构（v2.0）

### 4.1 模块结构

```
backend/src/openclaw/
├── openclaw.module.ts           # NestJS 模块
├── openclaw-registry.service.ts # 多 Agent 注册表（v2.0 新增）
├── openclaw.service.ts          # 核心调用逻辑（简化后直连 JSON）
├── openclaw.types.ts            # 类型定义（含 AgentConfig）
└── task-formatter.service.ts    # 将用户意图格式化为任务描述
```

### 4.2 Agent 配置类型

```typescript
interface OpenClawAgentConfig {
  id: string;              // 唯一标识，如 'intel-cat'
  name: string;            // 显示名称，如 '情报喵'
  baseUrl: string;         // API 基地址
  token: string;           // Bearer Token
  signKey?: string;        // 可选 HMAC-SHA256 签名密钥
  capabilities: string[];  // 能力标签，用于路由选择
  timeout?: number;        // 请求超时秒数，默认 60
  apiStyle?: 'json' | 'chat'; // API 风格
  taskPath?: string;       // 请求路径，默认 '/task'
}
```

### 4.3 注册表（OpenClawRegistryService）

管理多个 Agent 实例，配置来源：

1. **OPENCLAW_* 单实例变量**（向后兼容）：自动构造默认 Agent
2. **OPENCLAW_AGENTS 环境变量**（JSON 数组）：注册多个 Agent，ID 冲突时覆盖单实例配置

查询方法：
- `getAgent(id)` — 按 ID 精确查找
- `getDefaultAgent()` — 获取默认 Agent
- `findByCapability(cap)` — 按能力标签查找
- `listAll()` — 列出全部

### 4.4 通信协议

统一为 **JSON + Bearer Token**，无 XML、无加密、无企业微信回调协议。

**json 风格**（默认）：
- `POST {baseUrl}{taskPath}`
- Body: `{ message, sessionKey, timeoutSeconds }`
- Headers: `Authorization: Bearer {token}`
- 可选: `X-Timestamp` + `X-Signature` (HMAC-SHA256)

**chat 风格**（OpenAI 兼容）：
- `POST {baseUrl}{taskPath}`
- Body: `{ model: 'openclaw', messages: [{ role: 'user', content }] }`

### 4.5 核心请求/响应类型

```typescript
interface OpenClawTaskRequest {
  message: string;
  sessionKey?: string;
  timeoutSeconds?: number;
  agentId?: string;          // 指定 Agent（不指定用默认）
}

interface OpenClawTaskResult {
  success: boolean;
  content: string;
  error?: string;
  agentId?: string;          // 实际执行的 Agent ID
}
```

---

## 5. Conversation Service 集成

### 5.1 OpenClaw 处理分支

当意图命中 openclaw 时：
1. `TaskFormatter.formatTask()` — 格式化任务描述
2. `OpenClawService.delegateTask()` — 委派到 Agent
3. `PromptRouter.buildToolResultMessages()` — 包装结果
4. LLM 生成小晴风格回复
5. 保存助手消息

### 5.2 结果包装 Prompt

小晴用自己的语气转述 Agent 结果，规则：
- 不说"工具返回了""系统显示"等，就像自己知道的一样
- 工具出错时委婉告知，建议换个方式
- 保持简洁自然

---

## 6. 环境变量

```bash
# ── OpenClaw 集成（远端 Agent 直连，JSON + Bearer Token）──
FEATURE_OPENCLAW=false

# 方式一：单 Agent 快速配置（向后兼容）
OPENCLAW_BOT_ID=               # Agent ID
OPENCLAW_TOKEN=                # Bearer Token
OPENCLAW_SIGN_KEY=             # 可选 HMAC 签名密钥
OPENCLAW_PLUGIN_BASE_URL=      # API 基地址
OPENCLAW_TIMEOUT_SECONDS=60
OPENCLAW_CONFIDENCE_THRESHOLD=0.7

# 方式二：多 Agent 注册（JSON 数组）
OPENCLAW_AGENTS='[{"id":"intel-cat","name":"情报喵","baseUrl":"https://your-server/api","token":"xxx","capabilities":["web-search","news"],"timeout":60}]'
```

---

## 7. 前端变化

### 7.1 响应类型

当 `openclawUsed === true` 时，可在消息气泡下方显示一个小标签 `🔧 已通过工具执行`。

---

## 8. 完整消息流

```
用户输入 "帮我查一下北京明天的天气"
  │
  ▼
ConversationService.sendMessage()
  ├─ 1. 保存 user message
  ├─ 2. 获取最近对话 + persona
  ├─ 3. IntentService.recognize()
  │     → { toolNeed: 'openclaw', confidence: 0.92, ... }
  │
  ├─ 4. toolNeed === 'openclaw' && confidence >= 0.7
  │     → 进入 OpenClaw 分支
  │
  ├─ 5. TaskFormatter.formatTask()
  │     → "执行任务：查天气。地点：北京。时间：明天。"
  │
  ├─ 6. OpenClawService.delegateTask()
  │     → POST Agent API (JSON + Bearer Token)
  │     → 返回 "北京明天：晴，最高 12°C，最低 2°C"
  │
  ├─ 7. PromptRouter.buildToolResultMessages()
  ├─ 8. LLM.generate()
  │     → "北京明天是晴天呢～最高 12 度，记得穿厚点哦。"
  │
  └─ 9. 保存 assistant message → 返回前端
```

---

## 9. 降级与容错

| 场景 | 处理方式 |
|------|---------|
| 本地 Weather Skill 未配置或失败 | fallback 到 OpenClaw Agent |
| OpenClaw 未启用 | `FEATURE_OPENCLAW=false` 时跳过；小晴说"我现在没法帮你查" |
| Agent 超时 | 超过 timeout → 返回 toolError |
| 意图识别不确定 | `confidence < 0.7` → 不走 OpenClaw，走普通聊天 |
| 指定 Agent 不存在 | 返回错误，不降级到默认 Agent |
| 所有 Agent 不可用 | 小晴委婉回复 |

---

## 10. 安全考量

1. **鉴权**：Bearer Token + 可选 HMAC-SHA256 签名，通过 `.env` 管理，不入 Git。
2. **任务描述不含敏感信息**：TaskFormatter 只传递用户输入和必要上下文，不传递记忆/人格数据。
3. **结果不自动写入记忆**：Agent 执行结果走正常聊天流程。

---

## 11. 实施步骤

### Phase A：基础管线（已完成）
1. ✅ 创建 `openclaw/` 模块（Service + Module + Types）
2. ✅ 在 `sendMessage()` 中接入 IntentService 分流
3. ✅ 实现 `buildToolResultMessages()` 结果包装
4. ✅ 添加 `FEATURE_OPENCLAW` feature flag

### Phase A2：多 Agent 支持（v2.0，已完成）
5. ✅ 创建 `OpenClawRegistryService` 多 Agent 注册表
6. ✅ 移除企业微信回调协议代码，简化为 JSON 直连
7. ✅ `OpenClawService` 支持 `agentId` 路由
8. ✅ 更新环境变量配置（`OPENCLAW_AGENTS`）

### Phase B：体验优化
9. 前端展示 "执行中..." loading 状态
10. Agent 能力发现（`/capabilities` 端点）
11. 按能力标签自动路由到最优 Agent
12. OpenClaw 结果摘要（过长时截断）

### Phase C：进阶
13. Agent 健康监控与自动降级
14. 工具执行历史记录
15. 用户可配置 Agent 偏好
