# Design Agent 意图识别重构计划

> 日期：2026-03-25
> 状态：待执行

---

## 背景与目标

- **问题**：`DesignOrchestratorService.parseUserIntent()` 用硬编码关键字匹配 4 个固定页面，任何不在白名单里的页面（如 design-agent、workspace/dev-agent 等）都落入 `unknown` 分支，返回引导语而非执行审查。
- **根本原因**：感知层越权做了路由决策（关键字匹配 = 隐式决策），违反了「意图只描述含义」的架构原则。
- **期望结果**：用户用任意自然语言描述页面，系统能正确识别审查意图并解析到合法的 `pageName + pageType`；不在注册表的页面静默降级为 `workbench` 类型继续审查。
- **不在范围**：修改审查执行链路（`DesignAgentService`、`VisualAuditService`、prompt builder 不变）；不改主聊天管线。
- **变更类型**：中等（4 个文件修改 + 2 个新文件 + 1 个 JSON 配置）
- **是否需要结构调整**：是，新增 `DesignIntentClassifier` service 替代内联的 `parseUserIntent()`

---

## 验收标准

- [ ] 用户说「审查一下 design-agent 页面」→ 成功触发代码审查，不再返回引导语
- [ ] 用户说「帮我看看工作台的 UI」→ 识别为 workbench 类型，正确审查 workspace 相关组件
- [ ] 用户说「检查一下 workspace/dev-agent」→ 识别为 workbench + 正确路由
- [ ] 用户上传图片 → 仍走 upload_screenshot 路径（不过 LLM）
- [ ] 用户说「确认」「改吧」→ 仍走 confirm_changes 路径（不过 LLM）
- [ ] 用户提到一个完全不存在的页面名（如「审查 foobar 页面」）→ 降级为 workbench 类型，尝试 glob 查找组件文件
- [ ] `GET /llm/models`（ModelConfigService）能正确展示 `fast` scenario 路由到 `gpt-5-mini`

---

## 改动清单

**Task 1 — [知识资产] 新增 `project-pages.yaml`**
- 文件：`backend/src/design-agent/knowledge/project-pages.yaml`
- 改动：新建文件，从 `frontend/src/app/app.routes.ts` 提取所有真实路由，补充 pageType / preset / componentPath / aliases
- 依赖：无
- 风险：无
- 注意：文件头部加注释 `# sync-source: frontend/src/app/app.routes.ts`，路由变更时需同步更新

内容结构：

```yaml
# sync-source: frontend/src/app/app.routes.ts
# 当前项目前端页面注册表。Design Agent 用此文件解析用户提到的页面名。
# 路由新增/删除时同步更新此文件。

pages:
  - name: chat-main
    route: /chat
    pageType: chat
    preset: warm-tech
    componentPath: frontend/src/app/chat
    aliases: [chat, 聊天, 对话, 主聊天]

  - name: design-agent-page
    route: /design-agent
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/design-agent
    aliases: [design-agent, designagent, 设计审查, 设计agent, 审查工具]

  - name: workspace-home
    route: /workspace
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/workspace/workbench-page.component.ts
    aliases: [workspace, 工作台, workbench, 工作区]

  - name: workspace-dev-agent
    route: /workspace/dev-agent
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/dev-agent
    aliases: [dev-agent, devagent, 开发助手, 开发agent, dev]

  - name: workspace-reminder
    route: /workspace/reminder
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/workspace/workspace-reminder.component.ts
    aliases: [reminder, 提醒, 日程, 提醒页]

  - name: workspace-plan
    route: /workspace/plan
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/workspace/workspace-plan.component.ts
    aliases: [plan, 计划, 规划, 计划页]

  - name: workspace-ideas
    route: /workspace/ideas
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/workspace/workspace-idea.component.ts
    aliases: [ideas, idea, 想法, 创意, 灵感]

  - name: workspace-todos
    route: /workspace/todos
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/workspace/workspace-todo.component.ts
    aliases: [todos, todo, 待办, 任务]

  - name: workspace-execution
    route: /workspace/execution
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/workspace/workspace-task-records.component.ts
    aliases: [execution, task-records, 执行记录, 任务记录]

  - name: memory-hub
    route: /memory/understanding
    pageType: memory
    preset: quiet-personal
    componentPath: frontend/src/app/memory/memory-hub.component.ts
    aliases: [memory, 记忆, memory-hub, 记忆中枢, understanding, 记忆理解]

  - name: memory-persona
    route: /memory/persona
    pageType: memory
    preset: quiet-personal
    componentPath: frontend/src/app/memory/memory-hub.component.ts
    aliases: [persona, 人格, 人设, 人格设定]

  - name: memory-relations
    route: /memory/relations
    pageType: memory
    preset: quiet-personal
    componentPath: frontend/src/app/memory/memory-hub.component.ts
    aliases: [relations, 关系, 关系图谱, 人际]

  - name: settings
    route: /settings
    pageType: workbench
    preset: serious-workbench
    componentPath: frontend/src/app/settings/settings.component.ts
    aliases: [settings, 设置]
```

