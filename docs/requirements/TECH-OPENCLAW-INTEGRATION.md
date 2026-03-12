# 小晴 × OpenClaw 集成技术方案

> 版本：v1.0 | 日期：2026-02-28

---

## 1. 设计目标

小晴擅长聊天、情感陪伴、思考引导，但不擅长"技能型"任务（查天气、发邮件、搜索、日程管理等）。
通过接入**腾讯 Claw 插件/托管**，让小晴在识别到用户意图需要工具时，将任务委派给 Claw 执行，拿到结果后用自己的语气回复用户。

**核心体验**：用户始终在和小晴对话，Claw 是小晴的"手"（被动工具层），用户感知不到切换。小晴主控，Claw 不拥有主控权。

---

## 2. 架构总览

```
用户
 │
 ▼
┌─────────────────────────────────────────────────┐
│              NestJS Backend                      │
│                                                  │
│  ┌──────────┐    ┌──────────────┐                │
│  │ Intent   │───▶│ Conversation │                │
│  │ Service  │    │ Service      │                │
│  └──────────┘    └──────┬───────┘                │
│                         │                        │
│          toolNeed?      │                        │
│      ┌──────────────────┼──────────────┐         │
│      │                  │              │         │
│   'none'           'openclaw'      'memory'      │
│      │                  │              │         │
│      ▼                  ▼              ▼         │
│  直接 LLM 回复   ┌─────────────┐  记忆注入回复    │
│                  │ OpenClaw    │                  │
│                  │ Service     │                  │
│                  └──────┬──────┘                  │
│                         │ HTTP (botId+token+signKey)
└─────────────────────────┼────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  腾讯 Claw 插件 API   │
              │  (OPENCLAW_PLUGIN_    │
              │   BASE_URL)           │
              │  Skills: 天气/邮件/   │
              │  搜索/日程/文件...    │
              └───────────────────────┘
```

---

## 3. 意图识别 → 路由分流

### 3.1 现有基础

项目已有 `IntentService`，输出 `DialogueIntentState`，其中 `toolNeed` 字段已包含 `'openclaw'` 枚举值；`sendMessage()` 已接入意图分流，仅当 toolNeed === 'openclaw' 且 confidence 达标时才调用 Claw。

### 3.2 意图分流逻辑

当 `toolNeed === 'openclaw'` 且 `confidence >= 0.7` 时进入工具路径；**对「明确意图 + 明确结果格式」的任务（如查天气），优先执行本地 Skill，失败再走 OpenClaw**。

- 意图状态新增 `preferredSkill`：当明确为**查天气**时，意图输出 `preferredSkill: "weather"`。
- 若 `preferredSkill === 'weather'`：先调用本地天气 Skill（和风 API）；成功则用其结果走小晴转述并返回（可带 `localSkillUsed: 'weather'`）；失败或未配置 KEY 则 **fallback** 到 `handleOpenClawTask`。
- 其他 openclaw 任务（无 preferredSkill 或非 weather）：直接 `handleOpenClawTask`。
- 缺必要参数（如查天气缺城市）时仍走 `handleMissingParamsReply`，不调本地 Skill 也不调 OpenClaw。

### 3.3 意图 Prompt 与最小规则

**最小规则**（避免闲聊/思考误走 Claw）：
- **不得标为 openclaw**：闲聊、讨论、解释、思考、情绪回应、仅表达想法无明确执行意图 → 选 none 或 memory。
- **才标为 openclaw**：明确要「执行/查询/操作/调用外部能力」——例如「帮我查/搜/发/算/看一下…」、实时信息（天气/新闻/时间）、与外部系统交互（邮件/日历/文件）、或小晴自身无法回答的事实性/实时数据需求。

意图 prompt 中已包含：仅当用户明确要求执行、查询或使用外部能力时选 openclaw；纯闲聊、讨论、解释、思考、情绪回应一律选 none（或 memory），不选 openclaw。

### 3.4 缺失参数追问（已实现）

当 `toolNeed === 'openclaw'` 且意图推断出缺少必要参数（如查天气缺城市）时，意图模块输出 `missingParams`（如 `["city"]`）。Conversation 分流时若 `missingParams?.length > 0`，**不**调用本地 Skill 也不调用 OpenClaw，改为走 `handleMissingParamsReply`：用小晴语气自然追问用户补全信息，不提及「系统」「参数」等词。

### 3.5 天气 Skill 来源

