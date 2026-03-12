# 小晴 — 项目全景

> 更新：2026-03-12 | 涵盖 Phase 1–3 + Gateway 路由 + DevAgent + Action 能力层 + 认知成长闭环

---

## 一、项目定位

小晴是一个具备**长期记忆与执行决策能力**的 AI 伙伴系统。

她不仅是一个聊天对象，而是一个能够**理解、记住、行动**的长期陪伴助手：
- **聊天与陪伴** — 日常对话、情绪回应、思考引导
- **执行与决策** — 识别用户意图后主动调用工具（查天气、搜信息、执行开发任务等）
- **长期记忆** — 记忆分层管理，自动衰减/晋升/降级，越聊越懂你
- **人格可控进化** — 双池约束，核心人格不跑偏，表达风格可微调

| 项目代号 | LongMemory AI Companion |
|---------|------------------------|
| 后端 | NestJS 11 + Prisma 7 + PostgreSQL |
| 前端 | Angular 21（Standalone Components） |
| 桌面端 | Tauri 2 + PixiJS 6 + Live2D |
| LLM | OpenAI 兼容 API（智谱/OpenAI/Ollama/Mock） |

---

## 二、系统架构概览

### 消息流转全链路

```
用户消息
  ↓
┌─────────────────────────────────────────┐
│ GatewayController                       │
│   ↓                                     │
│ MessageRouterService（三层路由）          │
│   ① mode='dev' → Dev 链路               │
│   ② /dev 或 /task 前缀 → Dev 链路       │
│   ③ LLM 意图分类 → dev_task → Dev 链路  │
│   ④ 其他 → Chat 链路                    │
└─────────┬───────────────┬───────────────┘
          │               │
    ┌─────▼─────┐   ┌─────▼─────┐
    │ Chat 链路  │   │ Dev 链路   │
    │           │   │           │
    │ Intent    │   │ Planner   │
    │ ↓         │   │ ↓         │
    │ WorldState│   │ Executor  │
    │ Merge     │   │ (Shell/   │
    │ ↓         │   │  OpenClaw)│
    │ Capability│   │ ↓         │
    │ Lookup    │   │ Evaluator │
    │ ↓         │   │ ↓         │
    │ Memory    │   │ Reporter  │
    │ Recall    │   │           │
    │ ↓         │   └───────────┘
    │ Cognitive │
    │ Pipeline  │
    │ ↓         │
    │ Prompt    │
    │ Compose   │
    │ ↓         │
    │ LLM Reply │
    │ ↓         │
    │ Post-Turn │
    └───────────┘
```

### Chat 链路详细流程

1. **消息持久化** → 保存用户消息到 Message 表
2. **意图识别** → LLM 输出 `DialogueIntentState`（mode/taskIntent/slots/agency）
3. **世界状态合并** → 用 WorldState 补全缺失槽位（如城市）
4. **能力查找** → CapabilityRegistry 匹配 taskIntent → 执行工具/技能
5. **记忆召回** → 关键词候选 → 衰减评分 → LLM 精排 → Token 预算裁剪
6. **认知管道** → 情境识别 + 用户状态 + 回应策略 + 边界治理
7. **Prompt 组装** → chat_v6 版本，注入人格/锚定/记忆/意图/世界状态/表达策略
8. **LLM 生成** → 调用 LLM，保存回复
9. **后处理** → 自动总结、印象更新、成长信号、Pet 状态广播

### Dev 链路详细流程

1. **Session/Run 创建** → 记录任务上下文
2. **规划** → LLM 生成执行计划（≤2 步/轮）
3. **执行** → Shell 白名单命令 或 OpenClaw 远端
4. **评估** → 规则 + LLM 判断完成度
5. **重规划** → 失败时自动重试（最多 3 轮）
6. **汇报** → 生成最终回复 + transcript.jsonl

---

## 三、目录结构

