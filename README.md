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

### 6. Desktop Pet (Live2D)

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

cd backend && npx prisma migrate dev
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
│   │   ├── xiaoqing/             # Core AI companion
│   │   │   ├── conversation/     #   ChatOrchestrator + TurnContext
│   │   │   ├── cognitive-pipeline/ # Situation → state → strategy
│   │   │   ├── memory/           #   Decay, recall, promotion, WriteGuard
│   │   │   ├── summarizer/       #   Auto-summarize → memory extraction
│   │   │   ├── persona/          #   7-field persona + evolution engine
│   │   │   ├── identity-anchor/  #   User-declared facts (never decay)
│   │   │   ├── claim-engine/     #   Evidence-based user profiling
│   │   │   ├── prompt-router/    #   Versioned prompt composition
│   │   │   ├── intent/           #   Intent + slot filling + worldState
│   │   │   └── post-turn/        #   Auto-summarize, impression, growth
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
│       ├── dev-agent/            #   DevAgent session panel
│       └── ...
├── desktop/                      # Tauri 2 desktop pet (Live2D)
└── docs/                         # Design docs (see docs/INDEX.md)
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
| `SSE` | `/pet/state-stream` | Desktop pet state stream |

Full API reference in [docs/PROJECT-SUMMARY.md](docs/PROJECT-SUMMARY.md).

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
