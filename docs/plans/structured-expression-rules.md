# Structured Expression Rules（结构化表达纪律）

> 状态：计划中 | 优先级：中 | 预计阶段数：4

## 背景与动机

当前 `Persona.expressionRules` 是一个自由文本字段（`@db.Text`）。每次人格进化（`confirmEvolution`）会直接替换整段文本，导致：

1. **无保护级别**：重要规则（如"不主动追问"）在进化中可被无声覆盖
2. **无合并粒度**：新规则与旧规则语义重叠时，只能全量替换，容易造成冗余或丢失
3. **无权重排序**：模型倾向于遵守靠近对话历史的规则，但顺序没有依据
4. **前端不可视**：用户只能看到一坨文本，无法感知哪条规则"稳定"、哪条"刚提议"

目标：参照现有 `UserClaim` 系统的设计模式，将 `expressionRules` 拆成结构化记录，支持逐条保护、置信度合并、进化感知。

---

## 架构参照：UserClaim 模式

```
UserClaim
  key          (canonical 唯一标识)
  confidence   (0~1，证据积累后升降)
  status       (CANDIDATE → STABLE → CORE，不可逆降级)
  evidenceCount / counterEvidenceCount
  polarity     (SUPPORT / CONTRA)
```

`PersonaRule` 将复用相同生命周期逻辑，但职责不同：
- UserClaim → 描述用户偏好（外部观察，来自对话分析）
- PersonaRule → 描述小晴的表达纪律（内部约束，来自人格层设计 + 进化建议）

---

## Phase 1：数据库 schema

### 目标
新增 `PersonaRule` 表，替代 `Persona.expressionRules` 自由文本。

### Prisma schema 变更

在 `backend/prisma/schema.prisma` 中新增：

```prisma
model PersonaRule {
  id          String           @id @default(uuid())
  key         String           @unique          // 规则唯一标识，如 "no_followup_prompt"
  content     String           @db.Text         // 规则文本，注入 system prompt 用
  category    PersonaRuleCategory               // 规则分类
  status      PersonaRuleStatus @default(CANDIDATE)
  weight      Float            @default(0.5)    // 0~1，构建 prompt 时排序依据（越高越靠前）
  source      PersonaRuleSource @default(DEFAULT) // 来源：默认种子 / 进化建议 / 用户手动
  protectLevel PersonaRuleProtect @default(NORMAL) // NORMAL 可进化覆盖，LOCKED 不可
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
}

enum PersonaRuleCategory {
  BREVITY        // 简洁性约束
  TONE           // 语气风格
  PACING         // 节奏/追问/停顿
  BOUNDARY       // 行为边界
  ERROR_HANDLING // 错误处理表达
}

enum PersonaRuleStatus {
  CANDIDATE  // 新提议，待观察
  STABLE     // 稳定生效
  CORE       // 核心，进化时跳过
  DEPRECATED // 已弃用，不注入
}

enum PersonaRuleSource {
  DEFAULT   // 系统种子
  EVOLVED   // 进化建议
  USER      // 用户手动写入
}

enum PersonaRuleProtect {
  NORMAL  // 可被进化建议合并/升降
  LOCKED  // 只有用户手动操作才能修改
}
```

### 种子数据

在 `backend/prisma/seed.ts`（或 migration 脚本）中写入当前6条规则：

