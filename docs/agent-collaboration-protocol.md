# 小晴 Agent 协作协议

> 状态：Working Draft v1.1（已对齐当前仓库实现）  
> 维护方：小晴仓库  
> 适用范围：小晴 <-> 小勤，以及未来接入的其他外部 Agent  
> 本文是小晴侧的统一协作协议基线，高于单个 Agent 的临时接法。

---

## 1. 目标

本协议用于定义多 Agent 协作时的统一约束，重点保证：

- 小晴和其他 Agent 都可以成为用户入口
- 前台不是平权群聊，不做多人格抢答
- Agent 间通信必须走受控专用通道，不能把普通自然语言当内部指令
- 用户能看到代理回执和协作轨迹
- 小晴保留自己的基础能力，不把提醒、打卡、简单记录全部 handoff
- 主记忆和人格审批权归小晴，其他 Agent 只能提交 `memory proposal`

---

## 2. 核心原则

### 2.1 单前台、非群聊

- 每条用户线程只有一个 `entryAgentId`
- `entryAgentId` 对应当前前台 Agent
- 协作 Agent 不应在前台直接插话
- 前台 Agent 负责最终对用户呈现

### 2.2 Agent Bus 不是普通消息

- Agent 之间的委托必须通过结构化协议发送
- 普通 `Message.content` 不能被当作内部指令解释
- 任何内部委托都必须可审计、可追踪、可拒绝

### 2.3 小晴是主记忆所有者

- 小晴拥有主记忆、主 Persona、主长期画像的最终审批权
- 外部 Agent 只能返回 `memory proposal`
- 外部 Agent 不得直接写入小晴的长期记忆、人格、系统设定

### 2.4 协作结果不等于人格输出

- 执行 Agent 返回的是“结构化执行结果”
- 前台 Agent 负责以自己的口吻向用户组织最终表达
- 这样可以防止人格漂移和远端 Agent 直接覆盖前台语气

---

## 3. 术语

| 术语 | 含义 |
|------|------|
| `entryAgentId` | 当前前台用户入口 Agent |
| `requesterAgentId` | 发起委托的 Agent |
| `executorAgentId` | 接收委托并执行的 Agent |
| `AgentDelegation` | 一条受控委托主记录 |
| `AgentDelegationEvent` | 委托过程中的状态事件 |
| `agent_receipt` | 前台展示“已转达/已接收”的回执消息 |
| `agent_result` | 前台展示“执行结果/失败结果”的结果消息 |
| `memory proposal` | 外部 Agent 提交给小晴审批的记忆提议 |

---

## 4. 统一状态模型

### 4.1 Delegation Status

```text
queued -> acknowledged -> running -> completed
queued -> acknowledged -> running -> failed
queued -> cancelled
acknowledged -> cancelled
running -> cancelled
```

### 4.2 Delegation Event Type

推荐统一使用以下事件名：

- `created`
- `acknowledged`
- `started`
- `progress`
- `completed`
- `failed`
- `cancelled`
- `receipt_projected`
- `result_projected`

---

## 5. 统一协议对象

## 5.1 Delegation Request

这是 Agent 间最核心的委托载荷。推荐所有 Agent 最终都支持这个 JSON 结构。

```json
{
  "schemaVersion": 1,
  "delegationId": "dlg_01H...",
  "requestType": "assist_request",
  "requester": {
    "agentId": "xiaoqin",
    "conversationRef": "remote-conv-123",
    "messageId": "msg_456"
  },
  "executor": {
    "agentId": "xiaoqing"
  },
  "title": "帮忙分析并回复",
  "userFacingSummary": "请小晴帮忙看看这件事",
  "taskIntent": "relationship_advice",
  "userInput": "我最近和朋友有点别扭，想请小晴帮我分析",
  "slots": {
    "tone": "gentle"
  },
  "contextExcerpt": [
    {
      "role": "user",
      "content": "用户原始消息"
    },
    {
      "role": "assistant",
      "content": "前台 Agent 已做的简短承接"
    }
  ],
  "memoryPolicy": "proposal_only",
  "responseContract": {
    "mode": "sync",
    "returnViaAgentId": "xiaoqin",
    "returnToConversationRef": "remote-conv-123",
    "sourceMessageId": "msg_456"
  },
  "extra": {
    "priority": "normal"
  }
}
```

字段说明：

- `delegationId`
  - 由请求方生成，要求全局唯一
  - 用于幂等、对账、追踪
