# Identity Anchor（身份锚定）— 设计说明

> 本文档描述身份锚定的设计动机、当前实现与边界。历史方案（v1 复用 Memory 表）已废弃，仅作迁移参考。

---

## 1. 身份锚定是什么 / 不是什么

### 是什么

身份锚定回答一个问题：**「我在跟谁说话」**。

在 1v1 单用户系统中，它是唯一用户的身份画像——称呼、职业、核心兴趣等长期稳定的自我描述。系统在每次对话时始终注入这段信息，确保 LLM 知道"对面是谁"。

### 不是什么

| 容易混淆的概念 | 区别 |
|---|---|
| **意图识别**（Intent） | "你想干什么"是每轮变化的，由 IntentService 处理。身份锚定不管"要执行任务还是聊天"。 |
| **世界状态**（World State） | "你在哪、几点了"是会话级默认前提，按会话独立。身份锚定跨所有会话。 |
| **核心印象**（impressionCore） | 系统观察推导的印象（如"沟通风格偏简洁"）。身份锚定是用户主动声明的身份事实。 |
| **人格**（Persona） | "小晴是谁"。身份锚定是"用户是谁"。 |
| **共识事实**（shared_fact） | 对话中达成的事实记忆，参与衰减和竞争排序。身份锚定不衰减、始终注入。 |

### 边界原则

- 身份锚定 = **用户主动声明的、长期稳定的身份信息**
- 不参与衰减、不参与竞争排序、始终注入
- 写入和修改必须由用户/管理员显式操作，不由 LLM 或总结流程自动写入
- 变更频率极低，但变更记录需要可回溯

---

## 2. 当前实现 — 独立 IdentityAnchor 表

身份锚定已迁出 Memory 表，使用独立表 `IdentityAnchor` + `IdentityAnchorHistory`，支持多条目、变更历史与结构化字段。实现见 `backend/src/identity-anchor/`，对话时由 `IdentityAnchorService.getActiveAnchors()` / `buildAnchorText()` 注入。

### 2.1 数据模型

```prisma
model IdentityAnchor {
  id        String   @id @default(uuid())
  label     String   // 分类标签：'basic' | 'occupation' | 'interest' | 'custom'
  content   String   @db.Text  // 自由文本描述
  sortOrder Int      @default(0) // 注入顺序

  // 可选结构化字段（缺失时回退到 content）
  nickname  String?  // 用户称呼（如"小海"）

  isActive  Boolean  @default(true) // 软删除 / 停用
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// 变更历史（审计日志）
model IdentityAnchorHistory {
  id              String   @id @default(uuid())
  anchorId        String   // 关联的 IdentityAnchor ID
  previousContent String   @db.Text
  newContent      String   @db.Text
  changedAt       DateTime @default(now())
}
```

### 2.2 设计要点

| 维度 | 决策 | 理由 |
|---|---|---|
| **条目数量** | 最多 5 条（可配置） | 覆盖多面向身份，但不允许无限增长膨胀 system prompt |
| **label 分类** | `basic`（基本身份）、`occupation`（职业）、`interest`（兴趣）、`custom`（自定义） | 前端可按类别分区编辑，注入时按 sortOrder 拼接 |
| **nickname 字段** | 独立字段，非必填 | 未来可用于回复中直接称呼用户，而不需要从自然语言中解析 |
| **变更历史** | 独立 History 表 | 轻量审计，误改可回溯；不增加主表复杂度 |
| **不衰减** | 无 decayScore/hitCount | 概念上不是记忆，不需要这些字段 |
| **始终注入** | 查询全部 isActive=true，按 sortOrder 拼接 | 不参与 getCandidatesForRecall 的竞争 |

### 2.3 注入逻辑

```typescript
// IdentityAnchorService
async getActiveAnchors(): Promise<{ label: string; content: string; nickname?: string }[]> {
  return this.prisma.identityAnchor.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    take: 5,
  });
}

// 构建注入文本
buildAnchorText(anchors): string {
  if (anchors.length === 0) return '';
  const lines = anchors.map(a => `- [${a.label}] ${a.content}`);
  return `[身份锚定]\n${lines.join('\n')}`;
}
```

system prompt 注入位置不变：**persona → 身份锚定 → 印象 → 记忆 → 意图 → 世界状态 → 风格**

