# 用户昵称偏好记忆实现计划

> 本文档面向 Codex / Claude Code 后续实现，包含完整的审查结论、方案设计与分步实施指引。

---

## 1. 背景与目标

### 为什么要做

小晴在日常对话中会给用户起昵称、让用户选择昵称、确认昵称。这种行为天然与「长期陪伴」定位结合——一个真正的陪伴者会记住用户偏好的称呼，并在后续对话中自然使用。

### 昵称不是普通字段

昵称偏好不是简单的事实字段（如姓名、城市），而是：

1. **用户表达策略**：用户可能说"叫我林林""难过的时候叫我软一点""工作场景正常叫我海林"——这涉及**语境条件**和**情绪偏好**
2. **双向协商产物**：AI 可能主动提议昵称，用户可能接受、拒绝或修改——需要区分**提议态**和**确认态**
3. **带置信度的偏好**：用户随口一说和反复强调的权重不同——需要**证据累积**机制
4. **可能多候选**：用户可能在不同场景使用不同昵称——需要支持**主选 + 备选**

### MVP 目标

- 用户通过自然对话表达昵称偏好后，小晴能**识别、存储并在后续回复中使用**
- 用户修改昵称时，小晴能**平滑切换**，不再使用旧昵称
- 在系统 prompt 中注入昵称指引，让模型**自然地使用正确称呼**

### MVP 非目标（后续演进）

- 不做多昵称按场景切换（如"工作场景叫海林，难过时叫宝宝"）
- 不做 AI 主动提议昵称的流程自动化
- 不做昵称变更的用户确认弹窗交互

---

## 2. 现状审查

### 2.1 已有基础设施（可直接复用）

| 组件 | 文件 | 现状 | 可复用程度 |
|------|------|------|-----------|
| **Claim Schema** | `claim-schema.registry.ts:62,82-85,130` | 已定义 `ip.nickname.primary` key，schema 为 `{ name: string, source: 'user_stated' \| 'ai_proposed' }` | **直接使用** |
| **Claim 常量** | `claim-schema.registry.ts:62` | `CLAIM_KEYS.IP_NICKNAME_PRIMARY = 'ip.nickname.primary'` 已声明 | **直接使用** |
| **Profile 排序** | `user-profile.service.ts:60` | `ip.nickname.primary` 已在 `CANONICAL_PREFERENCE_KEY_ORDER` 末尾 | **直接使用** |
| **Claim 写入** | `summarizer.service.ts:631-655` | 身份锚点提取时已能从对话中提取 `preferredNickname` 并写入 claim（confidence=0.9, source='user_stated'） | **直接使用** |
| **TurnContext 类型** | `orchestration.types.ts:133-134` | `user.preferredNickname?: string \| null` 已声明 | **直接使用** |
| **Assembler 调用** | `turn-context-assembler.service.ts:92,153` | 已调用 `readPreferredNickname()` 并传入 TurnContext（**但方法体尚未实现**） | **需补实现** |
| **Claim 注入** | `claim-selector.service.ts` | Stable/Core claims 已注入 system prompt，`ip.nickname.primary` 会随其他 INTERACTION_PREFERENCE 一起注入 | **已生效** |
| **IdentityAnchor** | `schema.prisma:389` | `IdentityAnchor.nickname` 字段已存在（但未被主流程使用） | 备选，不推荐主用 |

### 2.2 当前缺口

