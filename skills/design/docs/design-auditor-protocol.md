# Design Auditor Protocol

## 1. 这份协议解决什么

这份协议用于定义 `design-auditor` 如何基于“小晴自己的设计产物”做页面自检，并把结果输出成一份可以继续驱动后续 UI 修改的结构化协议。

它的定位不是通用视觉审美评估，而是：

- 读取小晴已有的设计规则与样式源
- 判断当前页面是否偏离小晴自身设计系统
- 输出可继续驱动 `refine / generate / patch` 的结果

所以你的理解是对的：

- 前面的那些 rule、style、token、primitive，本质上就是小晴特有的设计资产
- `auditor` 不是自己发明标准，而是拿这些资产做自检
- 自检输出不只是报告，还应该是一份“后续还能继续改界面”的协议结果

## 2. Auditor 的基准产物

`design-auditor` 默认把以下文件视为 source of truth。

### A. 规则层

- `docs/frontend-ui-rules.md`
- `docs/frontend-ui-checklist.md`
- `.cursor/rules/ui-design-system.mdc`
- `skills/design/rules/core-ui-rules.md`
- `skills/design/rules/page-type-patterns.md`

职责：

- 定义卡片、渐变、header、层级、密度、token 使用边界
- 定义 chat / workbench / memory 的页面类型差异
- 定义 AI 改 UI 时的执行守则

### B. Token 与主题层

- `frontend/src/styles/_variables.scss`
- `skills/design/tokens/theme-tokens.yaml`

职责：

- 定义 light / dark 语义 token
- 定义 spacing、radius、shadow、density 等可复用约束

### C. 共享视觉 primitive 层

- `frontend/src/styles/_design-system.scss`
- `frontend/src/app/shared/ui/app-panel.component.ts`
- `frontend/src/app/shared/ui/app-page-header.component.ts`
- `frontend/src/app/shared/ui/app-button.component.ts`
- `frontend/src/app/shared/ui/app-badge.component.ts`
- 以及 `frontend/src/app/shared/ui/` 下其余共享 UI 组件

职责：

- 定义页面应该复用的 panel、header、button、badge、state、tabs 等基础表达
- 约束“不要在业务页另起一套视觉语言”

### D. Preset 与任务模板层

- `skills/design/presets/*.yaml`
- `skills/design/prompts/review.md`
- `skills/design/prompts/refine.md`
- `skills/design/prompts/generate.md`

职责：

- 定义当前页面应该挂到哪个风格模板
- 定义 auditor 输出后，下一步如何进入 refine 或 generate

## 3. 协议设计原则

### 高约束

协议必须优先告诉 auditor：

- 它在审什么页面
- 这个页面属于哪种 page type
- 它应该参考哪些 source of truth
- 它只能在什么范围内输出建议

### 最小可执行

输出不能只是“设计意见”，而必须能继续驱动 UI 修改。因此输出至少要包含：

- 违规点
- 最小修改计划
- 不可修改区域
- token / primitive 映射
- 下一步行动类型

### 可串联

这份协议的结果应该既能给人看，也能继续喂给：

- `Codex / Claude` 做 refine
- 未来的 `design-generator`
- 未来的 `design-auditor` 回归检查

## 4. Input Protocol

## 4.1 输入目标

`design-auditor` 的输入不是“给我看看这个页面好不好看”，而是一个结构化审查请求。

建议输入结构如下：

```json
{
  "schemaVersion": 1,
  "task": "audit",
  "page": {
    "name": "Chat",
    "route": "/chat/:id",
    "pageType": "chat",
    "preset": "warm-tech",
    "themeModes": ["light", "dark"]
  },
  "scope": {
    "files": [
      "frontend/src/app/chat/chat.component.html",
      "frontend/src/app/chat/chat.component.scss",
      "frontend/src/app/chat/chat.component.ts"
    ],
    "editable": true,
    "changeBudget": "minimal"
  },
  "evidence": {
    "code": true,
    "screenshots": [],
    "notes": "本轮怀疑 chat 顶部状态块和消息区层级有点重。"
  },
  "designArtifacts": {
    "rules": [
      "docs/frontend-ui-rules.md",
      "docs/frontend-ui-checklist.md",
      ".cursor/rules/ui-design-system.mdc",
      "skills/design/rules/core-ui-rules.md",
      "skills/design/rules/page-type-patterns.md"
    ],
    "tokens": [
      "frontend/src/styles/_variables.scss",
      "skills/design/tokens/theme-tokens.yaml"
    ],
    "primitives": [
      "frontend/src/styles/_design-system.scss",
      "frontend/src/app/shared/ui/app-panel.component.ts",
      "frontend/src/app/shared/ui/app-page-header.component.ts",
      "frontend/src/app/shared/ui/app-button.component.ts",
      "frontend/src/app/shared/ui/app-badge.component.ts"
    ]
  },
  "constraints": {
    "doNotCreateNewStyleFamily": true,
    "preferExistingTokens": true,
    "preferSharedPrimitives": true,
    "avoidOverdesign": true
  }
}
```

## 4.2 输入字段说明

- `schemaVersion`
  协议版本号，便于以后升级。

- `task`
  当前先固定为 `audit`。以后可扩展 `re-audit`、`pre-patch-audit`、`post-patch-audit`。

- `page`
  明确 auditor 在看哪个页面，以及它属于哪种页面类型。

- `scope`
  明确本轮可读文件、是否允许后续改动、改动预算是否为 `minimal`。

- `evidence`
  提供代码、截图、备注。截图不是必须，但有截图时 auditor 更容易识别层级和密度问题。

