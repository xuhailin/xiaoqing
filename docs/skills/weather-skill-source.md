# 天气 Skill 来源与备份说明

## 1. 可执行备份（本仓库）

本仓库内**可执行**的天气能力在：

- **目录**：`backend/src/skills/weather/`
- **数据源**：和风天气开发服务（[dev.qweather.com](https://dev.qweather.com/docs/)）
- **用途**：当意图为「查天气」且 `preferredSkill === 'weather'` 时，优先调用本 Skill；成功则小晴直接转述结果，失败则 fallback 到 OpenClaw。
- **配置**：`QWEATHER_API_KEY`（必填）、`QWEATHER_BASE_URL`（可选，默认 `https://devapi.qweather.com`）。未配置 KEY 时不调用本 Skill，直接走 OpenClaw。

详见 `backend/src/skills/weather/README.md`。

## 2. 市场来源备份（ClawHub / OpenClaw）

以下为「从 skills 市场」可获取的天气 skill 参考，便于对照或将来对接自建 OpenClaw 实例。

- **ClawHub**：<https://www.clawhub.com/>、<https://clawhub.ai/skills>，技能坞，可搜索并安装 skill 包。
- **OpenClaw Hub**：天气类 skill 安装示例：
  - 文档：[OpenClaw Hub Location Skills](https://openclaw-hub.org/openclaw-hub-location-skills.html)（含 Maps & Weather 等）
  - 安装命令（示例）：`clawhub install weather`
- **说明**：上述 market 的 weather skill 主要面向自建 OpenClaw 实例；本项目中小晴对接的是**腾讯云托管 Claw**，工具层优先使用本仓库内的和风天气实现，失败再委派给 Claw。