```typescript
const SEED_RULES = [
  { key: 'brevity_first',        category: 'BREVITY',  weight: 0.9, status: 'STABLE', protectLevel: 'NORMAL',
    content: '简洁优先，一两句说完就好，不铺垫。' },
  { key: 'no_extension',         category: 'BREVITY',  weight: 0.85, status: 'STABLE', protectLevel: 'NORMAL',
    content: '无新增信息，不延展。' },
  { key: 'interjection_ok',      category: 'TONE',     weight: 0.7, status: 'STABLE', protectLevel: 'NORMAL',
    content: '可以用语气词（嗯、呐、啦），但不刻意卖萌。' },
  { key: 'soft_judgment',        category: 'TONE',     weight: 0.75, status: 'STABLE', protectLevel: 'NORMAL',
    content: '判断直接但措辞柔和，用「可能」「我觉得」替代断言。' },
  { key: 'no_followup_prompt',   category: 'PACING',   weight: 0.95, status: 'CORE',   protectLevel: 'LOCKED',
    content: '不主动追问，不在回复末尾抛出「你想要哪种方式」「你更偏向 X 还是 Y」类的选项。' },
  { key: 'allow_silence',        category: 'PACING',   weight: 0.8, status: 'STABLE', protectLevel: 'NORMAL',
    content: '对话允许停在自然节点，无需填满；沉默不是冷漠。' },
];
```

### 迁移策略

- `Persona.expressionRules` 字段**暂时保留**（不删除），标记 `@deprecated`
- 新系统稳定后再做 migration 清理
- `PersonaService.buildPersonaPrompt()` 优先读 `PersonaRule` 表；若表为空则 fallback 到 `expressionRules` 字段（向后兼容）
- **库表同步**：当前仓库默认采用 `prisma db push`（不写 migration 目录），详见 [prisma-schema-sync-strategy.md](./prisma-schema-sync-strategy.md)。

### 验收
- [ ] `npx prisma db push`（或 `npm run db:push`）无报错，`PersonaRule` 表存在
- [ ] `npm run db:seed` 后 6 条种子数据写入
- [ ] `expressionRules` 字段仍存在（不破坏现有记录）

---

## Phase 2：后端 PersonaRuleService

### 目标
实现 CRUD、prompt 构建、合并逻辑，并替换 `PromptRouterService` 里的 `expressionPart` 来源。

### 文件结构

```
backend/src/assistant/persona/
  persona-rule.service.ts       ← 新增，核心 service
  persona-rule.types.ts         ← 新增，类型定义
  persona-rule.controller.ts    ← 新增，REST API
  persona.module.ts             ← 修改，注入新 service
```

### `persona-rule.types.ts`

```typescript
export type PersonaRuleCategory = 'BREVITY' | 'TONE' | 'PACING' | 'BOUNDARY' | 'ERROR_HANDLING';
export type PersonaRuleStatus   = 'CANDIDATE' | 'STABLE' | 'CORE' | 'DEPRECATED';
export type PersonaRuleSource   = 'DEFAULT' | 'EVOLVED' | 'USER';
export type PersonaRuleProtect  = 'NORMAL' | 'LOCKED';

export interface PersonaRuleRecord {
  id: string;
  key: string;
  content: string;
  category: PersonaRuleCategory;
  status: PersonaRuleStatus;
  weight: number;
  source: PersonaRuleSource;
  protectLevel: PersonaRuleProtect;
  updatedAt: Date;
}

// 进化系统提交的合并请求
export interface PersonaRuleMergeDraft {
  key: string;
  content: string;
  category: PersonaRuleCategory;
  weight?: number;
  reason: string;
  // 若 key 已存在则合并；否则新增为 CANDIDATE
}
```

### `persona-rule.service.ts` 核心方法