- `designArtifacts`
  这就是“小晴特有产物”的正式入口。auditor 不应脱离这些文件自创判断标准。

- `constraints`
  用于提醒 auditor：它的职责是收敛，不是创作。

## 4.3 最小输入要求

至少必须提供：

- `page.name`
- `page.pageType`
- `scope.files`
- `designArtifacts.rules`
- `designArtifacts.tokens`

如果缺少这些字段，auditor 的判断会过度依赖主观推断，不建议执行。

## 5. Output Protocol

## 5.1 输出目标

输出不是结束，而是下一步 UI 修改的起点。

因此 auditor 的输出必须同时满足两件事：

- 能作为自检报告阅读
- 能作为下一轮 refine / patch 的输入继续使用

建议输出结构如下：

```json
{
  "schemaVersion": 1,
  "task": "audit_result",
  "page": {
    "name": "Chat",
    "pageType": "chat",
    "preset": "warm-tech"
  },
  "summary": {
    "status": "needs_refine",
    "riskLevel": "medium",
    "overallAssessment": "整体方向正确，但 chat 顶部信息块和消息流的层级边界略重。"
  },
  "findings": [
    {
      "id": "chat-card-boundary-001",
      "rule": "Chat Flow / 卡片使用边界",
      "severity": "high",
      "location": "frontend/src/app/chat/chat.component.scss",
      "problem": "顶部多个状态块统一使用较强 panel 边界，导致 chat 流式容器被卡片化感知。",
      "impact": "削弱 chat 页的流动感，破坏 chat 与 workbench 的风格边界。",
      "evidence": "notification, injected-bar, world-state-bar, session-reflection-card 共享较强边界和阴影。"
    }
  ],
  "minimalFixPlan": [
    {
      "action": "降低 chat-top 内非关键状态块的阴影强度",
      "target": "frontend/src/app/chat/chat.component.scss",
      "type": "token-reuse",
      "dependsOn": [
        "frontend/src/styles/_variables.scss",
        "frontend/src/styles/_design-system.scss"
      ]
    }
  ],
  "noChangeZones": [
    "不要把整个 messages 容器 panel 化",
    "不要新增新的 chat 卡片视觉语言"
  ],
  "primitiveMapping": {
    "preferredTokens": [
      "--chat-panel-border",
      "--chat-panel-shadow",
      "--workbench-card-radius",
      "--space-2",
      "--space-3",
      "--space-4"
    ],
    "preferredPrimitives": [
      "AppPanel",
      "AppPageHeader",
      "AppBadge",
      "AppButton"
    ]
  },
  "nextAction": {
    "recommendedTask": "refine",
    "changeBudget": "minimal",
    "handoffPrompt": "按 chat 页面规则做最小收敛：减轻顶部状态块的 panel 感，保持消息流透明，不引入新样式族。"
  }
}
```

## 5.2 输出字段说明

- `summary`
  给出当前页面是否需要收敛，以及风险级别。

- `findings`
  是正式问题列表，不是泛泛审美意见。每条都要能对应到某条规则和某个代码位置。

- `minimalFixPlan`
  给出最小修改集，而不是“重做建议”。

- `noChangeZones`
  非常重要。它约束下游 generator / refiner 不要借机扩大范围。

- `primitiveMapping`
  告诉后续修改流程应该复用哪些 token 与 shared primitive。

- `nextAction`
  这就是“能否继续改界面”的关键。它把 auditor 的输出直接转成下一步任务建议。

## 6. 协议如何继续驱动改界面

可以，而且这正是这份协议要解决的问题。

推荐链路是：

1. `design-auditor` 读取设计产物和页面代码
2. 输出 `audit_result`
3. 下游 `refiner` 直接消费：
   - `findings`
   - `minimalFixPlan`
   - `noChangeZones`
   - `primitiveMapping`
   - `nextAction.handoffPrompt`
4. 修改完成后，再跑一次 `post-patch-audit`

也就是说，auditor 的输出不是静态报告，而是：

- 一份“设计自检结果”
- 一份“后续 UI 修改的输入协议”
- 一份“下一轮回归的比较基线”

## 7. 推荐的任务状态枚举

建议 `summary.status` 使用以下枚举：

- `pass`
  没有阻塞性不一致，可不改。

- `needs_refine`
  存在可通过局部收敛解决的问题。

- `needs_structure_change`
  已超出最小改动范围，需要结构调整。

- `blocked`
  缺少必要输入，暂时无法稳定判断。

## 8. 推荐的严重级别枚举

建议 `findings.severity` 使用以下枚举：

- `high`
  明显破坏页面类型边界或设计系统一致性。

- `medium`
  有一致性风险，但可通过局部收敛修复。

- `low`
  非阻塞问题，适合后续批量优化。

## 9. 与当前 Design Skill v1 的关系

当前 `Design Skill v1` 已经提供了四块基础：

- rules
- tokens
- presets
- prompts

而这份协议做的是第五块：

- `protocol`

也就是说：

- `Design Skill v1` 定义“按什么规则审”
- `Design Auditor Protocol` 定义“怎么把审查输入和输出结构化”

两者结合后，后续无论是 `Codex / Claude`，还是未来单独的 `design-auditor agent`，都能在同一套小晴设计资产上工作。

## 10. 当前结论

结论很明确：

- 你项目里已经存在足够成熟的“小晴特有设计产物”
- 这些产物完全可以作为 `design-auditor` 的基准输入
- auditor 的输出应该就是一份结构化协议，而不是纯文字点评
- 这份输出协议完全可以继续驱动后续界面修改，并成为未来 agent 化的基础接口
