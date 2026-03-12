# ClawHub 市场与推荐 Skill 说明

> 与 [天气 Skill 来源](weather-skill-source.md) 并列，本文说明 ClawHub/OpenClaw 技能市场、skill-creator 来源，以及适合小晴项目的 5 个推荐 skill。

---

## 1. ClawHub 市场概览

- **ClawHub**：OpenClaw 官方技能市场（<https://claw-hub.net/>），常被类比为「npm for AI agents」。
- **规模**：三千余个已审核 skill，支持向量语义搜索、版本管理、社区评分；安装方式示例：`clawhub search "关键词"`、`clawhub install skill-name`。
- **安全**：安装前建议查看星级、下载量、评论；2026 年 2 月 ClawHavoc 事件后，ClawHub 已加强审核与 VirusTotal 扫描，仍建议只安装可信作者与高星技能。

本项目中小晴对接的是**腾讯云托管 Claw**，工具能力由托管侧已配置的 skills 提供；若自建 OpenClaw 实例，可从 ClawHub 安装上述 skill。

---

## 2. skill-creator 的市场来源

- **结论**：存在名为 **skill-creator** 的 skill，但其**主要文档与安装来源不在 ClawHub 官网首页/主推列表**，而在 **Clawdbot** 相关渠道。
- **已知来源**：
  - 文档：<https://getclawdbot.org/skills/skill-creator>
  - 技能页：<https://skills.sh/clawdbot/clawdbot/skill-creator>
  - 安装示例：`moltbot install skill-creator`（Clawdbot/OpenClaw 生态的另一安装方式）。
- **说明**：ClawHub 上可通过搜索 `skill-creator` 或 `clawdbot` 确认是否已上架；若需使用，建议以官方/Clawdbot 文档为准。

---

## 3. 适合小晴项目的 5 个推荐 Skill（ClawHub 较火）

结合「小晴 × OpenClaw」场景（聊天 + 记忆 + 人格 + 委派工具：天气/邮件/搜索/日程等），以下 5 个在 ClawHub 上较火且与项目契合，可作为托管 Claw 配置或自建实例时的参考。

| 推荐 | Skill 名称 | 热度/用途 | 与小晴的契合点 |
|------|------------|-----------|----------------|
| 1 | **Summarize** | 约 1 万+ 下载，摘要 | 与现有「手动总结 + 记忆」流程互补，长对话/长文可委派给 Claw 做摘要再回填。 |
| 2 | **Tavily Web Search** | 约 8k+ 下载，网络搜索 | 委派查实时信息（天气、新闻、事实），与「搜索/实时信息」意图一致。 |
| 3 | **Capability Evolver** | 约 3.5 万下载，AI 能力进化 | 与人格/能力进化相关，可参考其「可控进化」思路，与双池约束配合。 |
| 4 | **self-improving-agent** | 约 1.6 万下载、高星，自改进代理 | 社区评分高，适合研究「在规则下改进行为」的模式，与「规则驱动、不自主写记忆」一致。 |
| 5 | **Wacli** / **ByteRover** | 各约 1.6 万下载，CLI/通用任务 | 扩展委派工具面（命令行、通用任务），适合工具型意图分流后的执行层。 |

若更偏产品落地而非研究进化，可将第 3、4 换为 **GitHub**（仓库/Issue/PR）或 **Gog**（Google Workspace），用于开发或日程/邮件等场景。

---

## 4. 与本仓库的关系

- 小晴的**天气**能力优先使用本仓库本地 Skill（和风 API），见 [weather-skill-source.md](weather-skill-source.md)；失败则 fallback 到 OpenClaw。
- 其他工具型意图（搜索、邮件、日程等）由意图识别为 `toolNeed === 'openclaw'` 后，统一委派给腾讯 Claw 插件/托管执行；托管侧可配置上述 ClawHub 技能或自有 skill。
- 技术方案与意图分流详见 [TECH-OPENCLAW-INTEGRATION.md](../requirements/TECH-OPENCLAW-INTEGRATION.md)。