```
chat/
├── backend/
│   ├── src/
│   │   ├── gateway/                 # 统一消息入口 + 三层路由
│   │   ├── orchestrator/            # Dispatcher + Agent 适配器
│   │   ├── xiaoqing/                # 小晴核心（按域分组）
│   │   │   ├── conversation/        #   ChatOrchestrator + TurnContext
│   │   │   ├── cognitive-pipeline/  #   认知管道 + 成长层 + 边界治理
│   │   │   ├── memory/              #   记忆 CRUD、衰减、召回、WriteGuard
│   │   │   ├── summarizer/          #   总结 → 记忆提取 → 进化联动
│   │   │   ├── persona/             #   7 字段人格 + 印象 + 进化双池
│   │   │   ├── identity-anchor/     #   身份锚定（独立表，不衰减）
│   │   │   ├── claim-engine/        #   证据驱动用户画像
│   │   │   ├── prompt-router/       #   全 prompt 家族组装 + 精排
│   │   │   ├── intent/              #   意图识别 + 槽位 + worldStateUpdate
│   │   │   ├── post-turn/           #   后处理管线（beforeReturn/afterReturn）
│   │   │   ├── daily-moment/        #   今日日记
│   │   │   ├── pet/                 #   桌面端 SSE 状态同步
│   │   │   └── reading/             #   读物摄入 + 人格化解读
│   │   ├── dev-agent/               # DevAgent（隔离执行轨道）
│   │   │   ├── planning/            #   规划：prompt → LLM → parse → normalize
│   │   │   ├── execution/           #   执行：step runner + evaluator + replan
│   │   │   ├── reporting/           #   汇报：final report + transcript
│   │   │   └── executors/           #   Shell / OpenClaw 执行器
│   │   ├── action/                  # 统一执行层
│   │   │   ├── tools/               #   工具（browser/file/general-action）
│   │   │   ├── local-skills/        #   本地技能（repo-summary）
│   │   │   └── capability.*.ts      #   CapabilityRegistry + 接口
│   │   ├── infra/                   # 基础设施
│   │   │   ├── llm/                 #   LLM 封装
│   │   │   ├── trace/               #   Trace 收集
│   │   │   ├── world-state/         #   世界状态管理
│   │   │   ├── prisma.service.ts
│   │   │   └── token-estimator.ts
│   │   └── openclaw/                # OpenClaw 远端代理
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
├── frontend/
│   └── src/app/
│       ├── layout/                  # 主布局（Tab 导航）
│       ├── chat/                    # 聊天主界面
│       ├── conversation/            # 会话列表
│       ├── memory/                  # 记忆查看/编辑
│       ├── persona/                 # 人格双池配置
│       ├── identity-anchor/         # 身份锚定编辑
│       ├── dev-agent/               # DevAgent 面板
│       ├── reading/                 # 读物摄入
│       ├── debug/                   # 调试 Dashboard
│       └── core/services/           # HTTP 服务封装
├── desktop/                         # Tauri 2 桌面端（Live2D）
│   ├── js/                          #   PixiJS + 模型管理 + SSE 桥接
│   └── src-tauri/                   #   Rust 后端
└── docs/                            # 设计文档
    ├── INDEX.md                     #   文档索引（入口）
    └── requirements/                #   PRD-00 ~ PRD-03
```

---

## 四、数据库模型

### 核心对话

| 模型 | 说明 |
|------|------|
| `Conversation` | 对话会话（id, title, worldState JSON, summarizedAt） |
| `Message` | 消息（role, content, tokenCount, conversationId） |

### 记忆与认知

| 模型 | 说明 |
|------|------|
| `Memory` | 记忆条目（type: mid/long, category, content, sourceMessageIds, 衰减字段） |
| `IdentityAnchor` | 身份锚定（label, content, nickname, sortOrder, 不衰减） |
| `IdentityAnchorHistory` | 身份锚定变更审计 |
| `UserClaim` | 证据驱动画像（type/key/valueJson/status: CANDIDATE→WEAK→STABLE→CORE） |
| `ClaimEvidence` | Claim 证据（snippet, polarity, weight） |
| `UserProfile` | 画像投影（印象 core/detail，由 STABLE/CORE Claim 投影） |
| `SessionState` | 会话短期状态（stateJson, TTL） |

