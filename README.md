<div align="center">

# XiaoQing (小晴)

**A Long-Term AI Companion That Remembers, Decides, and Acts**

An AI companion with layered memory, constrained persona evolution, and real execution capabilities — not just a chatbot, but a partner that grows with you.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![Angular](https://img.shields.io/badge/Angular-21-DD0031?logo=angular)](https://angular.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-blue?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](#why-xiaoqing) · [中文](#为什么是小晴)

</div>

---

## Why XiaoQing?

Most AI assistants fall into two camps: chatbots that forget everything, or tool agents that have no personality. XiaoQing is neither.

**XiaoQing is a long-term companion that understands you, remembers your journey, and can actually help you get things done.**

Consider this: you tell an AI "I keep forgetting to eat." A typical chatbot might say "That's not healthy, you should set reminders." XiaoQing would say "Want me to remind you every day? I'll remember."

That's the difference — **understanding + memory + action**.

### What makes it different?

| Typical AI | XiaoQing |
|---|---|
| Forgets after context window | Layered memory: mid-term → long-term with natural decay |
| Can only chat | Can chat **and** execute — tools, commands, real actions |
| Static personality | Dual-pool constrained persona evolution (you approve changes) |
| Dumps all history into context | Token-budgeted injection with decay scoring and LLM re-ranking |
| User = a settings page | Evidence-based Claim Engine builds understanding over time |
| Every conversation starts fresh | Every conversation is a chapter in an ongoing relationship |

---

## Three Roles, One Companion

XiaoQing naturally switches between three roles based on what you need:

### Companion — Chat & Emotional Support

When you're just talking, XiaoQing is a friend who knows your context. She adapts her tone, depth, and pacing through a **Cognitive Pipeline** that analyzes each message:

```
User message → Situation Recognition → User State → Response Strategy → Reply
```

"What should I have for dinner" gets a casual response. "I'm questioning my career" gets thoughtful, paced engagement. Same AI, different depth — because she understands the difference.

### Executor — Tools & Actions

When you need something done, XiaoQing recognizes the intent and acts:

```
"What's the weather in Tokyo?"  → WeatherSkill → result in her own words
"Help me search for X"         → Browser tool → summarized findings
"/dev npm test"                → DevAgent → plan, execute, report back
```

All through a **unified Gateway** with 3-tier routing:

1. **Explicit**: `mode: 'dev'` in API → dev channel
2. **Prefix**: `/dev` or `/task` → dev channel
3. **LLM intent**: automatic classification → route accordingly
4. **Default**: chat

Tools are XiaoQing's "hands" — you always talk to her, she handles the execution behind the scenes.

### Chronicler — Memory & Life Journal

Over time, XiaoQing builds a layered understanding of you:

- **Identity Anchors** — your core facts (name, role), never decay, always present
- **Long-term Memory** — stable facts reinforced by repetition
- **Mid-term Memory** — recent insights that fade if not reinforced
- **Impressions** — evolving overall picture of who you are
- **Claims** — evidence-based beliefs (CANDIDATE → WEAK → STABLE → CORE)

Every memory is traceable to source messages. Your journey — what you cared about at different times, how your thinking evolved — becomes visible and navigable.

---

## Key Systems

### 1. Unified Message Routing

Every message enters through a single Gateway and gets routed intelligently:

```
User → Gateway → MessageRouter
         ├─ Chat Path → Intent → WorldState → Memory → Cognitive Pipeline → LLM → Post-Turn
         └─ Dev Path  → Planner → Executor → Evaluator → Reporter
```

Chat and Dev are **fully isolated** — dev tasks never pollute your conversation memory.

### 2. Hierarchical Memory with Natural Decay

```
Conversation → Auto-summarize (threshold: 15 messages)
                    ↓
              Mid-term Memory (extracted insights)
                    ↓ (5+ hits, 7+ days old → promotion)
              Long-term Memory (stable, slow decay)
                    ↓ (30 days no hits → demotion)
              Fade away (decay candidates, reviewed before removal)
```

**Decay formula**: `score = 2^(-daysSinceAccess / halfLife) + hitCount × hitBoost`

9 memory categories, each with tuned half-lives: `shared_fact` (90 days), `commitment` (14 days), `correction` (high recall weight), `soft_preference`, `judgment_pattern`, `value_priority`, `rhythm_pattern`, and more.

### 3. Dual-Pool Persona Evolution

```
┌─────────────────────────────────┐
│    Persona Layer (stable)       │ ← identity, personality,
│    Almost never changes         │   valueBoundary, behaviorForbidden
└──────────────┬──────────────────┘
               │ guardrails
               ▼
┌─────────────────────────────────┐
│    Expression Layer (tunable)   │ ← voiceStyle, adaptiveRules,
│    Updates more freely          │   silencePermission
└──────────────┬──────────────────┘
               │ suggestions
               ▼
┌─────────────────────────────────┐
│    Human Confirmation           │ ← preview → approve → write
└─────────────────────────────────┘
```

"Be more casual" → routes to Expression Layer (safe). "Change my values" → flagged as high-risk, requires strong evidence.

### 4. DevAgent — Self-Improving Execution

An isolated execution track for development tasks:

```
User: "run the tests"
  ↓
DevAgentOrchestrator
  ├─ Planning: LLM generates plan (≤2 steps/round)
  ├─ Execution: Shell (whitelist) or OpenClaw
  ├─ Evaluation: progress check, auto-replan on failure
  └─ Reporting: natural language summary + transcript.jsonl
```

Safety: shell command whitelist, 30s timeout, 100KB output cap, max 3 replan rounds.

DevAgent is designed to **continuously improve** — its planning, execution strategies, and error recovery can evolve over time.

### 5. Evidence-Based User Understanding

```
Observation → Evidence (SUPPORT/CONTRA/NEUTRAL, weighted)
                ↓
         Claim (structured belief about you)
           CANDIDATE → WEAK → STABLE → CORE
                ↓
         UserProfile (only STABLE/CORE visible)
```

No snap judgments. A claim needs multiple supporting observations before it graduates. Contradicting evidence can demote it.

### 6. Life Record & Cognitive Trace

- **Life Record** — From conversations we extract structured **TracePoints** (events, mood, plans, reflections), group them by day, and generate **Daily Summaries**. APIs: `/trace-points`, `/daily-summaries`. See [docs/life-record-design.md](docs/life-record-design.md).
- **Cognitive Trace** — Per-turn **cognitive observations** (what XiaoQing perceived, decided, remembered) are stored and shown in a timeline view. This is separate from debug trace (pipeline steps) and from user life events. APIs: `/cognitive-trace/observations`. See [docs/cognitive-trace-design.md](docs/cognitive-trace-design.md).

### 7. Desktop Pet (Live2D)

A Tauri 2 desktop companion — transparent, always-on-top, draggable:

- **States**: idle / speaking / thinking, driven by backend SSE
- **Customization**: outfit switching via Parts Visibility
- **Rendering**: PixiJS 6 + Cubism 4 Core

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Angular Frontend                        │
│  ┌──────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌───────────┐  │
│  │ Chat │ │ Memory │ │ Persona │ │DevAgent│ │  Reading  │  │
│  └──┬───┘ └───┬────┘ └────┬────┘ └───┬────┘ └─────┬─────┘  │
└─────┼─────────┼───────────┼──────────┼─────────────┼────────┘
      ▼         ▼           ▼          ▼             ▼
┌──────────────────────────────────────────────────────────────┐
│                      NestJS Backend                          │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Gateway → MessageRouter (explicit/prefix/LLM intent) │   │
│  └───────────┬─────────────────────────┬─────────────────┘   │
│              │                         │                     │
│      ┌───────▼───────┐        ┌───────▼───────┐             │
│      │  Chat Path    │        │   Dev Path    │             │
│      │               │        │               │             │
│      │ Intent        │        │ Planner       │             │
│      │ WorldState    │        │ Executor      │             │
│      │ Capability    │        │ Evaluator     │             │
│      │ Memory Recall │        │ Reporter      │             │
│      │ Cognitive     │        │               │             │
│      │ PromptRouter  │        └───────────────┘             │
│      │ LLM           │                                      │
│      │ PostTurn       │                                      │
│      └───────────────┘                                      │
│                                                              │
│  ┌──────────┐ ┌────────┐ ┌─────────┐ ┌──────────────────┐   │
│  │ Memory   │ │Persona │ │ Claim   │ │Capability        │   │
│  │ Service  │ │Service │ │ Engine  │ │Registry (tools)  │   │
│  └────┬─────┘ └───┬────┘ └────┬────┘ └────────┬─────────┘   │
└───────┼───────────┼───────────┼────────────────┼─────────────┘
        ▼           ▼           ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Prisma)                        │