| 缺口 | 说明 | 影响 |
|------|------|------|
| `readPreferredNickname()` 未实现 | TurnContextAssembler 中调用了但方法体不存在，编译会报错 | **阻塞：TurnContext 中 preferredNickname 始终为 undefined** |
| Prompt 未专门注入昵称指引 | `prompt-router.service.ts` 的 `buildChatMessages` 没有读取 `preferredNickname` 并生成称呼指引 | **核心缺口：即使 claim 写入了，模型也不知道该怎么用** |
| 识别场景不全 | `summarizer.service.ts:589` 的提取 prompt 仅覆盖"叫我XX""我叫XX""称呼我XX"，缺少"换个昵称""别叫我XX""以后叫我XX" | **会漏识别部分偏好表达** |
| 缺少 AI 提议昵称的写入路径 | 当 AI 主动起昵称且用户接受时，没有触发 claim 写入 | **MVP 可接受但需文档标注** |
| claim 状态晋升阈值 | 昵称写入 confidence=0.9，但 claim engine 从 CANDIDATE → STABLE 需要多次证据，首次写入可能停在 CANDIDATE | **需确认 claim 晋升逻辑** |

### 2.3 Claim 晋升机制回顾

根据 `claim-update.service.ts`：
- 首次写入：状态为 `CANDIDATE`
- 后续同 key 的 SUPPORT 证据会提升 confidence 和状态
- 状态路径：`CANDIDATE → WEAK → STABLE → CORE`
- `ClaimSelectorService.getInjectableClaims` 只读取 `STABLE | CORE` 状态的 claims

**关键问题**：昵称首次写入 confidence=0.9（高于一般 claim），但状态仍为 CANDIDATE，**不会被注入到 system prompt**。需要调整策略：要么让首次写入直达 STABLE，要么在 `readPreferredNickname` 中放宽读取条件。

---

## 3. 方案比较

### 方案 A：直接挂在 UserProfile

在 `UserProfile` 表新增 `preferredNickname` 字段。

- **优点**：简单直接，读写路径清晰
- **缺点**：
  - UserProfile 当前的偏好字段（voiceStyle/praise/rhythm）已迁移到 Claim 为 source of truth，再加平铺字段违背已有方向
  - 缺少置信度、来源追溯、证据累积机制
  - 无法区分 user_stated vs ai_proposed
- **推荐**：**不推荐**——与项目偏好体系的演进方向不一致

### 方案 B：基于 UserClaim（ip.nickname.primary）

复用已有的 Claim Engine，以 `ip.nickname.primary` 作为主 claim key。

- **优点**：
  - 基础设施已全部就绪（schema、key、写入路径、注入管道）
  - 天然支持置信度、证据累积、状态晋升
  - 与其他交互偏好（tone、praise、rhythm）处于同一体系，一致性好
  - `NicknameValue` schema 已支持 `source: 'user_stated' | 'ai_proposed'`
- **缺点**：
  - 首次写入为 CANDIDATE 状态，需调整晋升策略或读取条件
  - 多候选支持需要额外 key（如 `ip.nickname.secondary`），但 MVP 不需要
- **推荐**：**强烈推荐**——90% 基础设施已就绪，改动量最小

### 方案 C：基于 Memory（soft_preference 类别）

在 Memory 表中写入一条 category='soft_preference' 的记忆。

- **优点**：Memory 系统成熟，支持衰减和召回
- **缺点**：
  - Memory 是非结构化文本，无法精确读取"当前首选昵称是什么"
  - Memory 注入是基于相关性召回的，不保证每次都注入
  - 昵称需要**每轮都注入**，不适合靠相关性召回
- **推荐**：**不推荐**——昵称需要确定性注入，Memory 的召回机制不匹配

### 方案 D：新增轻量模型

新建 `NicknamePreference` 表，独立存储。

- **优点**：字段自由度最高，可设计完整的多候选+场景映射
- **缺点**：
  - 引入新表、新 service、新 module，改动量大
  - 与已有 Claim Engine 功能重叠
  - 违反"不为一个功能强行引入新子域"原则
- **推荐**：**不推荐**——杀鸡用牛刀

---

## 4. 推荐方案

### 主方案：基于 UserClaim（ip.nickname.primary）+ 专属读取 + Prompt 注入

