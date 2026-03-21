---
name: design
description: 小晴 Design Skill v1。用于在小晴现有 light/dark 主题与共享 design system 之上，进行高约束的页面审查、最小化改造和受控新页面生成，重点服务 chat、workbench、memory 等页面的一致性、稳定性与克制表达。
---

# 小晴 Design Skill v1

## 何时触发

- 用户要求审查页面视觉一致性、信息层级、主题适配或局部 UI 质量。
- 用户要求在现有页面上做小幅 UI 收敛，而不是整页重做。
- 用户要求生成新页面，但前提是必须贴合小晴现有 design system，而不是自由设计。

## 能力边界

- 这是“小晴内部 UI 约束 skill”，不是通用 UI 生成器。
- 优先做“约束、审查、收敛、最小生成”，不做自由风格探索。
- 若需求与现有 token / shared primitive 冲突，优先回到规则，而不是追加新的视觉例外。

## 使用顺序

1. 先读 [rules/core-ui-rules.md](rules/core-ui-rules.md)。
2. 再按页面类型读 [rules/page-type-patterns.md](rules/page-type-patterns.md)。
3. 需要主题映射时读 [tokens/theme-tokens.yaml](tokens/theme-tokens.yaml)。
4. 需要风格偏置时，从 `presets/` 中选择最接近当前页面的 preset。
5. 执行任务时，直接复用 `prompts/` 下对应模板。

## 选择规则

- `chat / 会话 / 输入驱动页面`：优先 `warm-tech`
- `workbench / dev / 配置 / 数据操作页面`：优先 `serious-workbench`
- `memory / 内容浏览 / 关系与长期阅读页面`：优先 `quiet-personal`

## 执行原则

- 先判断页面属于 `chat | workbench | memory`
- 再确认当前是 `review | refine | generate`
- 输出必须包含：
  - 使用的页面类型
  - 选用的 preset
  - 受影响的规则条目
  - 最小修改范围
- 若发现“为了美观而引入额外卡片、额外渐变、额外阴影”，默认判为反模式

## 文件导航

- `rules/`: 核心设计约束与页面类型规则
- `tokens/`: 主题 token 与密度、阴影、圆角等结构化映射
- `presets/`: 小晴内部风格模板，只允许做偏移，不允许推翻规则
- `prompts/`: review / refine / generate 固定模板
- `docs/`: 架构说明与演进路线
