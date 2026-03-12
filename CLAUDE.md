# LongMemory AI Companion — CLAUDE.md

## 项目概述

**项目代号**：LongMemory AI Companion
一个具备长期记忆的对话式 AI 伙伴系统，支持人格可控进化（双池约束），面向个人长期使用。

**核心原则**：
- 纯聊天，不参与写代码
- 记忆必须可查、可编、可回溯
- 人格进化受双池约束，必须人工确认后才写入
- 所有自动化必须在规则控制下，不可自主决策

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | NestJS 11 + Prisma 7 + TypeScript |
| 前端 | Angular 21 + TypeScript |
| 数据库 | PostgreSQL（本地） |
| LLM | OpenAI API（未配置时使用 Mock） |

---

## 目录结构

```
chat/                        # 单仓根目录
├── backend/                 # NestJS 后端
│   ├── src/
│   │   ├── gateway/         # 统一消息入口 + 路由（显式/前缀/LLM 意图）
│   │   ├── xiaoqing/        # 小晴聊天代理（按域分组）
│   │   │   ├── conversation/    # 对话 CRUD + orchestrator
│   │   │   ├── cognitive-pipeline/  # 认知管线
│   │   │   ├── memory/         # 记忆管理（mid/long + decay）
│   │   │   ├── summarizer/     # 总结模块
│   │   │   ├── intent/         # 意图识别（含 dev_task）
│   │   │   ├── claim-engine/   # 用户画像 claim
│   │   │   ├── prompt-router/  # Prompt 路由
│   │   │   ├── persona/        # 人格 + 进化
│   │   │   ├── identity-anchor/ # 身份锚定
│   │   │   ├── post-turn/      # 后处理管线
│   │   │   ├── daily-moment/   # 日记
│   │   │   ├── pet/            # 桌宠状态同步
│   │   │   └── reading/        # 读物摄入
│   │   ├── dev-agent/       # 开发代理（plan→execute→report）
│   │   │   └── executors/       # shell + openclaw 执行器
│   │   ├── action/          # 统一执行层
│   │   │   ├── tools/           # 工具（browser/file/general-action）
│   │   │   └── skills/          # 技能（weather/book-download/timesheet）
│   │   ├── infra/           # 基础设施
│   │   │   ├── llm/             # LLM 调用封装
│   │   │   ├── prisma.service.ts
│   │   │   ├── token-estimator.ts
│   │   │   ├── trace/           # trace 收集
│   │   │   └── world-state/     # 世界状态
│   │   └── openclaw/        # OpenClaw 远端代理
│   └── prisma/
│       ├── schema.prisma    # 数据库模型定义
│       └── migrations/
├── frontend/                # Angular 前端
│   └── src/app/
│       ├── chat/            # 聊天主界面
│       ├── dev-agent/       # DevAgent 面板（session/run 管理）
│       ├── memory/          # 记忆查看/编辑页
│       ├── persona/         # 人格双池配置页
│       ├── reading/         # 读物摄入页
│       ├── layout/          # 主布局（main-layout）
│       └── core/            # 公共服务/模型
├── assets/
│   └── character/            # 静态立绘 PNG
├── desktop/                  # Tauri 2 桌面端（Live2D 渲染）
│   ├── index.html            # 主页面（PixiJS canvas + Live2D）
│   ├── js/                   # 应用模块（config/model-manager/state-bridge/app）
│   ├── models/               # Live2D 模型资产（手动下载，不提交 git）
│   ├── public/lib/           # Cubism Core 运行时（手动下载）
│   ├── docs/                 # 维护指南（live2d-maintenance.md）
│   └── src-tauri/            # Tauri 2 Rust 后端
├── docs/
│   ├── requirements/        # 分阶段 PRD（PRD-00 ~ PRD-03）
│   ├── dev-agent-plan.md    # DevAgent 接入计划（Phase 1-3 已完成）
│   └── PROJECT-SUMMARY.md
└── package.json             # 根脚本（启动前后端）
```

---

## 数据库模型（Prisma）

| 模型 | 用途 | 阶段 |
|---|---|---|
| `Conversation` | 对话会话 | Phase1 |
| `Message` | 单条消息（含 role/content） | Phase1 |
| `Memory` | 记忆条目（mid/long，含溯源 messageIds） | Phase1 |
| `Persona` | 人格单例（4 人格字段 + 3 表达调度字段 + 进化约束 + 印象） | Phase2 |
| `Reading` | 读物摄入（中性/人格化解读） | Phase3 |
| `ReadingInsight` | 读物候选条目（待用户采纳） | Phase3 |

---

## Persona 结构化字段

Persona 表已从单体 `currentPersonaText` 拆分为 7 个结构化字段：

**人格层**（稳定注入，几乎不变）：
| 字段 | 用途 |
|---|---|
| `identity` | 身份定位：我是谁、与用户的关系（核心人格，高危变更） |
| `personality` | 性格特质（核心人格，高危变更） |
| `valueBoundary` | 价值边界：判断原则、记忆哲学（核心人格，高危变更） |
| `behaviorForbidden` | 行为禁止项 |

**表达调度层**（常驻但独立，允许更频繁微调）：
| 字段 | 用途 |
|---|---|
| `voiceStyle` | 语言风格基线 |
| `adaptiveRules` | 自适应展开/收缩条件（根据 intentState 动态增强） |
| `silencePermission` | 留白与少说许可 |