**为什么最合适**：
1. `ip.nickname.primary` key、schema（NicknameValue）、写入路径（summarizer）已全部存在
2. 与项目偏好体系方向一致——昵称本质就是一种 INTERACTION_PREFERENCE
3. 改动量最小：只需补 `readPreferredNickname()` 实现 + prompt 注入逻辑 + 识别增强

**MVP 如何控制复杂度**：
- 只支持单一主昵称（`ip.nickname.primary`）
- 不做场景切换
- 识别依赖 summarizer 已有的 LLM 提取路径，增强 prompt 即可
- 读取时放宽条件（CANDIDATE 及以上均可读取，用 confidence 阈值替代状态过滤）

**未来如何平滑演进**：
- 多候选：新增 `ip.nickname.secondary` / `ip.nickname.contextual` claim key
- 场景切换：在 NicknameValue schema 中增加 `context?: string` 字段
- 置信度确认：结合用户明确确认行为提升 claim 状态到 CORE
- 与表达策略深度结合：在 expressionRules 中引用当前昵称

---

## 5. 数据设计

### 5.1 核心数据结构（已存在，无需改动）

**Claim Key**: `ip.nickname.primary`

**Claim Schema** (`claim-schema.registry.ts:82-85`):
```typescript
const NicknameValue = z.object({
  name: z.string().trim().min(1).max(20),
  source: z.enum(['user_stated', 'ai_proposed']).optional(),
});
```

**存储位置**: `UserClaim` 表

| 字段 | 值 |
|------|-----|
| `type` | `INTERACTION_PREFERENCE` |
| `key` | `ip.nickname.primary` |
| `valueJson` | `{ "name": "林林", "source": "user_stated" }` |
| `confidence` | 0.7-1.0 |
| `status` | `CANDIDATE` → `WEAK` → `STABLE` → `CORE` |
| `contextTags` | `['auto-anchor', 'nickname']` |

**TurnContext 字段** (`orchestration.types.ts:133-134`):
```typescript
user: {
  preferredNickname?: string | null;  // 已声明
}
```

### 5.2 需新增/修改的类型

**无需新增模型或字段**。所有数据结构已就绪。

唯一需要调整的是读取逻辑中的状态过滤条件（见 6.2）。

---

## 6. 识别与写入流程

### 6.1 触发场景分类

| 场景 | 用户表达示例 | source | 触发时机 |
|------|-------------|--------|---------|
| 用户主动声明 | "叫我林林吧""以后称呼我海林" | `user_stated` | summarizer 身份提取 |
| 用户修改/纠正 | "这个太幼了，还是叫我海林""别叫我宝宝了" | `user_stated` | summarizer 身份提取 |
| 用户回应AI提议 | AI: "我叫你晴晴好不好？" 用户: "好啊" | `user_stated` | summarizer 身份提取 |
| AI 主动提议（用户未确认） | AI: "我想叫你小林~" 用户未回应 | 不写入 | -- |
| 用户请求起昵称 | "你给我起一个昵称吧" | 不写入（等待确认） | -- |

### 6.2 识别增强

当前 `summarizer.service.ts:589` 的提取 prompt 需要增强，覆盖更多表达模式：

```
额外：如果用户表达了希望被怎么称呼的偏好，在 preferredNickname 字段返回该称呼（<=10字）。
触发条件包括但不限于：
- 直接声明："叫我XX""以后叫我XX""称呼我XX""我叫XX"
- 修改/纠正："别叫我XX了""换个称呼""还是叫我XX""这个昵称太XX了，叫我YY"
- 确认AI提议：上文AI提出了昵称建议，用户回复"好""可以""就这个"等确认
仅当用户有明确的称呼偏好意图时才提取，不要从姓名自动推断昵称。
如果用户要求"不要叫我XX"但未给出替代，返回 null。
```

### 6.3 写入逻辑

写入路径已存在于 `summarizer.service.ts:631-655`，无需大改。关键调整：

