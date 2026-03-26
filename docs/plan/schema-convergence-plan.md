
# 小晴 Pipeline 调试可视化面板 Prompt（Claude Code 专用）

## 你的唯一任务

请基于当前仓库代码现状，在前端新增一个**主链路调试可视化面板**，用于展示 assistant 主链路每一层的运行结果与状态。

请先阅读当前 assistant 主链路相关前后端代码、已有调试界面、聊天页结构、工作台页面结构，再决定面板入口与组件拆分，不要脱离现有项目随意新建一套页面体系。


这个面板的目标不是正式用户功能，而是：

* 辅助验证当前分层架构是否按预期运行
* 让开发时能快速看出：Quick Router / Perception / Decision / Execution / Expression / Post-turn 各自产出了什么
* 快速识别是否存在跨层污染、路径绕行、Expression bypass、Post-turn 缺失等问题

⚠️ 注意：

* 不要做成复杂工作台
* 不要大改全局 UI
* 不要重构整个前端
* 只做一个**开发调试用、结构清晰、信息密度高**的可视化面板
* 风格应尽量复用当前项目已有 UI 体系，不另起一套视觉系统

---

# 一、当前前提（必须遵守）

请以以下前提为基础：

* assistant 主链路已经收敛为分层结构
* 当前分层目标为：

```text
Quick Router
  → Perception
  → Decision
  → Execution
  → Expression
  → Post-turn
```

* 当前后端已在补充或已经具备关键日志 / 边界文档 / 分层注释
* 本面板主要服务于开发调试，不追求对普通用户完全暴露
* 允许先使用 mock / fallback / 本地适配方式展示，只要结构清晰、后续可接真实数据
* 如果真实接口尚不完整，请优先把前端结构搭好，并为后续真实接入预留 adapter

---

# 二、目标产物

请完成一个最小可用的调试面板，建议放在现有聊天页、调试页或 assistant 工作台下的一个明确入口中。

你需要交付：

1. 一个可进入的调试页面/面板
2. 一套清晰的 pipeline 可视化布局
3. 一套前端展示用的数据模型/interface
4. 对真实数据接入点的说明（如果尚未完全可接）
5. 尽量少量且可控的前端改动，不要扩散到全站

---

# 三、面板核心目标

这个面板必须能回答下面这些问题：

1. 本轮输入命中了 Quick Router 吗？
2. 当前走的是 `tool path` 还是 `chat path`？
3. Perception 层产出了什么？
4. Decision 层做了什么判断？
5. 是否触发了执行？执行结果是什么状态？
6. 最终用户看到的回复，是否经过了 Expression Control？
7. Post-turn 是否执行了？写回了哪些内容？
8. 是否存在某层缺失 / 被跳过 / 被重复调用的情况？

---

# 四、UI 结构要求

请采用**左右布局或上下分区布局**，但必须满足“快速扫一眼就能看清链路”。

推荐结构如下：

---

## 左侧 / 上部：对话与本轮输入概览

展示内容：

* 用户输入原文
* 当前会话/消息标识（如果已有）
* 路由路径（tool/chat）
* 本轮最终输出摘要
* 当前状态标签（success / pending / degraded / failed 等）

---

## 右侧 / 下部：Pipeline 分层卡片（核心）

按顺序展示 6 个分层卡片：

1. Quick Router
2. Perception
3. Decision
4. Execution
5. Expression
6. Post-turn

每个卡片都应展示：

* 层名称
* 是否命中 / 是否执行
* 输入摘要
* 输出摘要
* 状态标签
* 关键字段（折叠/展开）
* 是否有异常/跳过/降级

---

## 卡片视觉要求

* 不要花哨
* 重点突出层次和状态
* 当前层是否执行，一眼能看出来
* 推荐使用：

  * 状态 badge
  * 折叠面板
  * 小型 key-value 区块
  * JSON 只作为辅助，不要整个页面堆原始 JSON

---

# 五、每层展示要求（必须覆盖）

---

## 1. Quick Router

必须展示：

* source（rule / llm / fallback）
* path（tool / chat）
* confidence
* toolHint（如果有）
* 是否触发 fast path
* 是否影响后续 assembly mode（如果已有）

应支持看出：

* 是规则命中还是 LLM 兜底
* 是否发生了降级

---

## 2. Perception

必须展示：

* perception 是否存在
* 本轮感知摘要
* 关键维度（按当前后端实际字段适配）

  * intent / situation / affect / social / world hint 等
* 是否来自完整路径还是轻量路径

应支持看出：

* Perception 有没有产出
* 是否过重或缺失
* tool path 下 perception 是否被轻量化

---

## 3. Decision

必须展示：

* route / response mode
* capability / executor 选择
* 是否 needs clarification
* 是否 suggested action
* 是否 degrade / fallback

应支持看出：

* 决策有没有收敛
* 有没有和 perception 混淆
* tool/chat 路径选择是否合理