### 人格与成长

| 模型 | 说明 |
|------|------|
| `Persona` | 人格（4 人格 + 3 表达调度 + metaFilterPolicy + 进化约束） |
| `PersonaEvolutionLog` | 人格进化审计（field, content, reason） |
| `CognitiveProfile` | 成长层：稳定认知画像（kind, content, status） |
| `RelationshipState` | 成长层：关系状态快照（stage, summary, trustScore） |
| `BoundaryEvent` | 边界治理事件 |

### 读物与日记

| 模型 | 说明 |
|------|------|
| `Reading` | 读物摄入（title, mode, rawText, status） |
| `ReadingInsight` | 读物候选洞察（content, adopted, target） |
| `DailyMoment` | 今日日记（title, body, moodTag） |
| `DailyMomentSuggestion` | 日记轻提示 |
| `DailyMomentSignal` | 用户行为信号 |

### DevAgent

| 模型 | 说明 |
|------|------|
| `DevSession` | 开发任务会话（conversationId, title, status） |
| `DevRun` | 单次执行（plan JSON, status, result JSON, error, artifactPath） |

---

## 五、能力与工具

### 意图驱动的能力系统

小晴通过 `DialogueIntentState` 识别用户意图，自动路由到对应能力：

| taskIntent | 能力 | 说明 |
|------------|------|------|
| `weather_query` | WeatherSkill | 和风天气 API，失败时兜底 OpenClaw |
| `book_download` | BookDownloadSkill | 本地电子书搜索下载 |
| `timesheet` | TimesheetSkill | 工时上报 |
| `dev_task` | DevAgent | 开发任务（Shell/OpenClaw 执行） |
| `none` | 纯聊天 | 走认知管道 + LLM 回复 |

### CapabilityRegistry

统一能力注册中心，支持按 taskIntent + channel 查找、列出可用能力、生成能力描述 prompt。

### 工具层

| 工具 | 说明 |
|------|------|
| Browser | Web 浏览（Playwright） |
| File | 文件读写 |
| GeneralAction | 通用操作执行 |

---

## 六、API 清单

### Gateway 统一入口

```
POST /conversations/:id/messages  { content, mode?: 'chat'|'dev' }
```

路由优先级：`mode='dev'` → `/dev` `/task` 前缀 → LLM 意图分类 → 默认 chat

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/conversations` | 创建会话 |
| GET | `/conversations` | 会话列表 |
| GET | `/conversations/current` | 当前会话 ID |
| GET | `/conversations/:id/messages` | 消息列表 |
| GET | `/conversations/:id/world-state` | 世界状态 |
| PATCH | `/conversations/:id/world-state` | 更新世界状态 |
| GET | `/conversations/:id/token-stats` | Token 统计 |
| GET | `/conversations/:id/daily-moments` | 今日日记 |
| POST | `/conversations/:id/flush-summarize` | 立即触发总结 |
| DELETE | `/conversations/:id` | 删除会话 |

### 记忆

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/memories` | 记忆列表 |
| GET | `/memories/:id` | 单条详情 |
| PATCH | `/memories/:id` | 编辑记忆 |
| DELETE | `/memories/:id` | 删除记忆 |
| POST | `/memories/decay/recalculate` | 触发衰减重算 |
| GET | `/memories/decay/candidates` | 衰减候选 |
| DELETE | `/memories/decay/cleanup` | 清理候选 |

### 人格与画像

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/persona` | 当前人格 |
| PATCH | `/persona` | 更新人格 |
| POST | `/persona/evolve/suggest` | 生成进化建议 |
| POST | `/persona/evolve/confirm` | 确认写入进化 |
| GET | `/persona/evolve/pending` | 待确认进化 |
| GET | `/persona/profile` | 用户画像 |
| PATCH | `/persona/profile/impression` | 更新印象 |

### 身份锚定

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/identity-anchors` | 全部条目 |
| POST | `/identity-anchors` | 新增 |
| PATCH | `/identity-anchors/:id` | 编辑 |
| DELETE | `/identity-anchors/:id` | 软删除 |