- `requestType`
  - 当前推荐值：`assist_request`、`memory_proposal`、`capability_fallback`
- `requester.agentId`
  - 发起方 Agent 标识
- `requester.conversationRef`
  - 发起方自己的会话引用，不要求是小晴本地会话 ID
- `executor.agentId`
  - 目标执行 Agent
- `contextExcerpt`
  - 只允许精简片段，不应直接复制整段会话
- `memoryPolicy`
  - `main_owner_only`
  - `proposal_only`
  - `no_memory`
- `responseContract`
  - 定义结果如何返回给请求方

### 5.2 Delegation Result

这是执行方返回给请求方的统一结果结构。

```json
{
  "schemaVersion": 1,
  "delegationId": "dlg_01H...",
  "requesterAgentId": "xiaoqin",
  "executorAgentId": "xiaoqing",
  "status": "completed",
  "summary": "小晴已完成分析",
  "content": "这是可直接给前台 Agent 进一步组织的结果正文",
  "structuredResult": {
    "category": "advice"
  },
  "memoryProposals": [
    {
      "proposalId": "mp_01H...",
      "proposerAgentId": "xiaoqin",
      "ownerAgentId": "xiaoqing",
      "kind": "preference",
      "content": "用户最近更在意关系中的边界感",
      "reason": "多轮对话重复出现",
      "confidence": 0.72
    }
  ],
  "error": null
}
```

失败时：

```json
{
  "schemaVersion": 1,
  "delegationId": "dlg_01H...",
  "requesterAgentId": "xiaoqin",
  "executorAgentId": "xiaoqing",
  "status": "failed",
  "summary": "执行失败",
  "content": "",
  "structuredResult": null,
  "memoryProposals": [],
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "executor timed out",
    "retryable": true
  }
}
```

### 5.3 Memory Proposal

外部 Agent 不直接写主记忆，而是返回提议：

```json
{
  "proposalId": "mp_01H...",
  "proposerAgentId": "xiaoqin",
  "ownerAgentId": "xiaoqing",
  "kind": "preference",
  "content": "用户最近在意睡眠质量",
  "reason": "最近两天多次主动提到熬夜和疲惫",
  "confidence": 0.81,
  "scope": "long_term"
}
```

---

## 6. 统一传输层

## 6.1 推荐的标准传输

未来所有 Agent 最终推荐支持标准 HTTP JSON 协议：

- `GET /health`
- `POST /agent-bus/inbound/delegations`
- `POST /agent-bus/inbound/results`（仅在异步回调模式需要）

认证方式统一推荐：

- `Authorization: Bearer <token>`
- 可选 `X-Timestamp` + `X-Signature`

### 6.2 OpenClaw 兼容传输

当前小晴已经实现的是 OpenClaw 兼容桥接，而不是最终 JSON 直连。

当对方只提供 `/task` 时，使用：

```http
POST /task
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "AGENT_DELEGATION_V1\n{...delegation json...}",
  "sessionKey": "agent-delegation:dlg_01H...",
  "timeoutSeconds": 60
}
```

约定：

- 第一行必须是 `AGENT_DELEGATION_V1`
- 第二行是完整 JSON
- `sessionKey` 必须使用独立 delegation 级隔离键
- 不得复用普通聊天 sessionKey

### 6.3 OpenClaw 兼容返回

短期兼容允许两种返回：

1. 最低可用：直接返回纯文本结果
2. 推荐：返回结构化结果

推荐格式：

```text
AGENT_DELEGATION_RESULT_V1
{"schemaVersion":1,"delegationId":"dlg_01H...","status":"completed","content":"..."}
```

如果当前只能返回纯文本，小晴侧会临时把它视为 `content`，但这不是长期推荐方案。

---

## 7. 双向协作时序

## 7.1 小晴 -> 小勤

适用场景：小晴是前台，遇到需要外部 Agent 帮忙的任务。

时序：

1. 用户对小晴发消息
2. 小晴决策层判断需要委托
3. 小晴创建 `AgentDelegation`
4. 小晴立刻向前台投影 `agent_receipt`
5. 小晴通过专用通道向小勤发送 `Delegation Request`
6. 小勤执行
7. 小勤返回 `Delegation Result`
8. 小晴投影 `agent_result`
9. 若有 `memory proposal`，进入小晴审批链

用户前台感知：

- 先看到“已转达”
- 再看到“小晴整理后的结果”
- 不会看到小勤抢答