---

## 4. Execution

必须展示：

* 是否执行
* 执行器类型（capability / devAgent / OpenClaw / none）
* status（success / failed / pending / need_clarification / skipped / partial_success）
* toolName / skillName（如果有）
* structured result 摘要
* 错误摘要（如果有）

应支持看出：

* 执行层是不是返回了结构化结果
* 是否有 pending / clarification 类状态
* 是否 tool path 真正走了轻执行流程

---

## 5. Expression

必须展示：

* expression 是否执行
* tone / responseStyle / continuity / burdenReduction / responsibility 等（若已有）
* 最终回复摘要
* 是否承接 execution result
* 是否存在 bypass 风险标识

应支持看出：

* 最终回复是否经过表达层
* 失败/部分成功/待补充 是否被统一处理
* 有没有“直接把底层结果丢给用户”的风险

---

## 6. Post-turn

必须展示：

* 是否执行
* 触发了哪些 update

  * memory
  * claim
  * relationship
  * impression
  * work item
  * summary trigger
* 执行状态
* 耗时/结果摘要（如果能取到）

应支持看出：

* post-turn 是否漏执行
* 是否仍然散乱写回
* 本轮有没有真正产生后续沉淀

---

# 六、交互要求

请尽量提供以下交互，但保持简单：

### 1. 卡片折叠/展开

默认显示摘要，展开后看详细字段。

### 2. 原始数据查看

每层允许查看原始 JSON / 原始 payload，但默认折叠。

### 3. 高亮异常层

如果某层：

* 未执行
* 执行失败
* 被降级
* 状态异常

需要明显提示。

### 4. 路径高亮

本轮走的是 tool path 还是 chat path，要明显高亮。

---

# 七、数据接入策略

请先根据现有前后端实际情况判断：

## 情况 A：已有调试数据源

如果当前已有接口、日志投影、消息调试对象可用：

* 直接接真实数据
* 在代码中说明取数路径

## 情况 B：后端数据不完整

如果当前缺少完整统一数据：

* 先定义前端展示模型/interface
* 增加 adapter 层，把现有零散字段整理成前端可消费结构
* 必要时允许 mock/fallback 示例数据
* 但页面结构必须按真实目标设计，不要因为后端还没完全就做得很随意

---

# 八、前端实现要求

---

## 1. 新增展示模型

请在前端定义一个明确的调试模型，例如：

* `AssistantPipelineDebugViewModel`
* `PipelineStepDebugInfo`

名字可调整，但必须有统一 view model，不要组件里直接乱吃原始后端对象。

---

## 2. 组件拆分

建议至少拆成这些组件：

* `pipeline-debug-panel`
* `pipeline-step-card`
* `pipeline-summary-header`
* `pipeline-json-viewer`（可选）

要求：

* 每个组件职责单一
* 不要一个组件包完所有 UI 和转换逻辑

---

## 3. 样式原则

* 尽量复用现有工作台 / 调试页样式体系
* 不要重新发明一整套 design system
* 优先强调：清晰、密度、可读性、状态对比
* 不追求炫技动画

---

## 4. 路由/入口

请结合当前前端结构，选择一个最合适的位置：

* 聊天页调试抽屉
* assistant debug page
* 工作台中的开发面板
* 单独 debug route

并在代码中说明为什么这样放最合理。

---

# 九、输出文档（必须）

除了前端代码外，请新增一份简短说明文档：

```text
docs/plan/pipeline-debug-panel-plan.md
```

文档必须包含：

1. 面板放在哪里
2. 为什么这样设计
3. 当前数据接入方式
4. 哪些是真实数据，哪些是 fallback/mock
5. 后续如果后端补齐统一调试对象，前端应如何切换

要求简短，不写成长篇报告。

---

# 十、验收标准（必须满足）

完成后应满足：

* 可以进入一个明确的调试入口
* 能看到 6 个主链路层级
* 每层都有摘要展示
* 可以展开看详细数据
* 能一眼看出当前走的是 tool path 还是 chat path
* 能看出 execution 是否触发、expression 是否统一出口、post-turn 是否执行
* 页面结构清晰，不依赖全量原始 JSON 才能理解
* 若真实数据暂缺，也已通过 view model + adapter 把结构搭好

---

# 十一、执行原则（必须遵守）

* 不做全站 UI 重构
* 不顺手改 unrelated 页面
* 不因为做调试面板而破坏当前聊天页主流程
* 优先做“可验证结构”，不是“产品化包装”
* 如果需要新增 mock/adapter，请控制在最小范围
* 不要把前端组件写成和后端 DTO 强绑定的脆弱结构

---

# 十二、最终产出要求

请直接完成：

1. 前端调试面板代码
2. 必要的 view model / adapter / route / component
3. `docs/plan/pipeline-debug-panel-plan.md`

不要只给方案，不要只写 TODO。
请按“可以直接运行和继续迭代”的标准实现。

---