### 2.4 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/identity-anchors` | 获取全部条目（含 isActive=false） |
| POST | `/identity-anchors` | 新增一条（自动检查上限） |
| PATCH | `/identity-anchors/:id` | 编辑（content/label/nickname/sortOrder），自动写 History |
| DELETE | `/identity-anchors/:id` | 软删除（isActive=false），保留历史 |
| GET | `/identity-anchors/history` | 查看变更历史 |

响应中的单条结构（AnchorDto）：`id`、`label`、`content`、`nickname`、`sortOrder`、`isActive`、`createdAt`、`updatedAt`。

---

## 3. 历史实现（v1 — 已废弃）

早期版本复用 `Memory` 表：`category='identity_anchor'`、单条 `findFirst`、API 为 `GET/POST /memories/identity-anchor`。因概念不纯（身份锚定非记忆）、单条限制、无变更历史，已迁移至独立表；迁移路径已完成。若需回溯，见版本历史或迁移脚本。

---

## 4. 与其他模块的关系

```
┌─────────────────────────────────────────────────┐
│                 System Prompt                    │
│                                                  │
│  ┌──────────┐  ┌───────────────┐  ┌──────────┐  │
│  │ Persona  │→ │IdentityAnchor │→ │Impression│  │
│  │ 小晴是谁 │  │  用户是谁      │  │ 系统印象  │  │
│  └──────────┘  └───────────────┘  └──────────┘  │
│        ↓                                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Memory   │→ │IntentState│→ │ World State  │  │
│  │ 召回记忆  │  │ 当轮意图   │  │ 会话默认前提 │  │
│  └──────────┘  └───────────┘  └──────────────┘  │
│        ↓                                         │
│  ┌──────────────────┐                            │
│  │   Style Guide    │                            │
│  │   对话风格提示    │                            │
│  └──────────────────┘                            │
└─────────────────────────────────────────────────┘
```

- **Persona**：小晴的人格（约束池 + 进化池），决定"怎么说话"
- **IdentityAnchor**：用户的身份画像，决定"跟谁说话"
- **Impression**：系统观察到的用户特征（如沟通风格），辅助回复调性
- **Memory**：对话中沉淀的事实与偏好，按相关性召回
- **IntentState**：当轮意图（聊天/任务/反问），每轮重算
- **WorldState**：会话级默认前提（地点/时区），按会话独立

前端的 **identity** tab 集中承载身份锚定编辑、用户相关记忆分区与 World State 编辑，落地了上述边界设计。

---

## 5. 不做的事（边界）

- ❌ 不由 LLM 或总结流程自动“猜测/推断”身份锚定；在启用自动锚定（如 `FEATURE_AUTO_ANCHOR`）时，仅在用户明确陈述时由总结流程 create/update 身份锚定，并遵守条目上限、不衰减等规则
- ❌ 不参与衰减或竞争排序
- ❌ 不存储"用户想干什么"（那是意图识别的事）
- ❌ 不存储会话级前提如地点/时区（那是 World State 的事）
- ❌ 不做多用户身份切换（V1 单用户）

---

## 6. 常见场景：用户说「我家就住在这边呢」为什么 AI 还追问住哪？

- **会话内不追问**：依赖**世界状态**（World State），不是身份锚定。用户说「我在上海浦东新区这边呢」时，意图识别应产出 `worldStateUpdate: { city: "上海浦东新区" }`，会话的 worldState 会被更新并注入为「地点：上海浦东新区」；用户再说「我家就住在这边呢」时，意图应结合上文再次产出 worldStateUpdate（或沿用已有），这样同一会话内 AI 能看到地点，不应追问。若仍追问，多半是意图未正确识别或 worldState 未注入，可查 trace 中 `world-state` 是否成功。
- **跨会话长期记住**：若用户在对话中明确说出常住地/身份锚定信息，且启用 `FEATURE_AUTO_ANCHOR`，总结流程会在写入后自动 create/update 身份锚定；若用户希望补充或修正，也可以在身份锚定中手动添加/编辑（如「常住地：上海浦东新区」）。
- **可选产品增强**：未来可做「身份锚定候选」——当检测到用户明确声明常住地/身份且 worldState 已更新时，由总结或独立流程产出候选条目，前端展示「是否将“常住地：上海浦东新区”加入身份锚定？」用户确认后再写入，既不违背“仅基于用户明确陈述自动写入”的边界，又减少用户手动维护。

---

**文档维护**：身份锚定实现变更时同步更新本文档与 `architecture-design.md` 第 6.1 节。