## 7.2 小勤 -> 小晴

适用场景：小勤是前台，但用户要求“小晴帮忙看看”。

时序：

1. 用户对小勤发消息
2. 小勤判断需要请小晴协助
3. 小勤向用户前台先回复“已转达”
4. 小勤通过专用通道向小晴发送 `Delegation Request`
5. 小晴校验身份、校验 schema、校验权限
6. 小晴内部执行自己的基础能力或对话分析能力
7. 小晴返回 `Delegation Result`
8. 小勤根据结果组织最终对用户的回复
9. 如涉及长期记忆，只允许形成 `memory proposal` 给小晴审批

关键约束：

- 小晴不应在自己的前台线程里主动对同一用户“抢答”
- 小晴返回给小勤的是结构化协作结果，不是群聊消息
- 小勤作为前台 Agent 负责对用户展示回执和结果

当前小晴仓库实现补充：

- inbound delegation 会映射到小晴本地隐藏内部线程，不进入普通前台会话列表
- 远端 `requesterAgentId + conversationRef` 会稳定映射到本地 `AgentConversationLink`
- inbound 执行默认关闭 `post-turn` 和记忆反思链，避免远端委托污染主前台回合
- 当前返回模式为同步 `Delegation Result`，标准异步回调入口仍未落地

---

## 8. 小晴作为主控 Agent 的特殊规则

### 8.1 主记忆所有权

- 小晴拥有主记忆写入审批权
- 其他 Agent 只能提交 `memory proposal`
- 小晴可接受、拒绝、合并、降级 proposal

### 8.2 基础能力不默认 handoff

以下能力优先保留在小晴本地：

- 提醒
- 打卡
- 简单记录
- 情绪陪伴
- 轻度分析
- 世界状态更新

只有当确实需要外部能力时，才委托其他 Agent。

### 8.3 人格保护

- 外部 Agent 不直接决定小晴的说话口吻
- 小晴前台回复应始终由小晴自己的表达层生成
- 外部 Agent 返回内容视为执行结果，不直接当最终用户文案

---

## 9. 安全与风控要求

每个外部 Agent 都必须满足以下要求：

- 必须有固定 `agentId`
- 必须使用独立 Bearer token
- 必须能区分健康检查和任务入口
- 必须接受结构化 delegation，而不是只吃普通文本
- 必须回传 `delegationId`
- 必须使用隔离的 delegation 级 `sessionKey`
- 必须支持幂等处理，至少保证同一个 `delegationId` 不重复执行两次
- 不得直接写入小晴主记忆
- 不得把普通聊天消息伪装成内部事件

小晴侧必须执行以下校验：

- 校验 `schemaVersion`
- 校验 `requesterAgentId` 与 token 绑定关系
- 校验 `executorAgentId` 是否真的是当前服务
- 校验 `memoryPolicy`
- 限制 `contextExcerpt` 长度
- 为所有 delegation 写审计事件

当前小晴仓库 inbound 鉴权约定：

- 优先使用 `AGENT_BUS_INBOUND_TOKENS='{"xiaoqin":"REPLACE_ME"}'`
- 小勤单独接入时可使用 `XIAOQIN_AGENT_BUS_TOKEN=REPLACE_ME`

---

## 10. 前台展示要求

前端至少需要以下结构化信息：

### 10.1 Message Metadata

```json
{
  "delegationId": "dlg_01H...",
  "fromAgentId": "xiaoqing",
  "toAgentId": "xiaoqin",
  "delegationStatus": "acknowledged",
  "delegationKind": "assist_request",
  "relatedMessageId": "msg_123"
}
```

### 10.2 Delegation Timeline DTO

```json
{
  "id": "dlg_01H...",
  "requesterAgentId": "xiaoqing",
  "executorAgentId": "xiaoqin",
  "status": "running",
  "summary": "请小勤查一下外部信息",
  "events": [
    {
      "eventType": "created",
      "actorAgentId": "xiaoqing",
      "message": "delegation created"
    }
  ]
}
```

前台只展示：

- 回执
- 状态
- 协作轨迹
- 最终结果

不展示：

- 多人格同时说话
- 内部原始协议文本

---

## 11. 小勤接入清单

如果小勤部署在远端服务器，且当前小晴运行在本机，本地联调推荐通过 SSH tunnel 接入。

### 11.1 小勤侧至少提供