---

**Task 2 — [后端] `DesignKnowledgeLoader` 加载 project-pages**
- 文件：`backend/src/design-agent/knowledge/design-knowledge-loader.ts`
- 改动：
  1. 在 `load()` 中增加对 `project-pages.yaml` 的读取（和其他 knowledge 文件并行）
  2. 新增 `getProjectPages(): ProjectPage[]` 方法（`ProjectPage` 类型内联定义在此文件或 `design-agent.types.ts`）
  3. `ProjectPage` 类型：`{ name, route, pageType, preset, componentPath, aliases: string[] }`
- 依赖：Task 1
- 风险：低。`DesignKnowledgeLoader` 已有 `OnModuleInit` 模式，加一个字段不影响现有逻辑

---

**Task 3 — [Config] 新增 `fast` LLM scenario**
- 文件 A：`backend/src/infra/llm/model-config.types.ts`
  - `ModelScenario` 加 `'fast'`
  - `ModelRoutingKey` 加 `'fastModel'`
- 文件 B：`backend/src/infra/llm/model-config.service.ts`
  - `SCENARIOS` 数组加 `'fast'`
  - `ROUTING_KEYS` 数组加 `'fastModel'`
- 文件 C：`backend/config/model-routing.json`
  - `routing` 加 `"fastModel": "gpt-5-mini"`
  - `scenarioRouting` 加 `"fast": "fastModel"`
- 依赖：无
- 风险：低。`gpt-5-mini` 已在 models 列表中且 enabled，不影响其他 scenario

---

**Task 4 — [后端] 新增 `DesignIntentClassifier` service**
- 文件：`backend/src/design-agent/design-intent-classifier.service.ts`（新建）
- 改动：实现以下逻辑
  1. **确定性快速路径**（不调 LLM，先于 LLM 检查）：
     - `message.metadata?.images?.length > 0` → `{ type: 'upload_screenshot' }`
     - 消息内容包含 `确认` / `改吧` / `执行修改` → `{ type: 'confirm_changes' }`
  2. **LLM 分类**（其余情况，使用 `scenario: 'fast'`）：
     - Prompt 输入：用户消息 + 当前 pageContext（若有）+ project-pages 列表（name + route + aliases）
     - 要求 LLM 返回 JSON：`{ type, rawTarget?, notes? }`
     - `type` 枚举：`audit_request | describe_issue | request_modification | ask_question | unknown`
  3. **页面解析**（仅 `audit_request`）：
     - 对 `rawTarget` 做 aliases fuzzy match（lowercase contains）
     - 命中 → 返回注册表中的 `{ pageName, pageType, preset, pageUrl: route }`
     - 未命中 → `{ pageName: rawTarget, pageType: 'workbench', preset: 'serious-workbench', pageUrl: null }`
- 依赖：Task 2（ProjectPage 类型）、Task 3（`'fast'` scenario）
- 风险：低。独立新 service，不影响现有任何逻辑

LLM Prompt 结构（供参考）：

