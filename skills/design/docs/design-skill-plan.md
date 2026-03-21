# Design Skill Plan

## Phase 1 - 当前阶段

### 目标

- 在小晴内部以 skill 形式落地
- 先提升 UI 稳定性、一致性和 AI 改动的可控性
- 让 chat / workbench / memory 三类页面都能回到同一套约束体系

### 当前能力

- 已有 light / dark 主题与一批前端 token
- 已有共享 design system 与 UI 规则基础
- 能通过本 skill 提供：
  - UI rules
  - theme tokens
  - preset
  - review / refine / generate prompt

### 下一步动作

- 在实际页面改造中强制先调用本 skill
- 用本 skill 审查高频页面：chat、workbench、memory、config
- 持续把“反复出现的不一致”回写到 rules 或 preset 中
- 验证 prompt 输出结构是否稳定可复用

## Phase 2 - 中期阶段

### 目标

- 抽象 preset，让这套设计能力能在多个相似项目中复用
- 从“纯文档 skill”升级为“半独立 design agent 前置层”
- 让 preset、theme token、页面类型判定更结构化

### 当前能力

- 已经有稳定的内部页面类型定义
- 已经把审查、改造、生成三类任务分开
- preset 已经不是审美标签，而是“规则偏移模板”

### 下一步动作

- 提炼可跨项目复用的 preset 选择逻辑
- 为 token / preset 增加更明确的 schema 约束
- 把常见审查项做成可复用 checklist
- 试运行一个半独立流程：
  - 先由 skill 输出设计判断
  - 再由执行代理按判断改代码

## Phase 3 - 长期阶段

### 目标

- 演进为独立 `design-agent`
- 支持跨产品、跨页面体系的受控设计生成与审查
- 可能引入专门的 `auditor` 角色，负责回归和风格守门

### 当前能力

- 已经具备规则、token、preset、prompt 四层基础
- 已经能区分“小幅收敛”和“新页面生成”
- 已经有机会从 skill 中拆出 generator / auditor 两类能力

### 下一步动作

- 将 `rules/` 与 `tokens/` 升级为 agent 可直接消费的规则源
- 将 `presets/` 升级为可程序化选择的风格注册表
- 引入 `auditor` 检查：
  - 设计规则违规
  - theme 漂移
  - 过度设计风险
  - 页面类型错配
- 视需要引入双 agent 协作：
  - `generator`: 负责生成与改造方案
  - `auditor`: 负责审查与回归把关

## 总结

这条路线的核心不是把小晴做成通用设计平台，而是先把“小晴自己的 UI 约束能力”做稳，再逐步抽象成可以独立工作的 design-agent。