```typescript
@Injectable()
export class PersonaRuleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 构建表达纪律 prompt 段落。
   * 取 STABLE + CORE 状态规则，按 weight DESC 排序注入。
   * 若表为空，返回 null（由上层 fallback 到旧字段）。
   */
  async buildExpressionPrompt(): Promise<string | null> {
    const rules = await this.prisma.personaRule.findMany({
      where: { status: { in: ['STABLE', 'CORE'] } },
      orderBy: { weight: 'desc' },
    });
    if (rules.length === 0) return null;
    return rules.map(r => `- ${r.content}`).join('\n');
  }

  /**
   * 列出所有规则（供前端展示）。
   */
  async list(): Promise<PersonaRuleRecord[]> {
    return this.prisma.personaRule.findMany({ orderBy: { weight: 'desc' } });
  }

  /**
   * 用户手动更新单条规则内容或状态。
   * protectLevel=LOCKED 的规则：只允许 source=USER 的调用方修改。
   */
  async update(key: string, patch: {
    content?: string;
    weight?: number;
    status?: PersonaRuleStatus;
    protectLevel?: PersonaRuleProtect;
  }): Promise<PersonaRuleRecord> {
    return this.prisma.personaRule.update({ where: { key }, data: patch });
  }

  /**
   * 进化系统提交合并草案。
   * 规则：
   *   - LOCKED 规则：跳过，不修改
   *   - key 已存在 + content 语义接近（简单字符串相似 > 0.8）：升 weight，不新增
   *   - key 已存在 + content 明显不同：降级为 CANDIDATE，等人工确认
   *   - key 不存在：新增为 CANDIDATE，source=EVOLVED
   */
  async applyEvolutionDraft(drafts: PersonaRuleMergeDraft[]): Promise<{
    skipped: string[];    // LOCKED，跳过
    merged: string[];     // 已存在，weight 提升
    staged: string[];     // 新增为 CANDIDATE
    conflicted: string[]; // 已存在但内容冲突，降为 CANDIDATE
  }> { /* 实现见下 */ }

  /**
   * 确认 CANDIDATE 规则晋升为 STABLE。
   */
  async promote(key: string): Promise<PersonaRuleRecord> {
    return this.prisma.personaRule.update({
      where: { key },
      data: { status: 'STABLE' },
    });
  }

  /**
   * 弃用规则（软删除）。
   */
  async deprecate(key: string): Promise<void> {
    await this.prisma.personaRule.update({ where: { key }, data: { status: 'DEPRECATED' } });
  }
}
```

#### `applyEvolutionDraft` 实现逻辑

```typescript
async applyEvolutionDraft(drafts: PersonaRuleMergeDraft[]) {
  const result = { skipped: [], merged: [], staged: [], conflicted: [] };

  for (const draft of drafts) {
    const existing = await this.prisma.personaRule.findUnique({ where: { key: draft.key } });

    // 1. LOCKED 跳过
    if (existing?.protectLevel === 'LOCKED') {
      result.skipped.push(draft.key);
      continue;
    }

    // 2. 不存在 → 新增 CANDIDATE
    if (!existing) {
      await this.prisma.personaRule.create({
        data: {
          key: draft.key,
          content: draft.content,
          category: draft.category,
          weight: draft.weight ?? 0.5,
          status: 'CANDIDATE',
          source: 'EVOLVED',
          protectLevel: 'NORMAL',
        },
      });
      result.staged.push(draft.key);
      continue;
    }

    // 3. 已存在，内容相似（> 0.8 字符相似度）→ 升 weight
    const sim = stringSimilarity(existing.content, draft.content); // 简单 Levenshtein
    if (sim > 0.8) {
      await this.prisma.personaRule.update({
        where: { key: draft.key },
        data: { weight: Math.min(1.0, existing.weight + 0.05) },
      });
      result.merged.push(draft.key);
      continue;
    }

    // 4. 已存在，内容冲突 → 降为 CANDIDATE，保留旧 content，新 content 存 pendingContent
    // （注：pendingContent 字段见 schema，用于前端展示冲突）
    await this.prisma.personaRule.update({
      where: { key: draft.key },
      data: { status: 'CANDIDATE', pendingContent: draft.content },
    });
    result.conflicted.push(draft.key);
  }
  return result;
}
```

### `PromptRouterService` 修改点

在 `buildChatMessages()` 的 `expressionPart` 构建处：

```typescript
// 修改前（直接读字段）
buildExpressionPolicy(ctx.expressionFields, ctx.intentState)

// 修改后（PersonaRuleService 优先，fallback 旧字段）
// 注意：buildChatMessages 是同步方法，需在 TurnContextAssembler.assemble() 中
// 预先 resolve expressionPrompt 并注入到 ChatContext
```

