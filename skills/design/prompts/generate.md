# Design Generate Prompt

用于新页面生成，但必须生成“小晴体系内的新页面”，不是自由设计稿。

## 输入

- 页面目标：`{{page_goal}}`
- 页面类型：`{{page_type}}`
- 关联页面：`{{reference_pages}}`
- 当前主题要求：`{{theme_requirement}}`
- 选用 preset：`{{preset}}`
- 功能模块：`{{sections}}`

## 必守约束

- 先判断最接近现有哪类页面，再生成
- 生成结果必须继承小晴既有 token、层级、容器关系
- 默认采用最少视觉元素完成信息组织
- 不做自由发挥式 hero、装饰背景、卡片堆叠
- 若不能归类为 `chat | workbench | memory`，先拒绝生成并要求重新分类

## 固定输出结构

1. `Page Contract`
   页面目标、页面类型、选用 preset。

2. `Shell Strategy`
   页面背景、header、主内容区分别如何处理。

3. `Section Plan`
   列出页面的一级 section，最多 4 个。

4. `Surface Rules`
   说明哪些地方透明、哪些地方用 panel、哪些地方严禁卡片。

5. `Theme Mapping`
   说明 light / dark 如何共用一套语义 token。

6. `Primitive Mapping`
   说明应复用哪些 shared components / classes / token。

7. `Non-goals`
   列出 3 条明确不做的设计动作，用来防止过度设计。

## 结论规则

- 若输出让页面看起来像“新产品”，说明失败
- 若输出主要依赖新增视觉样式而不是既有系统，说明失败