│  Memory | Persona | UserClaim | DevSession | DevRun | ...    │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS 11 + TypeScript |
| ORM | Prisma 7 |
| Database | PostgreSQL (local) |
| Frontend | Angular 21 (Standalone Components) |
| Desktop Pet | Tauri 2 + PixiJS 6 + Cubism 4 (Live2D) |
| LLM | OpenAI-compatible API (mock available for offline dev) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (local instance)
- An OpenAI-compatible API key (optional — works with mock responses)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/xiaoqing.git
cd xiaoqing
npm run install:all
```

### 2. Configure & Initialize Database

```bash
cp backend/.env.example backend/.env
# Edit backend/.env:
#   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat?schema=public"
#   OPENAI_API_KEY=sk-xxx  (optional, uses mock without it)

cd backend && npx prisma db push && npx prisma generate
```

### 3. Run

```bash
# Terminal 1 — Backend (http://localhost:3000)
npm run backend

# Terminal 2 — Frontend (http://localhost:4200)
npm run frontend
```

Open `http://localhost:4200` and start chatting.

---

## Project Structure

```
xiaoqing/
├── backend/
│   ├── src/
│   │   ├── gateway/              # Unified entry + 3-tier message routing
│   │   ├── orchestrator/         # Dispatcher + agent adapters
│   │   ├── assistant/            # Core AI companion
│   │   │   ├── conversation/     #   ChatOrchestrator + TurnContext
│   │   │   ├── cognitive-pipeline/ # Situation → state → strategy
│   │   │   ├── cognitive-trace/  #   L1 observations (cognitive timeline)
│   │   │   ├── memory/           #   Decay, recall, promotion, WriteGuard
│   │   │   ├── summarizer/       #   Auto-summarize → memory extraction
│   │   │   ├── persona/          #   7-field persona + evolution engine
│   │   │   ├── identity-anchor/  #   User-declared facts (never decay)
│   │   │   ├── claim-engine/     #   Evidence-based user profiling
│   │   │   ├── prompt-router/    #   Versioned prompt composition
│   │   │   ├── intent/           #   Intent + slot filling + worldState
│   │   │   ├── post-turn/        #   Auto-summarize, impression, growth
│   │   │   └── life-record/      #   TracePoint + DailySummary + DailyMoment
│   │   ├── dev-agent/            # Isolated dev task execution
│   │   │   ├── planning/         #   LLM → plan → parse → normalize
│   │   │   ├── execution/        #   Shell/OpenClaw + evaluator + replan
│   │   │   └── reporting/        #   Final report + transcript.jsonl
│   │   ├── action/               # Capability registry + tools + skills
│   │   └── infra/                # LLM wrapper, token estimator, tracing
│   └── prisma/
│       └── schema.prisma         # 20+ data models
├── frontend/                     # Angular 21 SPA
│   └── src/app/
│       ├── chat/                 #   Chat interface
│       ├── memory/               #   Memory viewer/editor
│       ├── persona/              #   Persona config (dual pools)
│       ├── life-trace/           #   Life Record timeline (TracePoint + DailySummary)
│       ├── cognitive-trace/      #   Cognitive observation board
│       ├── dev-agent/            #   DevAgent session panel
│       └── ...
├── desktop/                      # Tauri 2 desktop pet (Live2D)
└── docs/                         # Design docs: INDEX.md; AI nav: ai/project-index.md
```