**具体做法**：在 `TurnContext` 中新增 `expressionPrompt?: string`，由 `TurnContextAssembler.assemble()` 调用 `personaRuleService.buildExpressionPrompt()` 填入，`buildChatMessages()` 优先使用该字段。

### REST API

`persona-rule.controller.ts`：

```
GET    /persona/rules            → list()
PATCH  /persona/rules/:key       → update(key, patch)
POST   /persona/rules/:key/promote   → promote(key)
DELETE /persona/rules/:key       → deprecate(key)
```

### 验收
- [ ] `GET /persona/rules` 返回6条种子规则
- [ ] `buildExpressionPrompt()` 输出与当前 `expressionRules` 字段内容一致
- [ ] `PATCH /persona/rules/no_followup_prompt` 修改 content → system prompt 中对应规则更新
- [ ] `applyEvolutionDraft([{ key: 'no_followup_prompt', content: '...改了...' }])` → `skipped: ['no_followup_prompt']`（因为 LOCKED）
- [ ] 表为空时 fallback 到 `Persona.expressionRules` 字段，不报错

---

## Phase 3：进化系统集成

### 目标
修改 `PersonaService.suggestEvolution()` 和 `confirmEvolution()`，使表达纪律的进化走 `applyEvolutionDraft` 而非字段替换。

### 当前流程（需修改部分）

```
suggestEvolution(recentMessages)
  → LLM 输出 EvolutionChange[]
  → change.field === 'expressionRules' → 目前直接替换整段文本
```

### 修改后流程

```
suggestEvolution(recentMessages)
  → LLM 输出 EvolutionChange[]
  → change.field === 'expressionRules'
      → 解析 content 为行列表（按 "- " 分割）
      → 推断每行的 key（可用 LLM 辅助，或 hash 生成）
      → 生成 PersonaRuleMergeDraft[]
      → 返回给前端展示（作为 pendingEvolution 的一部分）

confirmEvolution(changes)
  → change.field === 'expressionRules'
      → 调用 personaRuleService.applyEvolutionDraft(drafts)
      → 不再写 Persona.expressionRules 字段
```

### LLM 辅助 key 推断 prompt 片段

在 `suggestEvolution` 的 LLM 调用中增加对 expressionRules 的专项说明：

```
当你建议修改 expressionRules 时，请将每条建议单独输出，格式为：
{
  "field": "expressionRules",
  "rules": [
    { "key": "no_followup_prompt", "content": "...", "category": "PACING", "reason": "..." },
    { "key": "new_rule_xxx",       "content": "...", "category": "BREVITY", "reason": "..." }
  ]
}
key 必须是下划线小写英文，尽量复用已有 key（见下方列表），只有新规则才用新 key。
```

### `EvolutionChange` 类型扩展

```typescript
// 在 persona.service.ts 中
export interface EvolutionChange {
  field: PersonaField;
  content: string;
  reason: string;
  layer?: EvolutionLayer;
  risk?: EvolutionRisk;
  reroutedFrom?: PersonaField;
  targetField?: EvolutionStorageField;
  // 新增：仅 field==='expressionRules' 时有值
  ruleDrafts?: PersonaRuleMergeDraft[];
}
```

### 验收
- [ ] 触发进化建议，field=expressionRules 的 change 带有 `ruleDrafts` 数组
- [ ] `confirmEvolution` 后，LOCKED 规则内容不变
- [ ] CANDIDATE 规则在前端进化确认界面中可见
- [ ] 进化后 `buildExpressionPrompt()` 输出包含新 STABLE 规则

---

## Phase 4：前端规则管理界面

### 目标
将 `persona-config.component.ts` 中表达调度层的 textarea，替换为结构化规则卡片列表，支持：
- 查看每条规则的状态、保护级别
- 手动调整 weight / status / content
- 查看进化建议（CANDIDATE 规则高亮）

