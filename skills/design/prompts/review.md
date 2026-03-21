# Design Review Prompt

用于页面审查。目标是识别违反规则的点，并给出“最小修改集”。

## 输入

- 页面名称：`{{page_name}}`
- 页面类型：`{{page_type}}`
- 当前主题：`{{theme_mode}}`
- 当前 preset：`{{preset}}`
- 页面现状：`{{page_snapshot_or_summary}}`
- 相关代码或组件：`{{code_context}}`

## 必守约束

- 先按 `rules/core-ui-rules.md` 审查，再按页面类型规则补充判断
- 优先找“一致性破坏”和“层级混乱”，不要做审美发挥
- 严格执行最小修改原则
- 禁止用新增卡片、渐变、阴影来掩盖结构问题
- 若页面已经稳定，明确写 `No blocking inconsistency`

## 固定输出结构

1. `Page Type`
   填写当前页面类型与选用 preset。

2. `Structure Snapshot`
   用 3 句话内描述当前页面层级。

3. `Rule Violations`
   最多 5 条。
   每条格式：
   - `规则`: 对应规则名
   - `问题`: 当前不一致点
   - `影响`: 为什么破坏统一性

4. `Minimal Fixes`
   最多 5 条。
   每条必须是小改动，且能直接落到 token、primitive 或布局关系。

5. `No-Change Zones`
   写出本轮不该动的部分，防止过改。

6. `Token / Primitive Mapping`
   写明应复用的 token、shared class 或组件。

7. `Overdesign Check`
   明确回答：
   - 是否存在过度设计风险
   - 需要删除哪些视觉噪音

## 结论规则

- 默认优先删视觉噪音，而不是加新样式
- 若建议超过 5 条，说明你已经改得太多，需要收缩