---

## API Overview

### Unified Entry

```
POST /conversations/:id/messages
{
  content,
  mode?: 'chat' | 'dev',
  metadata?: { workspaceRoot?: string, projectScope?: string } // dev 模式可选
}
```

Routing: `mode='dev'` → `/dev` prefix → LLM intent → default chat

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/conversations` | Create conversation |
| `POST` | `/conversations/:id/messages` | Send message (auto-routes) |
| `GET` | `/memories` | Query memories |
| `PATCH` | `/memories/:id` | Edit a memory |
| `GET` | `/persona` | Get current persona |
| `POST` | `/persona/evolve/suggest` | Generate evolution suggestions |
| `POST` | `/persona/evolve/confirm` | Confirm evolution |
| `GET` | `/dev-agent/sessions` | List dev sessions |
| `GET` | `/dev-agent/runs/:runId` | Get dev run detail (includes workspace metadata) |
| `GET` | `/identity-anchors` | List identity anchors |
| `GET` | `/trace-points`, `/trace-points/by-day`, `/trace-points/day/:dayKey` | Life Record: points and by-day |
| `GET` | `/daily-summaries`, `/daily-summaries/:dayKey` | Life Record: daily summaries |
| `GET` | `/cognitive-trace/observations`, `/cognitive-trace/observations/by-day` | Cognitive Trace: observations |
| `SSE` | `/pet/state-stream` | Desktop pet state stream |

Full API reference in [docs/PROJECT-SUMMARY.md](docs/PROJECT-SUMMARY.md).

### Documentation

- **Topic index** — [docs/INDEX.md](docs/INDEX.md)
- **Project overview & API** — [docs/PROJECT-SUMMARY.md](docs/PROJECT-SUMMARY.md)
- **AI collaborators** (Cursor, Claude Code, Codex) — start at **[docs/ai/project-index.md](docs/ai/project-index.md)** (layered reading order, module map), then **[docs/skills/](docs/skills/)** `*-skill.md` summaries; prefer this over scanning all of `docs/plans/` or `docs/requirements/`.

---

## Design Philosophy

1. **Understand, then act** — XiaoQing first understands your intent, then decides whether to chat, use a tool, or ask for more info. Never acts blindly.

2. **Human-in-the-loop** — Suggests, never auto-writes. No autonomous long-term memory writes, no unconstrained persona drift. You always have the final say.

3. **Decay over deletion** — Like human memory, information fades naturally unless reinforced. The system self-regulates without manual cleanup.

4. **Separate identity from expression** — Who XiaoQing is (persona) and how she speaks (expression policy) are independent. You can make her more casual without changing her values.

5. **Evidence over assumption** — The Claim Engine requires multiple observations. First impressions don't become permanent labels.

6. **Traceable everything** — Every memory links to source messages. Every persona change has an audit log. Every prompt has a version number.

7. **Local-first** — All data in PostgreSQL on your machine. No cloud sync, no telemetry.

---

## Vision

XiaoQing is designed to be **your long-term AI companion** — not just for today's conversation, but for months and years.

**For people who value connection**: XiaoQing remembers your journey. What worried you last month, what excited you this week, how your thinking has evolved. Over time, this builds into a navigable record of your growth.

**For people who value utility**: XiaoQing can act on your behalf — check things, run commands, manage tasks. The more she knows about you, the less you need to explain each time.

**For people who value both**: That's the sweet spot. A companion who knows you well enough to help you effectively, and cares enough to notice when you need support rather than solutions.

The roadmap includes:
- More execution capabilities (reminders, scheduling, more tool integrations)
- Life journey visualization (your mindset across time periods)
- Self-improving DevAgent (learns better execution strategies)
- Adaptive depth (lean into utility or companionship based on your usage patterns)

---

## What This Project is NOT

> - **Not a ChatGPT wrapper** — It's a full state machine for long-term AI relationships with execution capabilities
> - **Not a RAG system** — Memory is structured, decayed, and promoted — not just retrieved
> - **Not a pure agent framework** — One companion, one relationship, tools are her hands
> - **Not a cloud service** — Everything runs locally on your machine

---

## 为什么是小晴？

小晴不是又一个套壳 GPT，也不是一个只会聊天的机器人。

她是一个**能理解你、记住你、替你做事**的长期 AI 伙伴。

想象一下：你跟一个 AI 说"我老是忘记吃饭"。普通 AI 会说"注意身体哦"。小晴会说"要不我每天提醒你？记下来了。"

这就是区别——**理解 + 记忆 + 行动**。

### 她能做什么？

- **聊天与陪伴** — 日常闲聊、情绪回应、一起想问题。她会根据你们的关系深度调整回应方式
- **帮你办事** — 查天气、搜信息、跑命令、执行开发任务。工具是她的"手"，你只需要跟她说
- **记住你的一切** — 记忆分层管理，重要的自然留下，琐碎的逐渐淡忘。每条记忆都能追溯到源头对话
- **性格可控进化** — 双池约束机制，核心人格不跑偏，表达风格可微调。所有变更需要你确认
- **用证据了解你** — 不凭一次对话下结论，多次观察才形成稳定判断
- **记录你的旅程** — 你在不同阶段的心态、想法、成长，都可以被回溯和展现

### 未来方向

- 更多执行能力（提醒、日程、更多工具）
- 心路历程可视化（你不同时段在想什么）
- DevAgent 持续自我优化
- 按你的使用习惯自适应——偏工具还是偏陪伴，都能做好

**数据在本地** — PostgreSQL 本地存储，没有云同步，没有遥测。你的数据只属于你。

---

## 中文快速开始

### 环境准备

- Node.js 18+
- 本地 PostgreSQL 实例
- 一个兼容 OpenAI 接口的 API Key（可选；如果不配置，会走 mock，方便离线开发）

### 1. 克隆与安装依赖

```bash
git clone https://github.com/your-username/xiaoqing.git
cd xiaoqing
npm run install:all
```

### 2. 配置与初始化数据库

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，至少配置：
#   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat?schema=public"
#   OPENAI_API_KEY=sk-xxx  # 可选，不配则使用 mock

cd backend && npx prisma db push && npx prisma generate
```

