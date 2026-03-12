# 天气 Skill（本地备份）

本目录为「天气」能力在本仓库的可执行备份，与 OpenClaw/Claw 的天气 Skill 互为补充：当意图为查天气时优先走本 Skill，失败再 fallback 到 OpenClaw。

## 数据来源

- **和风天气开发服务**：<https://dev.qweather.com/docs/>
- 使用「城市搜索」+「实时天气」接口；需在 [和风控制台](https://console.qweather.com) 创建项目并获取 API Key。
- 免费额度可用，详见 [定价与限制](https://dev.qweather.com/docs/finance/pricing/)。

## 配置

- `QWEATHER_API_KEY`：必填，和风 API Key（请求头 `X-QW-Api-Key`）。
- `QWEATHER_BASE_URL`：可选，默认 `https://devapi.qweather.com`；若使用控制台分配的 API Host，请设置为 `https://你的API Host`。

未配置 `QWEATHER_API_KEY` 时，本 Skill 不可用，Conversation 层会 fallback 到 OpenClaw。

## 市场来源备份

ClawHub/OpenClaw 的 weather skill 来源与安装方式见项目根目录 `docs/skills/weather-skill-source.md`。
