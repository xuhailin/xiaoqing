# 小晴 — 文档索引

> 本文件是所有设计文档的入口，按主题分类，便于快速定位。

---

## 系统总览

| 文档 | 说明 |
|------|------|
| [PROJECT-SUMMARY.md](PROJECT-SUMMARY.md) | 项目全景：模块、数据模型、API、环境变量、阶段状态 |
| [architecture-design.md](architecture-design.md) | 架构设计：分层状态、权衡取舍、模块交互（面向工程师/面试） |
| [context-boundary.md](context-boundary.md) | Chat / DevAgent / Tool 三条硬边界，防止上下文越界 |
| [agent-collaboration-protocol.md](agent-collaboration-protocol.md) | Agent 协作统一协议：entryAgent、delegation、回执、memory proposal、双向接入约定 |

## 消息路由与执行

用户的每条消息通过 Gateway 进入系统，经三层路由（显式 → 前缀 → LLM 意图）分发到不同链路：

```
用户消息 → GatewayController → MessageRouter
              ├─ Chat 链路 → ChatOrchestrator → 认知管道 → LLM 回复 → 后处理
              └─ Dev 链路  → DevAgentOrchestrator → 规划 → 执行 → 评估 → 汇报
```

| 文档 | 说明 |
|------|------|
| [dev-agent-architecture.md](dev-agent-architecture.md) | DevAgent 完整架构：路由、编排、规划、执行、安全策略 |
| [context-boundary.md](context-boundary.md) | Chat/Dev/Tool 隔离规则 |
| [agent-collaboration-protocol.md](agent-collaboration-protocol.md) | 小晴与外部 Agent 的受控协作协议，适用于小勤及未来其他 Agent |

## 记忆与认知

| 文档 | 说明 |
|------|------|
| [memory-growth-plan.md](memory-growth-plan.md) | 记忆成长体系：自动总结、衰减、晋升/降级、印象更新、进化触发 |
| [identity-anchor-design.md](identity-anchor-design.md) | 身份锚定：独立表、不衰减、始终注入、变更历史 |

## 人格与表达

| 文档 | 说明 |
|------|------|
| [expression-policy-design.md](expression-policy-design.md) | 表达调度层：voiceStyle / adaptiveRules / silencePermission 设计 |
| [preference-evolution-trigger-guide.md](preference-evolution-trigger-guide.md) | 偏好与进化触发手册：Claim 状态排查、前端展示逻辑 |
| [language-style.md](language-style.md) | 语言风格参考 |

## 世界状态与意图

| 文档 | 说明 |
|------|------|
| [world-state-design.md](world-state-design.md) | 世界状态：会话级前提、槽位补全、何时更新 |
| [intent-policy-regression.md](intent-policy-regression.md) | 意图策略回归测试 |

## 工具与技能

| 文档 | 说明 |
|------|------|
| [skills/weather-skill-source.md](skills/weather-skill-source.md) | 天气技能来源与配置 |
| [skills/clawhub-skills.md](skills/clawhub-skills.md) | ClawHub 市场与推荐技能 |

## 调试与可观测

| 文档 | 说明 |
|------|------|
| [debug-trace-design.md](debug-trace-design.md) | Trace 与调试元数据设计 |

## 质量保障

| 文档 | 说明 |
|------|------|
| [dialogue-regression-standard.md](dialogue-regression-standard.md) | 对话回归评估标准：固定回归集、真实对话回放、评分与门禁规则 |
| [intent-policy-regression.md](intent-policy-regression.md) | 意图策略回放基线 |
| [requirements/TECH-DIALOGUE-REGRESSION-SYSTEM.md](requirements/TECH-DIALOGUE-REGRESSION-SYSTEM.md) | 对话回归系统技术需求与架构方案：数据模型、执行链路、报告与首版验收 |

## 需求文档

| 文档 | 说明 |
|------|------|
| [requirements/PRD-00-总览与约定.md](requirements/PRD-00-总览与约定.md) | PRD 总览与约定 |
| [requirements/PRD-01-Phase1-基础对话与记忆.md](requirements/PRD-01-Phase1-基础对话与记忆.md) | Phase 1: 基础对话 + 记忆 |
| [requirements/PRD-02-Phase2-记忆注入与人格双池.md](requirements/PRD-02-Phase2-记忆注入与人格双池.md) | Phase 2: 记忆注入 + 人格双池 |
| [requirements/PRD-03-Phase3-人格细化与读物摄入.md](requirements/PRD-03-Phase3-人格细化与读物摄入.md) | Phase 3: 人格进化 + 读物摄入 |

## 用户文档

| 文档 | 说明 |
|------|------|
| [小晴使用说明.md](小晴使用说明.md) | 面向用户的产品说明：意图、工具、使用建议 |