### 3. 启动服务

```bash
# 终端 1 — 启动后端 (http://localhost:3000)
npm run backend

# 终端 2 — 启动前端 (http://localhost:4200)
npm run frontend
```

打开浏览器访问 `http://localhost:4200`，就可以和小晴开始对话。

---

## 中文架构总览

从高层看，小晴由三部分组成：

- **Angular 前端**：聊天界面、记忆与人格配置面板、DevAgent 控制台、调试信息视图等。
- **NestJS 后端**：统一 Gateway 入口、聊天管道、DevAgent、记忆系统、人格与 Claim 引擎、工具与执行器。
- **PostgreSQL 数据层**：存储会话、记忆、人格、用户 Claim、DevAgent Session/Run、提醒等。

消息的生命周期大致是：

1. 前端发送 `POST /conversations/:id/messages`。
2. 后端 `GatewayController → DispatcherService → MessageRouterService` 判断这是**聊天**还是 **dev 任务**：
   - 显式 `mode='dev'`
   - `/dev`、`/task` 前缀
   - 或 LLM 意图分类
3. 聊天路径会走：
   - 意图识别 → world state 更新；
   - 记忆召回（层级记忆 + token 预算 + LLM 精排）；
   - Prompt 组装与 LLM 回复；
   - Post-turn（总结、印象、进化建议等）。
