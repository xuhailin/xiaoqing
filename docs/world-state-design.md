# World State / Default Context 设计

## 一、定义与边界

**World State（默认世界状态 / 对话前提）** 是一种新的信息分类，区别于：

- **人格 / 偏好长期记忆**：写入 Memory 表，参与回忆与注入
- **阶段性任务或经历记忆**：mid/long 记忆

特征：

- 一旦确定，在未被用户**显式修改**前默认成立
- **不参与「回忆」**，而是自动参与意图理解与参数补全
- 不应反复向用户确认
- 可被覆盖（如用户说「我回国了」）
- **不写入长期人格记忆**，不参与情感、偏好、人格推导；仅用于意图补全、推理前提、对话连续性

---

## 二、数据结构

### 2.1 存储结构（TypeScript + Prisma）

```ts
// 默认世界状态：稳定事实型上下文，用于意图补全与推理前提
export interface WorldState {
  /** 城市/地区名（如 "东京" "北京"），供天气等技能解析为坐标 */
  city?: string;
  /** 时区（如 "JST" "Asia/Shanghai"），供「几点了」等推理 */
  timezone?: string;
  /** 用户偏好语言（如 "zh-CN" "ja"） */
  language?: string;
  /** 设备（如 "desktop" "mobile"），可选 */
  device?: string;
  /** 当前对话模式（与意图 mode 可同步），可选 */
  conversationMode?: 'chat' | 'thinking' | 'decision' | 'task';
}

// 仅当用户明确声明变化时更新；空字符串表示不更新该字段
export interface WorldStateUpdate {
  city?: string;
  timezone?: string;
  language?: string;
  device?: string;
  conversationMode?: string;
}
```

- 存储：`Conversation.worldState`（JSON，可选），即**按会话**存储，不同对话可有不同默认前提。
- 更新规则：**覆盖**旧值，不追加；仅当 `worldStateUpdate` 中某字段有有效值时才覆盖。

### 2.2 与意图槽位的对应关系

| World State 字段 | 可补全的意图槽位 / 用途 |
|------------------|-------------------------|
| `city`           | 天气等工具的 `slots.city`（缺地点时补全） |
| `timezone`       | 「几点了」等推理前提（注入到聊天 system 文案） |
| `language`       | 回复语言、本地化提示（可注入 system） |

---

## 三、推理流程伪代码

### 3.1 发送消息主流程（接入 World State 后）

```
1. 创建用户消息，拉取 recent + persona

2. [若开启 OpenClaw] 意图识别
   intentRaw = intent.recognize(recent, userInput)
   // 意图输出中可包含 worldStateUpdate（用户声明了地点/时区/语言变化）

3. 应用 World State 更新（若有）
   if (intentRaw.worldStateUpdate 且存在非空字段)
     worldStateService.update(conversationId, intentRaw.worldStateUpdate)

4. 用 World State 补全意图槽位（关键：避免在已有前提时反问）
   mergedIntent = worldStateService.mergeSlots(conversationId, intentRaw)
   // mergedIntent.slots 已从 worldState 补全；missingParams 已去掉能补全的项

5. 策略决策（基于 mergedIntent，而不是 intentRaw）
   policy = decideToolPolicy(mergedIntent)
   if (policy === ask_missing)  // 仅当 World State 也无法补全时才追问
     return handleMissingParamsReply(...)
   if (policy === run_local_weather)
     使用 mergedIntent.slots 执行天气（location/city/dateLabel）
     ...

6. [聊天路径] 构建 Chat 上下文时注入 World State 文案
   buildChatMessages({ ..., worldState })  // 如「用户当前时区：JST」「默认地点：东京」
```

### 3.2 mergeSlots 伪代码（核心）

```
mergeSlots(conversationId, intent):
  world = worldStateService.get(conversationId)
  slots = clone(intent.slots)
  missing = clone(intent.missingParams)

  if (intent.requiresTool && intent.taskIntent === 'weather_query')
    if (缺少地点：即 slots 无 city 且无 location) 且 'city' in missing
      if (world?.city 存在且非空)
        slots.city = world.city
        missing = missing.filter(p => p !== 'city')
        // 可选：记录 trace filledFromWorldState: ['city']

  return { ...intent, slots, missingParams: missing }
```

### 3.3 关键判断条件

- **何时反问用户（ask_missing）**  
  仅当：`requiresTool === true` 且 **合并后的** `missingParams.length > 0`。  
  即：若某参数能从 World State 补全，则不从 `missingParams` 中移除后不再因该参数触发 `ask_missing`。

- **何时更新 World State**  
  仅当意图解析结果中带有 `worldStateUpdate` 且某字段为有效非空字符串时，对该字段执行**覆盖**更新。

- **与记忆的边界**  
  World State 不写入 `Memory` 表；不参与 `getCandidatesForRecall` / 精排 / 注入；仅在「意图补全」与「Chat system 中的默认前提」两处使用。

---

## 四、行为验收

- 用户：「今天天气怎么样？」  
  - 若 World State 已有 `city: "东京"`：直接按东京查天气并回复，可带「在东京的话……」；**不**反问「你在哪个城市？」。
- 用户：「几点了？」  
  - 若 World State 已有 `timezone: "JST"`：system 中注入「用户当前时区：JST」，小晴直接按 JST 回答；不反问。
- 用户：「我现在在大阪」  
  - 意图中解析出 `worldStateUpdate: { city: "大阪" }`，更新 World State；后续「今天天气」即按大阪补全。

---

## 五、实现清单

- [x] 数据结构：`WorldState` / `WorldStateUpdate` 类型，`Conversation.worldState`（Json）
- [x] WorldStateService：get / update / mergeSlots
- [x] 意图：输出并解析 `worldStateUpdate`，仅声明变化时填写
- [x] ConversationService：意图后先 update 再 mergeSlots，策略基于 mergedIntent；聊天路径注入 worldState
- [x] PromptRouter：ChatContext 支持 `worldState`，system 中一段「默认世界状态」文案
- [x] API：GET/PATCH `/conversations/:id/world-state` 供前端展示与更新默认地点/时区等

当前实现已在 `ConversationService.sendMessage` 中严格按「先 update，再 mergeSlots，再基于 mergedIntent 决策」执行；trace 中也有对应的 `world-state` 步骤，可通过前端的 Debug 视图验证行为。

---

## 六、API 说明

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/conversations/:id/world-state` | 获取该会话的默认世界状态（可能为 `null` 或 `{ city?, timezone?, language?, ... }`） |
| PATCH | `/conversations/:id/world-state` | 更新该会话的默认世界状态；body 为 `WorldStateUpdate`，仅传需要覆盖的字段，返回更新后的完整状态 |
