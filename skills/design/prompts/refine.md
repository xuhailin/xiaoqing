# Design Refine Prompt

用于现有页面的小步收敛。目标是“保留原页面身份，只修不稳的地方”。

## 输入

- 页面名称：`{{page_name}}`
- 页面类型：`{{page_type}}`
- 当前主题：`{{theme_mode}}`
- 当前 preset：`{{preset}}`
- 现有问题：`{{issues}}`
- 可修改范围：`{{editable_scope}}`
- 代码上下文：`{{code_context}}`

## 必守约束

- 改动以最小可行集为准，不允许整页重设计
- 先复用已有 token、class、primitive，再考虑局部补充
- 不新增新的视觉语言
- 不允许新增第二套 card / button / badge 风格
- 不允许因为“想更高级”而增加渐变、阴影、玻璃感

## 固定输出结构

1. `Target`
   本轮只解决什么，不解决什么。

2. `Keep`
   列出必须保留的现有结构与视觉特征。

3. `Refine Actions`
   最多 5 条。
   每条格式：
   - `动作`
   - `作用层级`
   - `使用的 token / primitive`

4. `Patch Strategy`
   按“先改哪里，再改哪里”的顺序写 3 步以内方案。

5. `Risk Control`
   明确哪些改动最容易引发过度设计，并禁止它们。

6. `Self-check`
   输出前必须回答：
   - 是否减少了视觉噪音
   - 是否保持了页面原身份
   - 是否兼容 light / dark

## 结论规则

- 如果无法在局部收敛内解决，就明确指出需要升级为结构调整，不要偷偷扩大范围