4. Dev 路径会走 DevAgent：
   - 入口服务 `DevAgentService` 创建/复用 `DevSession`，创建一次 `DevRun`；
   - 通过队列后台异步执行（串行保证同一 session 不并发踩 workspace）；
   - 执行过程写入 `transcript.jsonl`，最终生成面向用户的自然语言报告。

架构图在英文部分已经给出，这里不再重复，只需要记住两点：

- **Chat 与 Dev 完全隔离**：DevAgent 的运行不会写入聊天记忆、总结与成长。
- **一切都可追踪**：从意图识别、记忆召回到工具调用、DevAgent 步骤，都可以通过 trace/ transcript 还原。

---

## DevAgent（开发助手）概览（中文）

DevAgent 是一个专门帮你做「开发相关任务」的子系统，例如：

- 在当前项目里跑命令（测试、lint、构建等）；
- 小步修改代码并给出报告（通过 Claude Code / OpenClaw / Shell 执行器）；
- 记录整个执行过程为 `transcript.jsonl`，便于回放和诊断；
- 通过提醒（reminder）在未来某个时间自动触发 DevRun。

其关键特性：

- **统一入口**：仍然是 `POST /conversations/:id/messages`，只是 `mode='dev'` 或使用 `/dev` 前缀。你始终是「对小晴说话」，由系统决定走 Chat 还是 Dev 通路。
- **异步执行**：Dev 任务提交后立即返回 `runId`，实际执行在后台队列中完成，可查询 / 取消 / 恢复。
- **安全执行**：
  - Shell 命令有白名单、黑名单和高风险语法拦截；
  - 输出有大小与超时限制；
  - 工作目录通过 `WorkspaceManager` 严格绑定，支持 shared/worktree 模式。