- 服务监听端口，例如 `127.0.0.1:8000`
- `GET /health`
- `POST /task` 或标准 `POST /agent-bus/inbound/delegations`
- Bearer token
- 返回格式说明
- 固定 `agentId`，推荐为 `xiaoqin`

### 11.2 本地 SSH Tunnel 示例

```bash
ssh -N -L 8787:127.0.0.1:8000 ubuntu@43.128.67.157
```

建立后，小晴本机把小勤视为：

```text
http://127.0.0.1:8787
```

### 11.3 本地小晴暴露给远端小勤

如果小晴跑在本机、而小勤跑在远端服务器，推荐使用反向 SSH tunnel，让小勤从服务器本机访问小晴，不直接暴露公网端口。

前提：

- `~/.ssh/config` 已配置服务器别名，例如 `xiaoqin-server`
- 小晴本地后端已提供 `GET /agent-bus/inbound/health`

控制台连接服务器可直接使用：

```bash
ssh xiaoqin-server
```

小晴仓库内推荐命令：

```bash
cd backend
npm run tunnel:agent-bus
```

如果希望“启动后端并自动挂 tunnel”：

```bash
cd backend
npm run start:agent-bus:tunnel
```

如果希望开发态热更新并自动挂 tunnel：

```bash
cd backend
npm run start:dev:agent-bus:tunnel
```

默认效果：

- 本机小晴监听 `127.0.0.1:3000`
- 服务器侧暴露 `127.0.0.1:18080`
- 小勤调用 `http://127.0.0.1:18080/agent-bus/inbound/delegations`

可通过环境变量覆盖：

- `AGENT_BUS_REMOTE_HOST`
- `AGENT_BUS_REMOTE_PORT`
- `AGENT_BUS_LOCAL_PORT`
- `AGENT_BUS_HEALTH_PATH`

### 11.4 小晴侧建议配置

```bash
OPENCLAW_AGENTS='[
  {
    "id": "xiaoqin",
    "name": "小勤",
    "baseUrl": "http://127.0.0.1:8787",
    "token": "REPLACE_ME",
    "capabilities": ["agent-bus", "external-assist"],
    "timeout": 60,
    "apiStyle": "json",
    "taskPath": "/task"
  }
]'

XIAOQIN_OPENCLAW_AGENT_ID=xiaoqin
XIAOQIN_AGENT_BUS_TOKEN=REPLACE_ME
# 或统一用 JSON 映射：
AGENT_BUS_INBOUND_TOKENS='{"xiaoqin":"REPLACE_ME"}'
```

### 11.5 联通性检查

```bash
curl -H "Authorization: Bearer REPLACE_ME" http://127.0.0.1:8787/health
```

如果要从小勤服务器侧检查小晴 inbound：

```bash
curl -H "Authorization: Bearer REPLACE_ME" http://127.0.0.1:18080/agent-bus/inbound/health
```

---

## 12. 对未来其他 Agent 的要求

未来接入任何其他 Agent，都应复用本协议，不为单个 Agent 单独定义私有总线。

建议最小要求：

- 固定 `agentId`
- 支持 `Delegation Request`
- 返回 `Delegation Result`
- 支持 `memory proposal`
- 支持健康检查
- 支持 token 鉴权

如果某个 Agent 只能提供 chat 接口，也必须通过兼容层包装成 `AGENT_DELEGATION_V1`，不能让普通聊天成为长期内部协议。

---

## 13. 当前实现与未来计划

### 13.1 已实现

- `entryAgentId` 已进入会话模型
- 本地 `AgentDelegation / AgentDelegationEvent` 已建模
- 小晴前台已支持 `agent_receipt / agent_result` 展示
- 小晴 -> 小勤 已具备 OpenClaw 兼容 delegation 发起能力
- 小勤 -> 小晴 已具备标准 `POST /agent-bus/inbound/delegations` 同步入口
- 小晴已提供 `GET /agent-bus/inbound/health`
- 小晴已提供 `POST /agent-bus/inbound/delegations`
- inbound delegation 已支持 token 鉴权、幂等校验、内部线程映射
- inbound 执行已隔离到隐藏线程，并默认关闭 `post-turn` / `reflection`
- 标准 `POST /agent-bus/inbound/results` 异步结果回调入口已落地
- `MemoryProposal` 独立存储与审批流已实现
  - Prisma 模型：`MemoryProposal`（status: pending → approved / rejected / merged）
  - 审批 API：`GET /agent-bus/memory-proposals`、`POST .../approve`、`POST .../reject`、`POST .../merge`
  - 审批通过后自动写入主记忆 `Memory` 表
