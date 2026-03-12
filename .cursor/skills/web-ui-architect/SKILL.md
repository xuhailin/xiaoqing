---
name: web-ui-architect
description: Define and enforce warm, simple, low-distraction web UI patterns with consistent design tokens, layout strategies, and responsive behavior. Use when generating or refactoring frontend layouts, CSS/SCSS, or visual structures for this project.
---

# Web UI Architect · Warm & Simple

## 1. 设计原则（Design Principles）

1. **整体一致性优先**
   - 所有视觉决策以「整体一致性 > 局部炫技」为优先。
   - 尽量复用已有布局模式、间距节奏、圆角和阴影定义，而不是为单个模块创造新风格。

2. **温馨、简洁、低干扰**
   - 以「安静的记事本 / 日记本」感为目标：背景柔和、对比适中、无强烈色块。
   - 只在必要位置使用高对比色（如主要按钮、状态提示），其他区域保持克制。

3. **设计 Token 驱动**
   - 所有颜色、字体大小、行高、间距、圆角和阴影，必须通过 Design Tokens 实现：
     - 颜色：`var(--color-...)`
     - 字号：`var(--font-size-...)`
     - 行高：`var(--line-height-...)`
     - 间距：`var(--space-...)`
     - 圆角：`var(--radius-...)`
     - 阴影：`var(--shadow-...)`
   - **禁止**在组件 SCSS 中硬编码十六进制颜色或像素数值，除非该 token 在全局尚未定义且确有必要（优先补齐 token）。

4. **清晰的视觉层级**
   - 通过「字号 + 粗细 + 间距 + 颜色」组合区分层级，而不是只靠颜色。
   - 列表 / 消息流使用统一的垂直间距节奏（如 `var(--space-4)`、`var(--space-5)`）。
   - 卡片、气泡、侧边栏等容器外轮廓统一采用 `--radius-lg` + `--shadow-sm` 或细边框，二选一，不叠加。

5. **局部对齐全局系统**
   - 新增组件必须对齐项目现有的 Design System（如 `ui-design-system.mdc` 中定义的 tokens 和模式）。
   - 例如：通知条复用 Notification 模式，按钮尽量沿用 `.btn--primary` / `.btn--ghost` / `.btn--success`。

---

## 2. 布局策略（Layout Strategy: Flex vs Grid）

1. **整体框架**
   - 页面主框架：使用 `flex` 实现「左侧固定侧边栏 + 右侧主内容」，高度占满 `100vh`。
   - 主内容内部：优先使用 `flex` 进行一维布局（垂直消息流、水平按钮区），需要二维对齐（如卡片网格）时才使用 `grid`。

2. **Flex 使用准则**
   - 适用场景：
     - 单方向排列：消息列表、按钮行、标签行、左右分栏的上层容器等。
     - 垂直布局：`flex-direction: column` + 控制 `gap` 即可表达上下节奏。
   - 约束：
     - 使用 `gap` 控制子元素间距，避免对子元素逐个设置 `margin`。
     - 大多数容器只做一层 `flex`，避免不必要的深层嵌套。
     - 在主内容区内，记得设置 `min-width: 0` 以防止溢出。

3. **Grid 使用准则**
   - 仅在有明显二维布局需求时使用，例如：
     - 配置面板中「标签 + 内容」两列布局。
     - 读物列表、记忆列表需要卡片网格展示时。
   - 定义方式：
     - 使用简洁规则如 `grid-template-columns: repeat(auto-fit, minmax(XXrem, 1fr));`
     - 间距以 `gap: var(--space-3)` 或 `var(--space-4)` 表达。

4. **滚动与区域分割**
   - 布局根节点（如 `.layout`）：`height: 100vh; overflow: hidden;`
   - 可滚动区域（如消息列表）：`flex: 1; overflow: auto; min-height: 0;`
   - 输入区、工具栏、顶部通知区：`flex-shrink: 0;`，避免在窗口变小时被压缩到不可用。

---

## 3. 间距、字号、颜色统一规范

1. **间距（Spacing）**
   - 使用全局 spacing tokens：
     - 内容区外边距 / 主体横向 padding：`var(--space-5)` 或 `var(--space-6)`。
     - 卡片 / 气泡内边距：`var(--space-3)` ~ `var(--space-4)`。
     - 元素间垂直间距：消息/卡片间使用 `var(--space-4)`；小元素间使用 `var(--space-2)`。
   - 禁止在组件内使用随机的 `px` 距离，如 `7px` / `13px`，一律用 `--space-*`。

2. **字号与文字层级**
   - 统一遵循：
     - 元数据、标签、小标签：`var(--font-size-xs)`
     - 一般 UI 文本、输入框、消息气泡：`var(--font-size-md)`
     - 辅助说明 / 次级文字：`var(--font-size-sm)`
   - 字重：
     - 标题、区域名、tab 激活态：`var(--font-weight-semibold)`
     - 一般文本：`var(--font-weight-normal)` 或 `var(--font-weight-medium)`。