### 成长层

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/growth/pending` | 待确认成长记录 |
| PATCH | `/growth/:id/confirm` | 确认 |
| PATCH | `/growth/:id/reject` | 拒绝 |

### DevAgent

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/dev-agent/sessions` | 任务会话列表 |
| GET | `/dev-agent/sessions/:id` | 会话详情 |
| GET | `/dev-agent/runs/:runId` | 执行详情 |

### 读物 & Pet

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/readings` | 提交读物 |
| GET | `/readings` | 读物列表 |
| POST | `/readings/:id/adopt` | 采纳洞察 |
| SSE | `/pet/state-stream` | 状态推送 |

---

## 七、Prompt 版本

| 版本 | 用途 |
|------|------|
| `chat_v6` | 主对话（人格 + 锚定 + 印象 + 记忆 + 意图 + 世界状态 + 认知管道 + 表达策略） |
| `summary_v2` | 总结（含人格联动 `[persona]` 行） |
| `memory_analysis_v1` | 记忆语义相似度检查 |
| `reading_v1` | 读物提炼/人格化解读 |
| `tool_wrap_v1` | 工具结果包装 |
| `rank_v1` | 记忆精排 |

---

## 八、环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | — | PostgreSQL 连接串 |
| `PORT` | 3000 | 后端端口 |
| `CORS_ORIGIN` | `http://localhost:4200` | 前端 CORS 源 |
| `OPENAI_API_KEY` | — | 空则使用 Mock |
| `OPENAI_BASE_URL` | — | 自定义 API 地址 |
| `OPENAI_MODEL` | gpt-4o-mini | 模型名称 |
| `CONVERSATION_LAST_N_ROUNDS` | 8 | 上下文保留轮数 |
| `MEMORY_INJECT_MID_K` | 5 | 注入 mid 记忆条数 |
| `MAX_CONTEXT_TOKENS` | 3000 | Token 截断阈值 |
| `FEATURE_DEBUG_META` | true | 返回 trace/debugMeta |
| `FEATURE_AUTO_SUMMARIZE` | true | 自动总结开关 |
| `AUTO_SUMMARIZE_THRESHOLD` | 15 | 自动总结消息阈值 |
| `DEV_AGENT_DATA_DIR` | backend/data/dev-runs | DevAgent 产物目录 |
| `MAX_PLAN_ROUNDS` | 3 | DevAgent 最大规划轮数 |

---

## 九、实现阶段

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础对话 + 消息持久化 + 手动总结 + 记忆 CRUD | ✅ |
| Phase 2 | 记忆注入 + 人格双池 + Claim Engine + 身份锚定 + 认知管道 | ✅ |
| Phase 3 | 总结联动进化 + 读物摄入 + Token 估算 + 表达策略 | ✅ |
| Gateway + 路由 | 统一入口 + 三层路由（显式/前缀/LLM 意图） | ✅ |
| DevAgent | 开发任务编排（plan→execute→evaluate→report） | ✅ |
| Action 层 | CapabilityRegistry + 工具/技能统一注册 | ✅ |
| Orchestrator 重构 | ChatOrchestrator + TurnContext + PostTurnPipeline | ✅ |
| 成长闭环 | 自动总结 + 衰减定时 + 晋升降级 + 印象更新 + 进化触发 | ✅ |

---

## 十、明确不实现的内容（V1）

- ❌ 多 Agent 自主协商
- ❌ Agent 自动写入长期记忆（无人工确认）
- ❌ Embedding / 向量数据库
- ❌ 自动情绪分析
- ❌ 无约束的人格进化
- ❌ 多用户 / 权限 / 登录
- ❌ 云部署 / 多端同步

---

## 十一、相关文档

完整文档索引见 [INDEX.md](INDEX.md)。
