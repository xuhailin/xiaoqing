# XiaoQing Shared UI Primitives

所有页面必须优先使用以下共享组件，而不是在业务组件中另起一套视觉语言。
审查时，如果发现业务页面中手写了与下列 primitive 功能重叠的 HTML/CSS，应判定为违规。

路径前缀：`frontend/src/app/shared/ui/`

## 容器与布局

### AppPanel (`app-panel`)
一级内容容器。所有需要"从背景中抬起"的区域都应使用此组件。

| 属性 | 可选值 | 说明 |
|------|--------|------|
| variant | `surface` / `workbench` / `subtle` / `soft` / `success` / `warning` / `danger` | 容器视觉风格 |
| padding | `none` / `sm` / `md` / `lg` | 内边距 |
| accent | `none` / `info` / `success` / `warning` / `danger` | 左侧强调色条 |

使用场景：workbench 功能区、memory 详情区、状态面板。
禁止场景：chat 消息流外层、纯装饰包裹。

## 标题层级

### AppPageHeader (`app-page-header`)
页面级标题，每个页面最多出现一次。

| 属性 | 说明 |
|------|------|
| title | 页面主标题（必填） |
| eyebrow | 上方小字说明 |
| description | 标题下方描述文字 |
| `[actions]` slot | 右侧操作按钮区 |

### AppSectionHeader (`app-section-header`)
区块级标题，用于页面内的 section 分组。接口与 AppPageHeader 相同。

使用规则：
- PageHeader 比 SectionHeader 更重，SectionHeader 比正文更轻
- 同一页面不要同时出现两种自定义标题样式

## 交互控件

### AppButton (`app-button`)
统一按钮。

| 属性 | 可选值 | 说明 |
|------|--------|------|
| variant | `primary` / `secondary` / `ghost` / `success` / `danger` | 按钮风格 |
| size | `xs` / `sm` / `md` | 尺寸 |
| stretch | boolean | 是否撑满宽度 |

使用规则：
- 一个视口内最多一个 `primary` 按钮
- 列表行内操作用 `ghost` 或 `secondary` + `xs`/`sm`

### AppTabs (`app-tabs`)
分组切换。

| 属性 | 可选值 | 说明 |
|------|--------|------|
| appearance | `primary` / `secondary` | 主次风格 |
| size | `sm` / `md` | 尺寸 |
| fullWidth | boolean | 是否撑满容器 |
| items | `AppTabItem[]` | 每项包含 value/label/icon/count |

### AppBadge (`app-badge`)
标签/状态指示器。

| 属性 | 可选值 | 说明 |
|------|--------|------|
| tone | `neutral` / `info` / `success` / `warning` / `danger` | 语义色调 |
| appearance | `soft` / `outline` | 填充或描边 |
| size | `sm` / `md` | 尺寸 |

## 状态展示

### AppState (`app-state`)
空状态/加载/错误占位。

| 属性 | 可选值 | 说明 |
|------|--------|------|
| kind | `empty` / `loading` / `error` | 状态类型 |
| title | string | 标题（必填） |
| description | string | 补充说明 |
| compact | boolean | 紧凑模式 |

使用场景：列表为空、数据加载中、请求出错。

## 图标

### AppIcon (`app-icon`)
统一图标入口，基于 Lucide 图标库。

| 属性 | 说明 |
|------|------|
| name | 图标名（见下方清单） |
| size | CSS 尺寸字符串，默认 `16px` |
| strokeWidth | 线宽，默认 2 |

可用图标名：`arrowLeft` / `info` / `bell` / `bookmark` / `brain` / `calendarCheck` / `check` / `chevronRight` / `footprints` / `heartPulse` / `lightbulb` / `layoutTemplate` / `message` / `menu` / `minus` / `moon` / `plus` / `route` / `sparkles` / `sun` / `trendingUp` / `alert` / `user` / `userCircle` / `tool` / `close`

品牌图标：`openai` / `claude` / `claw`

## 样式基础层

### _design-system.scss
位于 `frontend/src/styles/_design-system.scss`，定义了上述组件的 CSS 类（`.ui-panel`、`.ui-button`、`.ui-badge` 等）。业务组件不应重复定义这些类的样式。

### _common.scss
位于 `frontend/src/styles/_common.scss`，定义全局容器语义类：

- `.no-panel`：透明容器（无边框、无阴影）
- `.sub-panel`：次级容器（用于 `main-left-section`）
- `.panel`：标准卡片容器（列表项、详情块）
- `.main-left-section`：主区域左侧区域的统一容器类

使用规则：
- 左侧主区域容器（如 memory/chat 左栏）优先使用 `.main-left-section.sub-panel`
- 左侧列表项优先使用 `.panel`
- 不要在业务组件中重复手写这三类容器的视觉体系

### _variables.scss
位于 `frontend/src/styles/_variables.scss`，是所有 CSS 自定义属性（设计 token）的 source of truth。业务组件中的颜色、间距、圆角、阴影必须引用此文件中的变量。