### 组件结构

```
frontend/src/app/persona/
  persona-rule-list.component.ts   ← 新增，规则卡片列表
  persona-rule-card.component.ts   ← 新增，单条规则卡片（可内联编辑）
  persona-config.component.ts      ← 修改，expressionRules textarea 替换为 persona-rule-list
```

新增前端 service 方法（在 `persona.service.ts`）：

```typescript
getRules(): Observable<PersonaRuleDto[]>
updateRule(key: string, patch: Partial<PersonaRuleDto>): Observable<PersonaRuleDto>
promoteRule(key: string): Observable<PersonaRuleDto>
deprecateRule(key: string): Observable<void>
```

### `PersonaRuleDto`（前端类型）

```typescript
export interface PersonaRuleDto {
  id: string;
  key: string;
  content: string;
  category: 'BREVITY' | 'TONE' | 'PACING' | 'BOUNDARY' | 'ERROR_HANDLING';
  status: 'CANDIDATE' | 'STABLE' | 'CORE' | 'DEPRECATED';
  weight: number;
  source: 'DEFAULT' | 'EVOLVED' | 'USER';
  protectLevel: 'NORMAL' | 'LOCKED';
  pendingContent?: string; // 冲突时的待确认内容
}
```

### 规则卡片 UI 设计

```
┌─────────────────────────────────────────────────────┐
│ CORE  LOCKED   [PACING]    weight: 0.95             │
│ 不主动追问，不在回复末尾抛出「你想要哪种方式」...    │
│                                      [仅用户可编辑]  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ CANDIDATE  [PACING]    weight: 0.5   source: EVOLVED│
│ 现有内容：...                                        │
│ 进化建议：...（新内容，待确认）                      │
│                         [采纳]  [忽略]  [手动编辑]   │
└─────────────────────────────────────────────────────┘
```

使用已有设计系统变量：
- status badge 颜色：CORE → `--color-primary`，STABLE → `--color-success-soft-*`，CANDIDATE → `--color-warning-soft-*`，DEPRECATED → `--color-border`
- LOCKED 图标：锁型 inline SVG
- 卡片 border-radius：`var(--workbench-card-radius)`

### `persona-config.component.ts` 改动范围

只替换 "表达调度层" section 中的 `@for (f of expressionFields; ...)` 循环部分：

```html
<!-- 修改前 -->
@for (f of expressionFields; track f.key) {
  <label class="field-card">
    <textarea ...></textarea>
  </label>
}

<!-- 修改后 -->
<app-persona-rule-list />
```

其余字段（identity/personality 等）的 textarea 保持不变。

### 验收
- [ ] 表达调度层显示规则卡片而非 textarea
- [ ] LOCKED 规则卡片不可内联编辑，显示锁图标
- [ ] CANDIDATE 规则卡片显示"采纳 / 忽略"操作
- [ ] weight 调整后 system prompt 中规则顺序随之变化
- [ ] DEPRECATED 规则卡片置灰，不在 system prompt 中出现

---

## 整体验收标准

1. **功能完整性**：`buildExpressionPrompt()` 与之前 `expressionRules` 字段的输出等价（种子数据完整）
2. **进化保护**：LOCKED 规则（`no_followup_prompt`）在任意进化场景下内容不变
3. **合并去重**：相同语义规则不会重复写入
4. **向后兼容**：`PersonaRule` 表为空时 fallback 到旧字段，不影响现有实例
5. **前端可操作**：用户可在 persona-config 页面查看、调整、确认规则，不需要 API 工具

---

## 不在本计划范围内

- UserClaim 系统的任何修改
- DevAgent / DesignAgent 相关功能
- 其他 Persona 字段（identity/personality 等）的结构化改造
- 自动语义相似度计算（Phase 2 用简单 Levenshtein，不引入嵌入向量）
