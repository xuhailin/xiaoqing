---
name: design-audit
description: >
  对 XiaoQing 前端页面执行设计系统一致性审查（design audit）。
  与后端 DesignAgentService 的逻辑对等，直接在编辑器中通过 Read/Glob/Grep 工具完成。
  触发词："审查 xxx 页面"、"设计 audit"、"design audit"、"检查 UI 规范"、"帮我看一下设计"、提到具体页面路由如 /memory /chat /workspace。
---

# Design Audit Skill

XiaoQing 前端设计系统审查助手。执行与 `DesignAgentService` 等价的设计审查，直接读取代码和知识库，不依赖后端服务运行。

---

## 触发后必须先执行的步骤

**第一步：加载设计知识库（必须读取以下文件）**

```
backend/src/design-agent/knowledge/rules/core-ui-rules.md
backend/src/design-agent/knowledge/rules/page-type-patterns.md
backend/src/design-agent/knowledge/tokens/theme-tokens.yaml
backend/src/design-agent/knowledge/shared-primitives.md
```

**第二步：根据页面类型加载对应 preset**

| 页面类型 | Preset 文件 |
|----------|-------------|
| `chat` | `backend/src/design-agent/knowledge/presets/warm-tech.yaml` |
| `workbench` | `backend/src/design-agent/knowledge/presets/serious-workbench.yaml` |
| `memory` | `backend/src/design-agent/knowledge/presets/quiet-personal.yaml` |

若用户未明确指定页面类型，根据页面名称/路由推断：
- `/memory`, `/memory/understanding`, `记忆` → `memory` + `quiet-personal`
- `/chat`, `聊天` → `chat` + `warm-tech`
- `/workspace`, `工作台`, `workbench` → `workbench` + `serious-workbench`

**第三步：读取 token 定义文件**

```
frontend/src/styles/_variables.scss
frontend/src/styles/_design-system.scss
```

---

## 代码审查（Code Audit）

### 定位目标文件

若用户未指定 `targetFiles`，通过以下方式自动发现：

```
在 frontend/src/app/ 中搜索 *{pageName}*.component.ts/html/scss
```

使用 Glob 搜索示例：
- `frontend/src/app/**/*memory*.component.*`
- `frontend/src/app/**/*chat*.component.*`
- `frontend/src/app/**/*workspace*.component.*`

读取所有命中的 `.ts`、`.html`、`.scss` 文件。

### 审查维度

对照已加载的 `core-ui-rules.md` 逐条检查，重点关注：

1. **页面层级** — header 是否比内容区更轻？是否存在两套 panel 语言？
2. **卡片使用** — 是否出现卡片套卡片？chat 流区域是否被额外 panel 包裹？
3. **渐变** — 渐变只能出现在背景/主按钮/header 弱背景，普通卡片和列表项禁用
4. **阴影与边框** — 是否同时使用强阴影+强渐变+强描边？
5. **颜色** — 是否使用 hardcode hex？是否来自 `_variables.scss` 的 CSS 变量？
6. **间距/圆角** — 是否只使用 `4/8/12/16/24/32` 和 token 档位？
7. **Shared Primitives** — 是否使用了 AppPanel/AppButton/AppPageHeader 等共享组件？若手写了同等功能的 HTML/CSS 则为违规
8. **与 preset 的一致性** — 当前页面的视觉风格是否符合已加载 preset 的期望？

### 输出格式

严格按照以下 JSON schema 输出，无多余文字：

```json
{
  "schemaVersion": 1,
  "task": "audit_result",
  "page": {
    "name": "<pageName>",
    "pageType": "<chat | workbench | memory>",
    "preset": "<warm-tech | serious-workbench | quiet-personal>"
  },
  "summary": {
    "status": "<pass | needs_refine | needs_structure_change | blocked>",
    "riskLevel": "<low | medium | high>",
    "overallAssessment": "<3 句话以内的总体评估>"
  },
  "findings": [
    {
      "id": "<唯一 ID，如 F001>",
      "rule": "<core-ui-rules.md 中的规则名>",
      "severity": "<high | medium | low>",
      "location": "<文件路径，精确到行>",
      "problem": "<具体违规内容>",
      "impact": "<为何破坏一致性>",
      "evidence": "<代码片段或类名（可选）>",
      "source": "code"
    }
  ],
  "minimalFixPlan": [
    {
      "action": "<需要做什么>",
      "target": "<文件路径>",
      "type": "<token-reuse | layout-adjust | class-remove | component-replace>",
      "dependsOn": ["<可选：依赖的其他文件>"]
    }
  ],
  "noChangeZones": ["<不应修改的区域描述>"],
  "primitiveMapping": {
    "preferredTokens": ["--token-name"],
    "preferredPrimitives": ["AppPanel", "AppButton"]
  },
  "nextAction": {
    "recommendedTask": "<refine | none>",
    "changeBudget": "<minimal | medium>",
    "handoffPrompt": "<下一步修改任务的简短指令>"
  }
}
```