1. **confidence 策略**：
   - 用户直接声明（"叫我XX"）：confidence = 0.9
   - 用户确认AI提议：confidence = 0.85
   - 修改/纠正旧昵称：confidence = 0.95（高于原值，表示更强烈的偏好）

2. **覆盖策略**：
   - Claim Engine 的 `upsertFromDraft` 天然支持同 key 覆盖——新值直接替换旧值
   - 每次写入会附加新的 ClaimEvidence 记录，保留历史
   - 如果用户说"别叫我XX了"但没给新名字，不写入（不清空旧值）

### 6.4 Claim 状态快速晋升

为解决"首次写入为 CANDIDATE 但注入要求 STABLE"的问题，推荐方案：

**方案：在 `readPreferredNickname` 中放宽读取条件**

不改 claim engine 的通用晋升逻辑，而是在读取昵称时特殊处理：
- 读取 `ip.nickname.primary` 时，接受 `CANDIDATE | WEAK | STABLE | CORE` 所有状态
- 用 confidence >= 0.7 作为过滤条件
- 这样首次写入（confidence=0.9, status=CANDIDATE）即可立即生效

理由：昵称偏好不同于一般偏好推断——用户主动说"叫我XX"时，单次表达就足够可信。

---

## 7. 回复读取与注入策略

### 7.1 读取路径

`TurnContextAssembler.readPreferredNickname()` 实现：

```typescript
private async readPreferredNickname(): Promise<string | null> {
  const claim = await this.prisma.userClaim.findFirst({
    where: {
      userKey: 'default-user',
      type: 'INTERACTION_PREFERENCE',
      key: 'ip.nickname.primary',
      confidence: { gte: 0.7 },
      status: { not: 'DEPRECATED' },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!claim) return null;
  const val = claim.valueJson as { name?: string } | null;
  return val?.name?.trim() || null;
}
```

### 7.2 Prompt 注入

在 `prompt-router.service.ts` 的 `buildChatMessages` 中，需要新增参数接收 `preferredNickname` 并注入到 system prompt。

注入位置：在 `identityAnchorPart` 之后、`memoryPart` 之前，作为"了解区"的一部分。

注入格式：
```
称呼她时请用"林林"——这是她认可的昵称。如果场景不适合用昵称（如严肃讨论），可以不用，但日常聊天优先使用。
```

### 7.3 使用策略

| 场景 | 策略 |
|------|------|
| 有确认昵称（STABLE/CORE） | 日常对话优先使用昵称，正式场景可不用 |
| 有昵称但仅 CANDIDATE | 同上（MVP 阶段不区分状态，confidence>=0.7 即用） |
| 无昵称 | 不注入任何称呼指引，由模型自然处理 |
| 昵称刚被更新 | 立即生效（下一轮即使用新昵称） |

### 7.4 防漂移策略

通过 prompt 注入的措辞控制：
- **不要**注入"你可以叫她XX或YY"——避免模型自由发挥
- **要**注入具体的单一昵称——"称呼她时请用'林林'"
- prompt 中明确"如果场景不适合用昵称，可以不用"——给模型留退路
- **不要**把旧昵称放到 prompt 中——只注入当前有效昵称

---

## 8. MVP 实施步骤

> **实施状态**：Step 1-4 已全部完成，昵称提示词已抽取为 `PromptRouterService.buildNicknameHint()` 消除重复。

### Step 1: 实现 `readPreferredNickname()` [DONE]

**改哪些文件**：
- `backend/src/assistant/conversation/turn-context-assembler.service.ts`

**做什么改动**：
在 class 末尾（`writeIdentityUpdate` 之后）添加 private method：

```typescript
private async readPreferredNickname(): Promise<string | null> {
  try {
    const claim = await this.prisma.userClaim.findFirst({
      where: {
        userKey: 'default-user',
        type: 'INTERACTION_PREFERENCE',
        key: 'ip.nickname.primary',
        confidence: { gte: 0.7 },
        status: { not: 'DEPRECATED' },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!claim) return null;
    const val = claim.valueJson as { name?: string } | null;
    return val?.name?.trim() || null;
  } catch (err) {
    this.logger.warn(`readPreferredNickname failed: ${String(err)}`);
    return null;
  }
}
```

