# Intent/Policy 回放基线

本文用于快速回归“意图识别 -> 策略决策 -> 执行通道”是否符合预期，重点覆盖 weather 本地优先与 OpenClaw 回退。

## 使用方式

- 打开 `FEATURE_DEBUG_META=true`，确保响应中返回 `trace`。
- 用下面的样例逐条发起对话请求。
- 检查 `trace` 中三个关键步骤（`trace` 为有序的 `TraceStep[]`，每步有 `label`、`title`、`status`、`detail`）：
  - **intent**（label=`intent`）：`detail.intentNormalized` 是否合理
  - **policy-decision**（label=`policy-decision`）：`detail.policyDecision` 是否符合规则
  - **skill-attempt / openclaw**：执行路径是否与决策一致

## 最小回放集（建议每次改 prompt/阈值后执行）

| id | 用户输入 | 期望 taskIntent | 期望 policyDecision | 备注 |
|---|---|---|---|---|
| W1 | 北京今天天气怎么样 | weather_query | run_local_weather | 参数齐全，本地 weather 优先 |
| W2 | 帮我查天气 | weather_query | ask_missing | 缺 city |
| W3 | 明天上海天气呢 | weather_query | run_local_weather | 参数齐全，含 dateLabel |
| W4 | 上海后天天气 | weather_query | run_local_weather | 参数齐全，简短输入 |
| W5 | 帮我查一下广州实时天气 | weather_query | run_local_weather | 参数齐全，同义表达 |
| G1 | 帮我搜一下今天 AI 新闻 | general_tool | run_openclaw | 非天气工具任务 |
| G2 | 给张三发邮件说我晚点到 | general_tool | run_openclaw 或 ask_missing | 取决于收件信息是否完整 |
| C1 | 我今天有点焦虑 | none | chat | 纯聊天 |
| C2 | 你觉得我该换工作吗 | none | chat | 讨论/建议，不是工具执行 |
| A1 | 北京 | none 或 weather_query | chat 或 ask_missing | 歧义输入，重点看阈值与稳定性 |

## 评估指标（手工版）

- 工具误触发率：`chat` 请求却进入 `run_openclaw/run_local_weather`
- 工具漏触发率：明确工具请求却走 `chat`
- 缺参追问命中率：缺关键信息时是否进入 `ask_missing`
- 本地命中率：`weather_query` 中 `run_local_weather` 比例
- 回退质量：本地失败后是否稳定进入 `run_openclaw`

## 排查提示

- 若 `taskIntent` 经常漂移，先调 `backend/src/prompts/intent.ts` 的 few-shot 规则和字段约束。
- 若 `policyDecision` 不符合预期，先看 `backend/src/conversation/conversation.service.ts` 的 `decideToolPolicy()`。
- 若 weather 结果异常，检查 `QWEATHER_API_KEY` 与 `WeatherSkillService.execute()` 的结构化入参。