本仓库可执行的天气能力见 **本地天气 Skill**：`backend/src/skills/weather`（和风天气 API）；市场来源与 ClawHub/OpenClaw 的 weather skill 安装方式见 [docs/skills/weather-skill-source.md](../skills/weather-skill-source.md)。

### 3.6 ClawHub 市场与推荐 Skill

ClawHub 市场概览、skill-creator 来源说明，以及适合小晴项目的 5 个推荐 skill（Summarize、Tavily Web Search、Capability Evolver、self-improving-agent、Wacli/ByteRover）见 [docs/skills/clawhub-skills.md](../skills/clawhub-skills.md)。

---

## 4. OpenClaw Service 设计

### 4.1 模块结构

```
backend/src/openclaw/
├── openclaw.module.ts       # NestJS 模块
├── openclaw.service.ts      # 核心调用逻辑
├── openclaw.types.ts        # 类型定义
└── task-formatter.service.ts # 将用户意图格式化为 OpenClaw 任务描述
```

### 4.2 核心类型

```typescript
// openclaw.types.ts（无 Gateway/hooks 概念）

export interface OpenClawTaskRequest {
  message: string;          // 发给 Claw 插件的任务描述
  sessionKey?: string;      // 会话隔离键
  timeoutSeconds?: number;
}

export interface OpenClawTaskResult {
  success: boolean;
  content: string;          // Claw 返回的原始结果
  error?: string;
}

export interface OpenClawToolInvokeRequest {
  tool: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
}
```

鉴权由环境变量提供：`OPENCLAW_BOT_ID`、`OPENCLAW_TOKEN`、`OPENCLAW_SIGN_KEY`；请求发往 `OPENCLAW_PLUGIN_BASE_URL`（腾讯 Claw 插件 API 基地址）。

### 4.3 Service 实现（腾讯 Claw 插件/托管）

- **构造函数**：读取 `OPENCLAW_BOT_ID`、`OPENCLAW_TOKEN`、`OPENCLAW_SIGN_KEY`、`OPENCLAW_PLUGIN_BASE_URL`，不再使用 Gateway/Hooks 相关配置。
- **delegateTask**：向插件 API 的任务委派路径发送 POST，请求体含 `botId`、`message`、`sessionKey`、`timeoutSeconds`；鉴权为 Bearer token + 可选 signKey 签名（如 X-Timestamp + X-Signature）。具体 URL 路径与签名算法以腾讯 Claw 插件/托管文档为准。
- **invokeTool**：若插件支持直接调工具则调用对应接口，否则转为任务委派（同上鉴权）。
- **isAvailable**：对插件 API 做可达性检查（如 GET /health），使用同一套 botId/token/signKey。
- 无 Gateway、Webhook、回调服务器；Claw 调用对小晴透明，结果仅作工具执行结果由小晴转述。

### 4.4 任务格式化

```typescript
// task-formatter.service.ts

@Injectable()
export class TaskFormatterService {
  /**
   * 将用户原始输入 + 意图 → 格式化为 OpenClaw 能理解的任务描述
   * 保持简洁，不要注入小晴人格，OpenClaw 只需要知道"做什么"
   */
  formatTask(
    userInput: string,
    intent: DialogueIntentState,
    recentContext?: Array<{ role: string; content: string }>,
  ): string {
    // 提取最近 2 轮对话作为上下文（帮助 OpenClaw 理解指代）
    const contextLines = (recentContext || [])
      .slice(-4)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const parts: string[] = [];

    if (contextLines) {
      parts.push(`对话上下文：\n${contextLines}`);
    }

    parts.push(`用户请求：${userInput}`);
    parts.push('请直接执行并返回结果，不需要确认。返回纯文本结果即可。');

    return parts.join('\n\n');
  }
}
```

---

## 5. Conversation Service 集成

### 5.1 新增 OpenClaw 处理分支