**预期结果**：TurnContext.user.preferredNickname 能正确返回用户当前的首选昵称或 null。

### Step 2: 在 Prompt 中注入昵称指引 [DONE]

**改哪些文件**：
- `backend/src/assistant/prompt-router/prompt-router.service.ts`
- `backend/src/assistant/conversation/response-composer.service.ts`

**做什么改动**：

1. `ChatContext` interface 新增可选字段：
```typescript
/** 用户认可的首选昵称，注入后模型优先使用 */
preferredNickname?: string | null;
```

2. `buildChatMessages` 方法中，在 `identityAnchorPart` 之后新增：
```typescript
let nicknamePart = '';
if (ctx.preferredNickname) {
  nicknamePart = `称呼她时请用"${ctx.preferredNickname}"——这是她认可的昵称。如果场景不适合用昵称（如严肃讨论），可以不用，但日常聊天优先使用。`;
}
```
将 `nicknamePart` 加入 parts 数组，位置在 `identityAnchorPart` 之后。

3. `ResponseComposer.composeChatReply` 中，向 `this.router.buildChatMessages()` 传入：
```typescript
preferredNickname: context.user.preferredNickname,
```

**预期结果**：当用户有首选昵称时，system prompt 中会包含明确的称呼指引。

### Step 3: 增强 Summarizer 昵称识别 Prompt [DONE]

**改哪些文件**：
- `backend/src/assistant/summarizer/summarizer.service.ts`

**做什么改动**：

将 `summarizer.service.ts:589` 处的提取指令替换为：
```
额外：如果用户表达了希望被怎么称呼的偏好，在 preferredNickname 字段返回该称呼（<=10字）。
触发条件：
- 直接声明："叫我XX""以后叫我XX""称呼我XX"
- 修改/纠正："别叫我XX了，叫我YY""换个称呼""还是叫我XX""这个昵称太XX了"
- 确认AI提议：上文AI提出了昵称建议，用户明确接受
仅当用户有明确的称呼偏好意图时才提取。不要从姓名推断昵称。
如果用户只说"别叫我XX"但未给替代，返回 null。
```

**预期结果**：更多昵称表达模式能被正确识别和提取。

### Step 4: Tool Reply 路径也传入昵称 [DONE]

**改哪些文件**：
- `backend/src/assistant/prompt-router/prompt-router.service.ts` (ToolResultContext)
- `backend/src/assistant/conversation/response-composer.service.ts` (composeToolReply)

**做什么改动**：

1. `ToolResultContext` interface 新增 `preferredNickname?: string | null`
2. `buildToolResultMessages` 中同样注入昵称指引
3. `composeToolReply` 中传入 `context.user.preferredNickname`

**预期结果**：工具回复（如天气查询结果）的表述中也能使用用户昵称。

### Step 5: 验证端到端流程

**验证路径**：
1. 发送消息"以后叫我林林吧" → 检查 UserClaim 表是否写入 `ip.nickname.primary`
2. 发送后续消息"今天天气怎么样" → 检查 system prompt 中是否包含昵称指引
3. 发送"还是叫我海林" → 检查 claim 是否更新为新昵称
4. 发送后续消息 → 确认模型使用新昵称

---

## 9. 风险与边界

### 9.1 用户没有明确确认昵称

**策略**：不写入。提取 prompt 中明确要求"仅当用户有明确的称呼偏好意图时才提取"。宁可漏提取也不误提取。

### 9.2 用户频繁改口

**策略**：每次新的明确表达都覆盖旧值（同 key upsert）。ClaimEvidence 保留历史，但当前生效的始终是最新值。如果用户在短时间内反复切换，claim confidence 会随证据波动，但 readPreferredNickname 的 confidence >= 0.7 阈值会过滤掉不够确定的值。