**约束**：
- `status` 为 `pass` 时，`findings` 为空，`nextAction.recommendedTask` 为 `none`
- `findings.rule` 必须引用 `core-ui-rules.md` 中的实际规则标题
- `minimalFixPlan` 只列最小修改，不要整页重写
- 若无法读取文件，`status` 为 `blocked` 并在 `overallAssessment` 说明原因

---

## 视觉审查（Visual Audit）

当用户上传了截图时，在代码审查的基础上额外评估以下视觉维度（与 `VisualAuditService` 等价）：

1. **页面层级** — header 视觉是否比主内容更轻？
2. **卡片使用** — 是否存在卡片套卡片？
3. **渐变与阴影** — 是否过度使用？
4. **信息密度** — 是否与页面类型（chat/workbench/memory）的预期密度匹配？
5. **主题一致性** — light/dark 双截图是否感觉同一产品？
6. **间距与对齐** — 间距是否一致？是否存在明显的错位？
7. **过度设计** — 是否存在不必要的 glow/heavy shadow/excessive gradient？
8. **Shared Primitive 使用感** — 元素视觉上是否像标准组件，还是像单次定制？

视觉 findings 的 `source` 字段填 `"visual"`，`location` 填视觉区域描述（如 "顶部 header 区域"、"左侧侧边栏"），而非文件路径。

---

## 全量审查（Full Audit）

同时执行代码审查和视觉审查时，按以下规则合并结果：

- `findings`：合并两份 findings，去重（相同 `rule` + `problem` 前50字重复则去一）
- `status`：取两者中更严重的（`blocked` > `needs_structure_change` > `needs_refine` > `pass`）
- `riskLevel`：取两者中更高的（`high` > `medium` > `low`）
- `overallAssessment`：格式为 `[Code] xxx [Visual] xxx`
- `minimalFixPlan`：合并两份
- `noChangeZones`：合并两份并去重
- `primitiveMapping`：合并并去重

---

## 多轮对话处理

审查完成后，支持以下后续交互：

### 描述具体问题
用户描述发现的 UI 问题（含页面上下文时）：
1. 读取相关组件代码
2. 分析用户描述的具体问题
3. 给出修改建议，格式：
```json
{
  "task": "issue_analysis",
  "analysis": "<问题分析>",
  "proposedChanges": [
    { "filePath": "...", "changeType": "edit", "description": "..." }
  ],
  "explanation": "<修改说明>"
}
```

### 请求修改方案
用户说"修改 xxx"、"调整一下"时：
1. 理解修改需求
2. 读取相关文件
3. **只给出方案，不执行修改**
4. 列出要修改的文件、具体内容、修改原因

### 确认执行修改
用户说"确认"、"改吧"、"执行修改"时：
- **简单修改（≤3 文件，纯 edit，不涉及 core/ 或 module.ts）**：直接用 Edit/Write 工具执行
- **复杂修改（>3 文件，或涉及 create/delete，或涉及核心模块）**：说明复杂度，建议通过 DevAgent 执行，或拆分为多步确认后逐步操作

执行修改时的规范约束（来自 `buildApplyChangesPrompt`）：
1. 颜色必须用 CSS 变量（`var(--xxx)`），不写 hardcode hex
2. 间距用 `var(--space-*)` 系列
3. 圆角用 `var(--radius-*)` 系列
4. 优先使用现有 Shared Primitives（AppPanel、AppButton 等）
5. 最小修改原则，不改无关代码

---

## 快速页面路由映射

| 用户提及 | pageName | pageType | 推测 pageUrl |
|----------|----------|----------|-------------|
| memory、记忆、/memory | memory-hub | memory | /memory |
| memory/understanding、记忆理解 | memory-understanding | memory | /memory/understanding |
| chat、聊天、/chat | chat-main | chat | /chat |
| workspace、工作台、/workspace | workspace-home | workbench | /workspace |

---

## 审查后向用户展示的格式（markdown）

```markdown
## 审查结果：{status}

**风险等级**：{riskLevel}

### 总体评估
{overallAssessment}

### 发现的问题
1. **{rule}** ({severity})
   {problem}
   位置：{location}

...

### 建议修改
1. {action}（{target}）
...

如需应用修改，请回复「确认修改」。
```

若 `status` 为 `pass`，则展示：
```markdown
## 审查结果：pass

页面符合设计系统规范，无需修改。

{overallAssessment}
```

---

## 最小修改原则（必须遵守）

在给出任何修改方案前，先回答：
1. 能否只通过 token、Shared Primitive、已有布局关系解决？
2. 能否只改一个层级，不牵动整页？
3. 能否通过删除视觉噪音而非新增装饰来提升完成度？

以上任一为"能"，就不做更大改动。