```typescript
// conversation.service.ts — 新增方法

private async handleOpenClawTask(
  conversationId: string,
  userMsg: { id: string; role: string; content: string; createdAt: Date },
  recent: Array<{ role: string; content: string }>,
  intent: DialogueIntentState,
  userInput: string,
  personaDto: PersonaDto,
): Promise<SendMessageResult> {

  // 1. 格式化任务
  const taskMessage = this.taskFormatter.formatTask(userInput, intent, recent);

  // 2. 调用 OpenClaw
  const clawResult = await this.openclaw.delegateTask({ message: taskMessage });

  // 3. 构建"结果包装 prompt"——让小晴用自己的语气回复
  const wrapMessages = this.router.buildToolResultMessages({
    personaText: personaDto.currentPersonaText,
    userInput,
    toolResult: clawResult.success ? clawResult.content : null,
    toolError: clawResult.error || null,
  });

  // 4. LLM 生成小晴风格的回复
  const replyContent = await this.llm.generate(wrapMessages);

  // 5. 保存助手消息
  const assistantMsg = await this.prisma.message.create({
    data: { conversationId, role: 'assistant', content: replyContent },
  });

  return {
    userMessage: { id: userMsg.id, role: userMsg.role, content: userMsg.content, createdAt: userMsg.createdAt },
    assistantMessage: { id: assistantMsg.id, role: assistantMsg.role, content: assistantMsg.content, createdAt: assistantMsg.createdAt },
    injectedMemories: [],
    openclawUsed: true,  // 新增字段，前端可据此展示状态
  };
}
```

### 5.2 结果包装 Prompt（PromptRouter 新增）

```typescript
// prompt-router.service.ts — 新增

buildToolResultMessages(ctx: {
  personaText: string;
  userInput: string;
  toolResult: string | null;
  toolError: string | null;
}): ChatCompletionMessageParam[] {
  const systemContent = [
    ctx.personaText,
    '',
    '你刚才帮用户执行了一个任务（通过工具完成），下面是结果。',
    '请用你自己的语气把结果自然地告诉用户。',
    '规则：',
    '- 不要说"工具返回了"、"系统显示"这类话，就像是你自己知道的一样',
    '- 如果工具出错了，委婉地告诉用户你没能完成，可以建议换个方式',
    '- 保持简洁自然',
  ].join('\n');

  const userContent = ctx.toolResult
    ? `用户说：${ctx.userInput}\n\n执行结果：\n${ctx.toolResult}`
    : `用户说：${ctx.userInput}\n\n执行失败：${ctx.toolError || '未知错误'}`;

  return [
    { role: 'system' as const, content: systemContent },
    { role: 'user' as const, content: userContent },
  ];
}
```

---

## 6. 环境变量

```bash
# backend/.env — 腾讯 Claw 插件/托管（仅 botId + token + signKey，无 Gateway/Hooks）

OPENCLAW_BOT_ID=          # 机器人 ID（平台/企业微信侧提供）
OPENCLAW_TOKEN=           # 鉴权 token（平台/企业微信侧提供）
OPENCLAW_SIGN_KEY=        # 签名密钥（平台提供，用于 X-Timestamp + X-Signature）
OPENCLAW_PLUGIN_BASE_URL= # 腾讯 Claw 插件 API 基地址（企业微信网关地址）
OPENCLAW_TASK_PATH=wecom # 任务委派路径，企业微信统一入口用 wecom（推荐）
OPENCLAW_TIMEOUT_SECONDS=60
OPENCLAW_CONFIDENCE_THRESHOLD=0.7
FEATURE_OPENCLAW=false    # 默认关闭，仅工具型请求时委派任务
```

**wecom 接口约定**（`OPENCLAW_TASK_PATH=wecom` 时）：

- **路径**：`{OPENCLAW_PLUGIN_BASE_URL}/wecom`（不带 v1）
- **请求头**：`Authorization: Bearer {OPENCLAW_TOKEN}`；若配置了 `OPENCLAW_SIGN_KEY` 且非 GET，则增加 `X-Timestamp`、`X-Signature`（对 `timestamp + body` 做 HMAC-SHA256）
- **加密模式**（配置了 `OPENCLAW_WECOM_ENCODING_AES_KEY`）：采用 **WXBizMsgCrypt 验证 URL 风格** — **GET** 请求，query 含 `msg_signature`、`timestamp`、`nonce`、`echostr`。echostr = 对「用户消息」按企业微信文档加密后 Base64；签名 = sha1(sort(token, timestamp, nonce, echostr))；receiveId = 企业 ID（corpid）。无 body。
- **非加密模式**：**POST**，`Content-Type: application/json`，请求体 `{ "botId": string, "message": string, "sessionKey": string, "timeoutSeconds": number }` 或按 `OPENCLAW_WECOM_BODY_STYLE`。
- **响应**：网关返回的纯文本或 JSON 文本，小晴侧按原文作为工具结果转述