- **多执行器协同**：
  - `ShellExecutor`：跑命令、查看文件、简单编辑；
  - `OpenClawExecutor`：委派到 OpenClaw 的任务执行；
  - `ClaudeCodeExecutor`：调用 Claude Code 做更复杂的代码修改。

更细节的设计与目录说明，请参考 `docs/dev-agent-architecture.md`。

---

## 文档导航（中文说明）

本仓库的设计/需求文档分布在 `docs/` 目录下。

**给 AI 协作者（Cursor / Claude Code / Codex）**：请先读 **[docs/ai/project-index.md](docs/ai/project-index.md)**，再按任务阅读 **[docs/skills/](docs/skills/)** 下的 `*-skill.md`（chat-flow、memory-system、agent-bus、workspace-task、persona-expression），避免把 `docs/plans/`、`docs/requirements/` 里的阶段性方案当成已上线事实。人类维护约定见根目录 `CLAUDE.md` 第 9 节。

面向人类浏览时，几个核心文件如下：

| 文档 | 作用 |
|------|------|
| `docs/ai/project-index.md` | **AI 默认入口**：分层阅读顺序、模块地图、skill 与原文档映射 |
| `docs/INDEX.md` | 文档入口索引（按主题分类） |
| `docs/PROJECT-SUMMARY.md` | 项目整体概览与主要 API 列表 |
| `docs/architecture-design.md` | 更完整的总体架构与设计权衡 |
| `docs/dev-agent-architecture.md` | DevAgent 的架构、目录结构、路由与执行流程 |
| `docs/debug-trace-design.md` | Debug 溯源/trace 模式的数据结构与前后端设计 |
| `docs/cognitive-trace-design.md` | 小晴认知溯源（L1 观测与 L2/L3 演进） |
| `docs/life-record-design.md` | 人生轨迹（TracePoint / DailySummary） |
| `docs/context-boundary.md` | Chat / Dev / Tool 之间的上下文与能力边界 |
| `0318_汇总计划.md` | 未完成目标汇总与优先级（根目录） |

如果你要进一步深入某个部分（比如记忆系统、人格进化、DevAgent、人生轨迹、认知溯源），建议先阅读 [docs/INDEX.md](docs/INDEX.md) 与对应设计文档，再看实际代码实现。若是自动化助手改代码，优先遵循上面的 **AI 协作者**路径。

## UI 预览（与当前前端一致）

以下配图由本地启动前后端后截取（默认 `http://localhost:4200`，视口约 1440×900）。若你更新了界面，可在仓库根目录执行：

```bash
npm run frontend   # 终端 1
npm run backend    # 终端 2（需已配置数据库）
cd backend
FLAGS=(--viewport-size="1440, 900" --wait-for-timeout=5000)
npx playwright screenshot "${FLAGS[@]}" http://localhost:4200/chat ../docs/images/ui-chat.png
npx playwright screenshot "${FLAGS[@]}" http://localhost:4200/memory/persona ../docs/images/ui-memory-persona.png
npx playwright screenshot "${FLAGS[@]}" http://localhost:4200/memory/memories ../docs/images/ui-memory-list.png
npx playwright screenshot "${FLAGS[@]}" http://localhost:4200/workspace/dev-agent ../docs/images/ui-dev-agent.png
```

- **聊天主界面**（`/chat`）：左侧会话列表，中间为对话区（含关系回顾等卡片），底部快捷动作与输入框。
- **记忆中心**（`/memory/persona`、`/memory/memories` 等）：人格、记忆列表、人生轨迹、认知溯源等在记忆侧栏中切换，与后端记忆 / 人格配置联动。
- **DevAgent 工作台**（`/workspace/dev-agent`）：会话与 run 列表、执行时间线、步骤详情与底部任务输入（workspace 绑定与轮询刷新）。

![聊天主界面](docs/images/ui-chat.png)

![记忆中心 · 人格](docs/images/ui-memory-persona.png)

![记忆中心 · 记忆列表](docs/images/ui-memory-list.png)

![DevAgent 工作台](docs/images/ui-dev-agent.png)

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

[MIT](LICENSE)

---

<div align="center">

**XiaoQing** — An AI that remembers, evolves, and acts.

</div>