### 9.3 多个昵称候选

**MVP 策略**：只保留最新的一个（`ip.nickname.primary`）。后续可扩展 `ip.nickname.secondary`。

### 9.4 不同语境下误称呼

**策略**：prompt 注入中加"如果场景不适合用昵称（如严肃讨论），可以不用"——把语境判断交给模型。MVP 阶段不做程序化的语境分类。

### 9.5 模型临时发挥被误存为长期偏好

**策略**：只在 summarizer 的身份锚点提取环节触发写入，且提取 prompt 要求"仅当用户有明确的称呼偏好意图时才提取"。AI 自己临时用的昵称不会触发提取（因为提取只看用户消息中的意图）。

### 9.6 claim 状态与注入的一致性

**策略**：`readPreferredNickname` 不依赖 `getInjectableClaims`（后者只读 STABLE/CORE），而是独立查询，接受所有非 DEPRECATED 状态 + confidence >= 0.7。这确保首次写入即可生效。

注意：这意味着昵称会出现在两个地方——`preferredNickname` prompt 注入（专属路径）和 `claimPolicyText`（通用 claim 注入，但只有晋升到 STABLE 后才出现）。两者不冲突，专属路径的注入更明确、更靠前。

---

## 10. 后续演进

### Phase 2: 多昵称候选

- 新增 claim key `ip.nickname.candidates`，schema: `{ names: string[], source: string }`
- AI 提议的昵称先存 candidates，用户确认后提升为 primary
- `readPreferredNickname` 返回结构体而非 string

### Phase 3: 按场景切换称呼

- 扩展 NicknameValue schema：`{ name: string, source: string, context?: 'casual' | 'work' | 'comfort' }`
- prompt 注入改为条件式："日常叫林林，难过时叫宝宝，工作时叫海林"
- 结合 SessionState 的 mood/energy 信号选择当前场景

### Phase 4: 与表达策略深度结合

- 在 Persona 的 `expressionRules` 中引入"称呼策略"片段
- 根据 RelationshipState 的 stage（early/familiar/steady）调整称呼亲密度
- 支持昵称进化（关系加深后自然使用更亲密的称呼）

### Phase 5: 更稳的偏好置信度与确认机制

- 引入"昵称确认对话"：当 confidence 在中间区间时，AI 主动确认"你希望我继续叫你XX吗？"
- 用户在前端设置面板直接编辑首选昵称
- 置信度衰减：长期不使用的昵称 confidence 缓慢降低

---

## 11. 建议的实施顺序

```
Step 1  实现 readPreferredNickname()          [DONE]
  ↓
Step 2  Prompt 注入昵称指引                      [DONE]  昵称提示词已抽为 buildNicknameHint()
  ↓
Step 3  增强 Summarizer 识别 Prompt              [DONE]
  ↓
Step 4  Tool Reply 路径传入昵称                   [DONE]
  ↓
Step 5  端到端验证                               [TODO]  需手动测试
```

Step 1-4 已全部完成，剩余 Step 5 需手动验证。

---

## 12. 可选顺手实现项

以下改动与昵称功能直接相关但非 MVP 必须，如果实施时顺手可以一起做：

1. **`assembleFallback` 也读取昵称** [DONE]：已在 `assembleFallback` 中补上 `readPreferredNickname()` 调用。

2. **`composeMissingParamsReply` 注入昵称** [DONE]：已通过 `this.router.buildNicknameHint()` 注入。

3. **前端 Debug Panel 显示昵称**：在 DesignAgent 的 memory audit bar 中展示当前 `ip.nickname.primary` claim 状态，方便调试。

4. **IdentityAnchor.nickname 字段清理**：`schema.prisma:389` 的 `IdentityAnchor.nickname` 字段与 claim 方案重复。可考虑标记为 deprecated 或在文档中注明不再使用。