**企业微信加解密参数与官方文档对照**（参考 [企业微信加解密说明](https://developer.work.weixin.qq.com/document/path/90968)）：

| 官方/文档含义 | 本仓 env / 用途 | 说明 |
|---------------|-----------------|------|
| **Token**（接收消息配置） | `OPENCLAW_WECOM_TOKEN`（缺省 `OPENCLAW_TOKEN`） | 参与 URL 签名：`msg_signature = sha1(sort(token, timestamp, nonce, msg_encrypt))` |
| **EncodingAESKey**（43 字符） | `OPENCLAW_WECOM_ENCODING_AES_KEY` | 解密/加密密钥，Base64 解码后 AES-256-CBC |
| **receiveId**（企业应用回调） | `OPENCLAW_WECOM_CORP_ID`（不填则用 `OPENCLAW_BOT_ID`） | 企业应用回调固定为**企业 ID（corpid）**；加密包尾部校验 + 明文 XML `ToUserName` |
| **timestamp** | 生成 | URL query，Unix 秒，参与签名 |
| **nonce** | 生成 | URL query，随机串，参与签名 |
| **msg_signature** | 计算 | URL query，十六进制小写 |
| **msg_encrypt** | 计算后 Base64 | 请求体 JSON 字段 `Encrypt` 传递 |
| 明文 XML **ToUserName** | = receiveId（企业 ID） | 接收方 = 企业 CorpID |
| 明文 XML **FromUserName** | = sessionKey | 发送方，本仓用于会话隔离 |
| 明文 XML **AgentID** | `OPENCLAW_WECOM_AGENT_ID`（不填则 `1`） | 企业应用 id，整型 |
| 明文 XML **CreateTime / MsgType / Content / MsgId** | 生成 | 与官方应用消息格式一致 |

---

## 7. 前端变化

### 7.1 响应类型扩展

```typescript
// core/models/message.model.ts

export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage: Message;
  injectedMemories: MemoryInject[];
  openclawUsed?: boolean;  // 新增
}
```

### 7.2 UI 提示（可选）

当 `openclawUsed === true` 时，可在消息气泡下方显示一个小标签：

```
🔧 已通过工具执行
```

这只是信息展示，不影响交互。

---

## 8. 完整消息流（时序图）

```
用户输入 "帮我查一下北京明天的天气"
  │
  ▼
ConversationService.sendMessage()
  │
  ├─ 1. 保存 user message
  ├─ 2. 获取最近对话 + persona
  ├─ 3. IntentService.recognize()
  │     → { toolNeed: 'openclaw', confidence: 0.92, mode: 'task', ... }
  │
  ├─ 4. toolNeed === 'openclaw' && confidence >= 0.7
  │     → 进入 OpenClaw 分支
  │
  ├─ 5. TaskFormatter.formatTask()
  │     → "用户请求：帮我查一下北京明天的天气\n请直接执行并返回结果。"
  │
  ├─ 6. OpenClawService.delegateTask()
  │     → POST 腾讯 Claw 插件 API（botId + token + signKey）
  │     → Claw 调用天气 Skill
  │     → 返回 "北京明天：晴，最高 12°C，最低 2°C，东北风 3 级"
  │
  ├─ 7. PromptRouter.buildToolResultMessages()
  │     → system: "你刚才帮用户执行了一个任务..."
  │     → user: "用户说：帮我查一下北京明天的天气\n执行结果：北京明天..."
  │
  ├─ 8. LLM.generate()
  │     → "北京明天是晴天呢～最高 12 度，最低 2 度，有点冷，记得穿厚点哦。"
  │
  └─ 9. 保存 assistant message → 返回前端

用户看到：
┌─────────────────────────────────────────┐
│ 我：帮我查一下北京明天的天气             │
│                                          │
│ 小晴：北京明天是晴天呢～最高 12 度，     │
│ 最低 2 度，有点冷，记得穿厚点哦。        │
│                        🔧 已通过工具执行  │
└─────────────────────────────────────────┘
```

---

## 9. 降级与容错

| 场景 | 处理方式 |
|------|---------|
| 本地 Weather Skill 未配置或调用失败 | 查天气时优先走本地 Skill；未配置 `QWEATHER_API_KEY` 或和风 API 失败 → fallback 到 OpenClaw |
| OpenClaw 未启动 | `FEATURE_OPENCLAW=false` 时完全跳过；开启时 `isAvailable()` 检查失败 → fallback 到聊天回复，小晴说"我现在没法帮你查，你可以自己试试" |
| OpenClaw 超时 | 超过 `OPENCLAW_TIMEOUT_SECONDS` → 返回 toolError，小晴回复"查了好久没查到" |
| 意图识别不确定 | `confidence < 0.7` → 不走 OpenClaw，走普通聊天 |
| OpenClaw 返回空结果 | 视为 toolError，小晴委婉回复 |

---

## 10. 安全考量

1. **鉴权仅用平台三件套**：botId + token + signKey 通过 `.env` 管理，不入 Git；signKey 不暴露。
2. **插件 API 基地址**：按腾讯文档配置 `OPENCLAW_PLUGIN_BASE_URL`，不默认 localhost。
3. **任务描述不含敏感信息**：TaskFormatter 只传递用户输入和必要上下文，不传递记忆/人格数据。
4. **结果不自动写入记忆**：Claw 执行结果走正常聊天流程，如需记忆仍需手动总结。

---

## 11. 实施步骤

### Phase A：基础管线（最小可用）

1. 创建 `openclaw/` 模块（Service + Module + Types）
2. 在 `sendMessage()` 中接入 IntentService 做分流
3. 增强意图 prompt 的 `toolNeed` 判断描述
4. 实现 `buildToolResultMessages()` 结果包装
5. 添加 `FEATURE_OPENCLAW` feature flag
6. 前端 `openclawUsed` 字段透传

### Phase B：体验优化

7. 前端展示 "执行中..." loading 状态（OpenClaw 调用可能较慢）
8. 意图分类缓存（同一轮对话内复用）
9. 常见任务的快捷识别（不经 LLM 意图判断，regex 匹配 "帮我查天气" 等）
10. OpenClaw 结果摘要（结果过长时先截断再给 LLM 包装）

### Phase C：进阶

11. 支持多轮工具对话：缺必要参数时小晴代为追问已实现（intent 输出 missingParams，缺则追问不转发 OpenClaw）；若 OpenClaw 侧需多轮交互可再扩展
12. 工具执行历史记录（新表 `ToolExecution`，便于回溯）
13. 用户可配置哪些任务允许走 OpenClaw

---

## 12. 腾讯 Claw 插件/托管 API（wecom）

无自建 Gateway、Webhook、回调服务器。任务委派采用**企业微信统一入口 wecom**：`POST {BASE_URL}/wecom`，请求体 `botId`、`message`、`sessionKey`、`timeoutSeconds`，鉴权 Bearer token + 可选 X-Timestamp/X-Signature（signKey）。具体以腾讯/企业微信侧提供的文档为准。

---

## 13. 企业微信侧需提供 / 可能缺失项

对接 wecom 时，**企业微信/腾讯 Claw 托管侧**需提供或确认：

| 项 | 说明 | 当前状态 |
|----|------|----------|
| **网关基地址** | `OPENCLAW_PLUGIN_BASE_URL`，即 wecom 所在主机与端口 | 已配置则可用 |
| **机器人 ID** | `OPENCLAW_BOT_ID`，对应企业微信应用/机器人 | 需企业微信侧在应用或 Claw 托管里创建并下发 |
| **鉴权 Token** | `OPENCLAW_TOKEN`，Bearer 鉴权 | 需企业微信/托管侧生成并下发 |
| **签名密钥** | `OPENCLAW_SIGN_KEY`，用于请求签名（若网关要求） | 若网关不要求签名可留空 |
| **wecom 请求体/响应体规范** | 若除 `botId/message/sessionKey/timeoutSeconds` 外还有必填字段，或响应非纯文本 | 需腾讯/企业微信提供文档，便于对齐解析 |
| **query 参数要求** | 若网关要求企业微信回调风格 | 本仓已支持：`msg_signature`、`timestamp`、`nonce`（见上表「企业微信加解密参数与官方文档对照」） |
| **企业 ID（corpid）** | `OPENCLAW_WECOM_CORP_ID` | 企微后台「我的企业」→ 企业 ID；加密时作 receiveId 与明文 ToUserName |
| **应用 id（AgentID）** | `OPENCLAW_WECOM_AGENT_ID` | 企微应用详情中的 AgentID（整型，如 1000002）；明文 XML 必填 |

本仓仅作为调用方：按上述约定发起 POST，不负责企业微信应用创建、回调配置、或托管侧 Claw/Skill 配置。若你方环境 wecom 已通，请确认网关要求的请求体与 query 是否与上文一致；不一致时提供规范即可改本侧实现。