3. **颜色（Color System）**
   - 所有颜色通过 tokens 引用，例如：
     - 背景：`--color-bg`, `--color-surface`, `--color-sidebar`
     - 文本：`--color-text`, `--color-text-secondary`, `--color-text-muted`
     - 主色：`--color-primary`, `--color-primary-hover`
     - 成功 / 错误：`--color-success`, `--color-success-bg`, `--color-success-border`, `--color-error`, `--color-error-bg`, `--color-error-border`
     - 记忆 / 人格进化专用：`--color-memory-*`, `--color-evolve-*-*`, `--color-user-bubble`, `--color-assistant-bubble`, `--color-user-label`, `--color-assistant-label`
   - **禁止**：
     - 在组件中硬编码 `#fff`, `#000`, 任意 `#RRGGBB` 或 `rgba(0,0,0,...)`。
     - 使用与 design system 不一致的新语义色，而不先补充 token。

4. **圆角与阴影**
   - 圆角：
     - 消息气泡 / 卡片：`--radius-lg`
     - 按钮 / 输入框：`--radius-md` 或 `--radius-lg`
     - 标签 / Chips：`--radius-pill`
   - 阴影：
     - 仅在需要视觉浮起感时使用 `--shadow-sm` 或 `--shadow-md`。
     - 避免同时使用明显边框 + 重阴影（2 选 1）。

---

## 4. 响应式断点策略

1. **基础断点**
   - 以下断点与设计系统对齐（可作为 `@media` 参考值）：
     - 小屏手机：`max-width: 640px`
     - 平板：`min-width: 641px` 且 `max-width: 768px`
     - 小型笔记本：`min-width: 769px` 且 `max-width: 1024px`
     - 桌面：`min-width: 1025px`

2. **布局变化规则**
   - `< 768px`（手机）：
     - 左侧侧边栏可变为抽屉模式或折叠，仅展示主要聊天区域。
     - 聊天气泡最大宽度可提升至 88% 宽度。
   - `768px ~ 1024px`（平板 / 小笔记本）：
     - 侧边栏宽度略缩小（如 280px），主内容保留足够宽度。
   - `> 1024px`（桌面）：
     - 采用完整布局：固定侧边栏 + 宽主内容区，气泡最大宽度约为 75% ~ 78%。

3. **响应式写法约束**
   - 优先使用 `max-width` / `min-width` 媒体查询包裹局部样式，而不是在多个断点中逐项覆盖同一属性。
   - 避免在响应式中重新发明一套 spacing / radius，而是基于同样的 tokens 微调（如只改 `gap` 或 `max-width`）。

---

## 5. 禁止事项（Anti-patterns）

1. **样式层面**
   - ❌ 在组件 SCSS 中：硬编码颜色、随机像素值、使用 `!important` 解决层叠顺序。
   - ❌ 同时给同一元素加粗边框 + 重阴影，造成视觉噪音。
   - ❌ 为单个组件引入完全不同的视觉语言，不与 Design System 协调。

2. **布局层面**
   - ❌ 深度嵌套 `<div>`，仅为实现简单的水平/垂直对齐。
   - ❌ 使用 `position: absolute` + magic number 进行主布局，对抗已有的 flex/grid 框架。
   - ❌ 在多处复制粘贴相同布局 / 间距模式，而不抽象为可复用类或组件。

3. **响应式层面**
   - ❌ 只针对某一个分辨率「对齐到像素」，却忽略其他区间。
   - ❌ 在媒体查询中完全重写组件结构或大段覆盖，而不基于原有样式做增量调整。

4. **工程性层面**
   - ❌ 在 Angular 组件的 TypeScript 中使用内联 `style` / `style` 绑定来实现布局或配色。
   - ❌ 将视觉常量（颜色、间距、字号）写死在业务逻辑或模板中。

---

## 6. 使用方式（How to Apply）

1. **对照 Design Tokens**：先查找项目现有 tokens（如 `_variables.scss` 或 `ui-design-system.mdc`），决定使用哪些 `--color-*` / `--space-*` / `--radius-*`。
2. **选择布局模式**：分析当前需求是一维还是二维布局，选用 `flex` 或 `grid`，并保持层次扁平。
3. **设计消息流 / 面板**：对于列表、消息流、配置卡片，使用统一的间距节奏和圆角、阴影。
4. **添加响应式行为**：根据断点规则添加必要的 `@media`，确保在手机、平板、桌面下都可用。
5. **检查 Anti-patterns**：完成后扫描是否存在硬编码颜色、magic numbers、`!important`、过度嵌套等问题，并修正。
