# XiaoQing Frontend UI Rules v1

本规范用于约束小晴前端的统一风格约束层，目标是让工作台风格在聊天、DevAgent、LongMemory、session 等区域保持同一设计语言。

## 1. 设计目标

- 风格定位：克制、稳定、现代、专业、可扩展
- 产品气质：AI Assistant / AI OS / 智能工作台
- 信息密度：中高密度，优先清晰与秩序感
- 参考方向：Linear / Vercel / Cursor / Claude
- 禁止方向：运营站式花哨视觉、过度柔软笔记风、为了“AI 感”而堆装饰

## 2. Token 规则

### Spacing

只允许使用以下 spacing 档位：

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 24px
- `--space-6`: 32px

规则：

- 小控件内部间距优先用 `8 / 12`
- 卡片、section、header 内边距优先用 `16 / 24`
- 页面级区块间距优先用 `16 / 24 / 32`
- 不要在业务页面继续写新的魔法数字 `padding / margin`

### Radius

只允许使用以下 radius 档位：

- `--radius-sm`: 8px
- `--radius-md`: 12px
- `--radius-lg`: 16px
- `--radius-xl`: 20px
- `--radius-pill`: 999px

规则：

- 按钮、输入框、小 badge：`8 / 12`
- 卡片、列表项、对话容器：`16`
- 大型工作台 panel：`20`
- `pill` 只用于 badge、状态点、极少量数量胶囊，不允许泛滥

### Typography

统一使用以下层级：

- `--font-size-xxs`: 11px，极小元信息
- `--font-size-xs`: 12px，badge / meta / label
- `--font-size-sm`: 14px，默认 UI 文本
- `--font-size-md`: 15px，正文与消息内容
- `--font-size-lg`: 20px，统计值与小标题
- `--font-size-xl`: 28px，页面主标题

规则：

- 页面主标题只用 `xl`
- 区块标题只用 `sm`
- 大多数辅助信息只用 `xs`
- 不要在页面里继续发明新的 `font-size`

### Color / Token

- 所有颜色优先使用 `frontend/src/styles/_variables.scss` 中的 token
- 状态颜色只通过语义 token 表达：`success / warning / error / primary`
- 不允许业务页面直接发明新的状态色体系
- 同一页面内，同类型状态必须使用同一表达方式

## 3. Panel / Border / Shadow 层级

统一容器层级：

- `surface`: 普通卡片、详情块、轻表单
- `workbench`: 主工作区、大容器、聊天区、session 泳道
- `subtle`: 次级说明区、嵌套块、弱化信息
- `success / warning / danger`: 状态反馈 panel

统一规则：

- 普通卡片用细边框 + 轻阴影
- 主工作台容器用 `workbench` panel，不再各写一套背景和阴影
- 列表项容器优先复用 `ui-list-card`
- 上下文菜单统一复用 `ui-context-menu`

## 4. Shared Primitive

已收敛的基础层：

- `AppPanel`
- `AppButton`
- `AppBadge`
- `AppTabs`
- `AppPageHeader`
- `AppSectionHeader`
- `AppState`

已定义的共享视觉基类：

- `ui-list-card`
- `ui-input`
- `ui-textarea`
- `ui-select`
- `ui-context-menu`
- `ui-stat-card`

### 使用规则

- 页面主容器优先用 `AppPanel` 或 `ui-list-card`
- 页头统一优先用 `AppPageHeader`
- 区块头统一优先用 `AppSectionHeader`
- tab 切换统一优先用 `AppTabs`
- 状态标签与筛选标签统一优先用 `AppBadge`
- 空态、错误态、加载态统一优先用 `AppState`

## 5. 组件使用约束

### Button

允许的 variant：

- `primary`
- `secondary`
- `ghost`
- `success`
- `danger`

规则：

- 主动作只允许一个 `primary`
- 次要操作优先用 `ghost / secondary`
- 风险动作优先用 `danger`
- 不要在业务页继续发明新的按钮底色、圆角、阴影

### Badge / Tag

允许的 tone：

- `neutral`
- `info`
- `success`
- `warning`
- `danger`

规则：

- 状态 badge 用语义 tone
- 信息标签用 `info / neutral`
- 不要把 badge 当作大型按钮用
- 不要在一个列表里混用多种完全不同的 badge 形态

### Card / Panel / Section

- `card`: 单条信息、列表项、摘要块
- `panel`: 功能容器、工作区块、详情区
- `section`: 结构分组，不负责强视觉，只负责内容组织

规则：

- header 负责说明当前区域是什么
- panel 负责承载内容
- list item 负责单项交互
- 同类容器必须复用同一个视觉基类

## 6. 页面结构规则

新页面优先遵守：

1. `PageHeader`
2. 一级 section
3. 主 panel / list
4. 二级详情或状态区

统一要求：

- header / section / panel 层级必须清晰
- 同类控件尺寸必须一致
- 操作区与内容区间距必须可预测
- 不追求花哨动画，优先秩序感和完成度

## 7. 代码规则

- 新页面优先查找已有 design system 与 shared components
- 禁止在业务页面内大量手写重复样式
- 禁止随意写魔法数字 `padding / margin / radius / font-size`
- 样式优先走 token、共享 class、primitive
- 能抽成基础组件的，不要散落复制
- 同类容器必须复用同一个视觉基类
- 视觉收敛优先于局部“截图优化”

## 8. 给 AI 编码助手的执行规则

1. Codex / Cursor / Claude Code 修改 UI 前，先检查 `frontend/src/styles/_variables.scss`、`frontend/src/styles/_design-system.scss` 与 `frontend/src/app/shared/ui/`
2. 没有必要时，不要新增新的视觉风格
3. 优先在现有 token 与 primitive 上扩展
4. 不允许在新页面发明新的 spacing / radius / button style
5. 若发现现有页面不一致，优先收敛，不要继续复制不一致
6. UI 改动必须兼顾业务适用性，不要只追求截图好看
7. 输出代码前先自检：是否复用了 shared components，是否引入了新的视觉例外

## 9. 本轮收敛范围

本次 v1 重点已覆盖：

- 主工作台 tabs 与 header
- DevAgent 主界面与 session 区
- 聊天区的按钮、badge、trace/status 标签
- LongMemory 高使用频率列表与详情区

本轮未强行深改的区域，应在后续继续沿用本规范补齐。