```
你是 Design Agent 的意图识别模块。根据用户消息判断意图类型。

## 已知项目页面
{pages.map(p => `- ${p.name} (${p.route}): aliases=[${p.aliases.join(',')}]`).join('\n')}

## 当前对话上下文
{pageContext ? `当前审查页面：${pageContext.pageName}（${pageContext.pageType}）` : '无页面上下文'}

## 用户消息
{message.content}

## 输出（仅 JSON，无其他文字）
{
  "type": "audit_request | describe_issue | request_modification | ask_question | unknown",
  "rawTarget": "<仅 audit_request 时填写，用户提到的页面名>",
  "notes": "<可选，用户的补充说明>"
}
```

---

**Task 5 — [后端] 重构 `DesignOrchestratorService`**
- 文件：`backend/src/design-agent/design-orchestrator.service.ts`
- 改动：
  1. 构造函数注入 `DesignIntentClassifier`
  2. `processUserMessage()` 改为 `await this.intentClassifier.classify(userMessage, context)` 替代现有 `parseUserIntent()`
  3. 删除 `parseUserIntent()` 方法（约 45 行）
  4. 删除 `extractPageInfo()` 方法（约 25 行）
  5. `handleAuditPage` 入参来源从硬编码改为 classifier 返回值（`pageName / pageType / pageUrl` 字段名不变，逻辑不动）
- 依赖：Task 4
- 风险：中。这是核心编排逻辑，删除旧方法前需确认所有 intent 类型都被新 classifier 覆盖

---

**Task 6 — [后端] `DesignAgentModule` 注册新 service**
- 文件：`backend/src/design-agent/design-agent.module.ts`
- 改动：`providers` 数组加 `DesignIntentClassifier`
- 依赖：Task 4
- 风险：无

---

## 执行顺序

```
Task 1 (project-pages.yaml)
    ↓
Task 2 (KnowledgeLoader 加载)    Task 3 (fast scenario)
    ↓                                 ↓
    └──────────── Task 4 (IntentClassifier) ──────────────┘
                        ↓
                  Task 5 (Orchestrator 重构)
                        ↓
                  Task 6 (Module 注册)
```

Task 2 和 Task 3 可并行。Task 4 必须等 2 和 3 都完成。

---

## 风险提示

- **Task 5 是最高风险步骤**：删除 `parseUserIntent` + `extractPageInfo` 两个方法，需确认 5 种 intent 类型（`audit_page / describe_issue / request_modification / ask_question / upload_screenshot / confirm_changes`）在新 classifier 中全部有对应处理，没有遗漏。
- **Task 3 影响 ModelConfigService 的 `SCENARIOS` 硬编码数组**：`getReadView()` 会遍历这个数组，加 `'fast'` 后需确认不产生 undefined 访问。
- **project-pages.yaml 是新 nest-cli asset**：若 `nest-cli.json` 的 assets 配置不包含 `knowledge/**`，编译产物里不会有这个文件。需要在 Task 1 完成后确认 `nest-cli.json` 的 assets 覆盖范围。

---

## 执行策略

- **建议逐步执行**：是，Task 5 改动影响所有对话流，建议单独 commit 后立即手测
- **需要人工确认的步骤**：Task 5（删除旧方法前，先对照 `processUserMessage` 的 switch-case 确认每个 intent 类型都被新 classifier 覆盖）
- **风险较高的步骤**：Task 5

---

## 验收步骤

1. 启动后端，发送「审查一下 design-agent 页面」→ 预期：触发代码审查（不再返回引导语）
2. 发送「帮我看看工作台」→ 预期：识别 workspace-home，pageType=workbench
3. 发送「确认」（在有 proposedChanges 的对话中）→ 预期：走 applyChanges 路径，不走 LLM
4. 上传截图 → 预期：走 handleUploadScreenshot 路径，不走 LLM
5. 发送「审查一下 foobar 页面」→ 预期：降级 workbench，尝试 glob 查找组件文件，不报错
6. `GET /llm/models` → 预期：`scenarios.fast` 存在，routingKey=fastModel，modelId=gpt-5-mini