- outbound delegation 自动解析 `AGENT_DELEGATION_RESULT_V1` 结构化返回
- outbound / inbound 结果中的 `memoryProposals` 自动进入审批队列

### 13.2 规划中

- 多 Agent 统一注册与权限治理
- 前端 MemoryProposal 审批面板
- MemoryProposal 批量审批与自动审批策略

---

## 14. 落地建议

对小勤的短期建议：

1. 先提供 `GET /health` 与 `POST /task`
2. 先支持 `AGENT_DELEGATION_V1` 兼容输入
3. 最好尽快支持结构化 `AGENT_DELEGATION_RESULT_V1`
4. 如果有长时间任务，可通过 `POST /agent-bus/inbound/results` 异步推回结果

对小晴的后续建议：

1. ~~增加标准 `POST /agent-bus/inbound/results` 异步结果入口~~ ✅ 已实现
2. ~~将远端 Agent 的结果统一映射为正式 `Delegation Result`~~ ✅ 已实现
3. ~~把 `memory proposal` 从结果体中独立抽出并进入审批流~~ ✅ 已实现
4. 前端增加 MemoryProposal 审批面板
5. 考虑高置信度 proposal 的自动审批策略

这份协议应视为小晴侧的统一标准。未来无论是小勤还是其他协作 Agent，都应尽量向本协议收敛。

---

## 15. 给协作 Agent 的最小对接 Prompt

下面这段可以直接发给小勤端，作为当前阶段最小可用的对接说明。

```text
你现在要作为协作 Agent 接入“小晴 Agent Bus”。

请按以下最小协议实现：

1. 你的固定 agentId 是 xiaoqin。
2. 你需要提供：
   - GET /health
   - POST /task
3. /task 使用 Bearer Token 鉴权。
4. /task 接收 JSON：
   {
     "message": "AGENT_DELEGATION_V1\n{...完整 delegation json...}",
     "sessionKey": "agent-delegation:<delegationId>",
     "timeoutSeconds": 60
   }
5. message 第一行固定是 AGENT_DELEGATION_V1，第二行是完整 JSON；不要把它当普通聊天文本处理。
6. sessionKey 必须按 delegation 隔离，不能复用普通聊天 session。
7. 你需要从 delegation JSON 中读取：
   - delegationId
   - requester.agentId
   - requester.conversationRef
   - executor.agentId
   - userInput
   - taskIntent
   - contextExcerpt
   - memoryPolicy
8. 你执行完成后，优先返回：
   AGENT_DELEGATION_RESULT_V1
   {"schemaVersion":1,"delegationId":"...","status":"completed","summary":"...","content":"...","structuredResult":{},"memoryProposals":[],"error":null}
9. 如果暂时做不到结构化返回，最低可用是直接返回纯文本结果，但后续要升级到标准结果格式。
10. 不要直接写小晴主记忆；如果你认为有记忆价值，只能放进 memoryProposals。

当前小晴侧 inbound 信息：

- Health: GET http://127.0.0.1:18080/agent-bus/inbound/health
- Delegation Inbound: POST http://127.0.0.1:18080/agent-bus/inbound/delegations
- Async Result Callback: POST http://127.0.0.1:18080/agent-bus/inbound/results
- Authorization: Bearer <XIAOQIN_AGENT_BUS_TOKEN>

如果你要请求小晴，请发送标准 Delegation Request JSON，不要发送普通自然语言命令。
如果你要返回结果，请优先返回结构化 Delegation Result。
如果你的任务需要较长时间，可以先同步返回确认，再通过 /agent-bus/inbound/results 异步推回最终结果。
```

如果只想给对方一段更短的版本，可以用这个：

```text
小晴协作对接最小要求：
1. 你是 xiaoqin。
2. 提供 GET /health 和 POST /task。
3. /task 收到的 message 是 AGENT_DELEGATION_V1 + JSON，不是普通聊天。
4. sessionKey 用 agent-delegation:<delegationId>。
5. 完成后优先返回 AGENT_DELEGATION_RESULT_V1 + JSON。
6. 不允许直接写小晴主记忆，只能返回 memoryProposals。
7. 小晴 inbound 地址是 http://127.0.0.1:18080/agent-bus/inbound/delegations
```