Prompt 注入顺序：`[人格 4 字段] → identityAnchor → impression → memory → intentState → worldState → [表达调度 3 字段]`

进化系统支持字段级精准更新：`EvolutionChange { field, content, reason }`。

当前实现采用**风险分流**：
- `identity / personality / valueBoundary` 默认视为核心人格，只有长期稳定证据下才允许进入待确认列表，并以高危变更展示。
- 常见的“更口语、少 GPT 味、少展开、记录后只确认、轻量夸赞”等变化，优先重路由到 `voiceStyle / adaptiveRules / silencePermission`。
- 明显属于“用户更喜欢怎样被回应”的信号，会优先进入独立的 `UserPreference`（默认用户单例），而不会直接改写核心人格。

详见 [docs/expression-policy-design.md](docs/expression-policy-design.md)。

---

## 启动方式

```bash
# 安装全部依赖
npm run install:all

# 启动后端（NestJS，默认 http://localhost:3000）
npm run backend
# 或 cd backend && npm run start:dev

# 启动前端（Angular，默认 http://localhost:4200）
npm run frontend
# 或 cd frontend && npm start
```

**后端环境配置**（`backend/.env`）：
```bash
cp backend/.env.example backend/.env
# 编辑 DATABASE_URL，例如：
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat?schema=public"
# OPENAI_API_KEY=sk-xxx  # 不填则使用 Mock 回复
```

**首次初始化数据库**：
```bash
cd backend && npx prisma migrate dev
```

---

## 主要 API（Phase1）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/conversations` | 创建对话 |
| GET | `/conversations` | 列出对话 |
| GET | `/conversations/:id/messages` | 获取消息列表 |
| POST | `/conversations/:id/messages` | 发送消息（触发 LLM） |
| POST | `/conversations/:id/summarize` | 手动触发总结 |
| GET | `/memories` | 查询记忆 |
| PATCH | `/memories/:id` | 编辑记忆 |

### Pet 状态 API（桌面端同步）

| 方法 | 路径 | 说明 |
|---|---|---|
| SSE | `/pet/state-stream` | SSE 推送状态变化（idle/speaking/thinking） |
| GET | `/pet/state` | 查询当前状态 |
| POST | `/pet/state` | 手动设置状态（调试用） |

---

## 桌面端架构（Live2D）

**渲染引擎**：pixi-live2d-display + PixiJS 6.x + Cubism 4 Core
**窗口**：280×360，透明、无边框、置顶、可拖拽
**状态同步**：SSE 从后端接收状态推送（idle/speaking/thinking），驱动模型表情/动作切换

**核心模块**：
| 文件 | 职责 |
|---|---|
| `js/config.js` | 配置常量（后端地址、默认模型、STATE_MAP 状态映射） |
| `js/model-manager.js` | 模型加载/切换/表情/动作/换装（Parts Visibility） |
| `js/state-bridge.js` | SSE 监听 + 状态→模型动作映射 |
| `js/app.js` | 主入口：初始化 PixiJS + 加载模型 + 连接 SSE + 交互事件 |

**换装机制**：Live2D 模型通过 Parts Visibility 切换服装/发型，每个模型可配 `model-manifest.json` 定义 outfit 组合。

**维护指南**：详见 [desktop/docs/live2d-maintenance.md](desktop/docs/live2d-maintenance.md)

---

## 开发规范

### 通用
- 所有 prompt 必须有版本号字段，便于追踪与回溯
- 记忆写入（尤其长期记忆）必须有 `sourceMessageIds`，保证可回溯
- Token 使用必须可预估：上下文 N 轮 + M 条记忆，请求前截断
- **绝不允许** Agent 或模型自行决定写入长期记忆

### 后端（NestJS）
- 模块分层：controller → service → prisma；不在 controller 写业务逻辑
- Prompt Router 由规则/配置驱动，不是模型自决
- 环境变量通过 `@nestjs/config` 管理
- 测试文件：`*.spec.ts`，使用 Jest

### 前端（Angular）
- standalone 组件，使用 Angular 21 新特性
- API 地址配置在 `src/environments/environment.ts`
- 人格进化建议：前端展示候选，用户确认后才调用写入接口

### 禁止事项（V1 不实现）
- ❌ 多 Agent 自主协商
- ❌ 自动写入长期记忆（无人工确认）
- ❌ embedding / 向量数据库
- ❌ 自动情绪分析
- ❌ 无约束的人格进化
- ❌ 定时全量总结（cron）
- ❌ 多用户 / 登录 / 权限
- ❌ 云部署 / 多端同步

---

## 开发阶段

| 阶段 | 目标 | PRD |
|---|---|---|
| Phase 1 | 基础对话 + 消息持久化 + 手动总结 + 记忆可查可编 | PRD-01 |
| Phase 2 | 记忆注入（规则驱动）+ 人格双池配置与校验 | PRD-02 |
| Phase 3 | 人格进化（进化池约束）+ 读物摄入（可选）+ 成本优化 | PRD-03 |

详细需求见 [docs/requirements/](docs/requirements/)。

## 注意
- ，你可以解析文件后判断是否可以直接添加到当前md里面，下次就不用再读取那个文件了。比如说prd1，读取后解析一下，你可以不断的更新该文件，你甚至可以改掉我这句话。
- 你需要不断优化该文件任意部分，来作为你的记忆辅助，但是不可删除本句提示语。
