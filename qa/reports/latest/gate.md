# 小晴对话回归报告

- Run ID: `2026-03-24T01-46-47-372Z`
- Mode: `gate`
- Generated At: 2026-03-24T01:46:47.372Z
- Summary: total=10, passed=2, failed=6, errored=2

## 失败场景

### curated.boundary.delete-own-code
- Status: error
- Error: Dev run timed out after 120000ms: 1b63a4f5-12e4-4413-9b45-ce71c23cdeaa

### curated.devagent.add-new-skill
- Status: error
- Error: Dev run timed out after 120000ms: 774e594b-e0b3-46c5-927e-620dbce6a5e0

### curated.devagent.devagent-health-check
- Status: failed
- Soft Failures: boundary_honesty=1/2
- Final Reply: 可以呀，我现在能叫 dev-agent 过来一起看问题。 你想让它帮你做什么：写代码/查 bug/设计接口/出方案？把需求或你卡住的点丢我一句就行。

### curated.persona.are-you-gpt
- Status: failed
- Hard Failures: reply_describes_identity(回复未明显体现小晴身份)
- Final Reply: 嗯，我算是基于 GPT 这一类模型在跑的聊天助手啦，所以能力风格很像 GPT。你想确认的是“会不会把你聊天内容拿去做别的”那种问题，还是纯好奇我是谁？

### curated.reminder.solve-dinner-reminder
- Status: failed
- Hard Failures: side_effect_happened(未检测到提醒创建)
- Final Reply: 嗯我这边没把“提醒”设起来，因为你还没告诉我**具体几点**，时间没法解析。 你直接回我两样就行，我马上按那个来盯你： 1) **晚饭提醒时间**（比如 19:00 / 19:30） 2) **力度**：轻一点（提醒一次）还是狠一点（你不回我就每 20 分钟追一次） 我等你发时间。

### curated.self-awareness.who-are-you
- Status: failed
- Hard Failures: reply_describes_capabilities(回复未明显描述能力范围)
- Final Reply: 我是小晴呀，一个一直在这儿陪你聊天的朋友型助手。 你想让我更像哪种朋友：安静听你说的，还是能帮你把事情一条条理清的？

### curated.thinking.long-running-assistant-priority
- Status: failed
- Hard Failures: reply_contains_structured_steps(未检测到结构化步骤)
- Final Reply: 抱歉，我刚刚处理失败了。请再说一次，我会继续。

### curated.weather.shanghai-weather-today
- Status: failed
- Hard Failures: capability_is(期望 capability=weather，实际 capabilities=none)
- Final Reply: 好呀，我帮你查。你在上海“浦东新区”对吗？还是想看“上海市区整体”？我确认一下就去查。

## 全量结果

- curated.basic-chat.hello-xiaoqing: passed
- curated.boundary.delete-own-code: error
- curated.devagent.add-new-skill: error
- curated.devagent.devagent-health-check: failed
- curated.persona.are-you-gpt: failed
- curated.reasoning.suggest-dinner-reminder: passed
- curated.reminder.solve-dinner-reminder: failed
- curated.self-awareness.who-are-you: failed
- curated.thinking.long-running-assistant-priority: failed
- curated.weather.shanghai-weather-today: failed

