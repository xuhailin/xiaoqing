# Project Agent Rules

## Global Rules

- **AI 文档导航**：复杂任务先读 `docs/ai/project-index.md`，再按主题读 `docs/skills/*-skill.md`；长期架构文档优先于 `docs/plans/**` 与未验收的 implementation plan。详见 `CLAUDE.md` 第 9 节与 `.cursor/rules/xiaoqing-ai-docs-navigation.mdc`。
- **助手架构目标**：小晴助手管线以五能力（感知、决策、执行、回复组织、回合后处理）为架构目标，决策权集中、意图只描述含义、回复层只做表达。详见 `docs/assistant-architecture-principles.md`；修改助手/对话相关代码时须遵循该文档（代码目录为 `backend/src/assistant/**`）。
- 未经用户明确要求，不要自动创建、修改或补充任何测试文件（如 `*.spec.*`、`*.test.*`、`__tests__/`）。
- 如需通过测试定位问题，优先运行现有测试；若必须新增/修改测试，先征得用户确认。
