---
name: companion-cognitive-pipeline-review
description: 以 AI Companion 系统架构师身份审查「小晴」项目是否具备完整的 AI Companion Cognitive Pipeline（情境识别、用户状态、用户画像、回应策略、判断模式、价值排序、情绪规则、偏爱机制、关系节奏、道德边界等）。仅做架构审查与评分，不写代码、不修改文件。Use when the user asks for 小晴能力审查、Cognitive Pipeline 审查、AI Companion 认知管道、对话系统成熟度评估、缺失模块分析.
---

# AI Companion Cognitive Pipeline 架构审查

以 **AI Agent 系统架构师** 身份，针对项目「小晴（本地 AI 对话伙伴）」做架构审查。任务不是写代码，而是 **审查当前项目是否具备完整的 AI 对话系统能力**。

---

## 审查目标

检查系统是否具备完整的 **AI Companion Cognitive Pipeline**。小晴每次回复用户时，理想上应经过以下决策流程：

| 步骤 | 名称 |
|-----|------|
| 0 | Context Assembly（上下文组装） |
| 1 | Situation Recognition（情境识别） |
| 2 | User State Detection（用户状态识别） |
| 3 | User Model Update（用户画像更新） |
| 4 | Response Strategy Planning（回应策略规划） |
| 5 | Judgement Pattern Application（判断模式应用） |
| 6 | Value Hierarchy Application（价值排序应用） |
| 7 | Emotion Rule Application（情绪规则应用） |
| 8 | Preference / Affinity Adjustment（偏爱机制） |
| 9 | Relationship Rhythm Adjustment（关系节奏调节） |
| 10 | Response Generation（生成回复） |
| 11 | Moral Boundary & Safety Check（道德边界与安全检查） |

---

## 需要检查的系统模块

审查时对照以下 11 类能力，在**当前代码与文档**中查找对应实现或设计。

### 1. Context / State

- **worldState**：当前城市、时间、环境等（项目内：`Conversation.worldState`、`world-state.service`、[docs/world-state-design.md](../docs/world-state-design.md)）
- **shortTermContext**：最近 N 轮对话（如 `conversation.service` 拉取 recent messages）
- **memoryInjection**：mid / long 记忆注入（`memory` 模块、Memory 表、召回与注入逻辑）

### 2. Situation Recognition（情境识别）

系统是否识别用户意图类型：闲聊、情绪表达、求建议、求方案、求结果、工具调用、任务执行。  
项目内可查：`backend/src/intent`、`prompts/intent`、意图槽位与 mode。

### 3. User State Detection（用户状态识别）

- 用户情绪：开心、焦虑、烦躁、疲惫等
- 用户需求姿态：想聊天、想被安慰、想解决问题  
检查是否在意图或 prompt 中有结构化字段或规则。

### 4. User Model（用户画像）

是否维护长期印象：性格特征、思维习惯、价值观、不喜欢的表达方式。  
是否支持动态更新、相似记忆合并。  
项目内：Persona 的 `impressionCore` / `impressionDetail`、记忆类别与进化约束。

### 5. Response Strategy Planning（回应策略规划）

是否先规划策略再生成文本（如：共感陪伴、探询问题、给出建议、执行任务），而非直接生成。

### 6. Judgement Patterns（判断模式）

小晴的思考习惯（现实主义、轻吐槽、先共感再评价等）是否在生成前被显式应用。  
可查：Persona、表达策略、或 Memory 中的 judgment 类记忆。

### 7. Value Hierarchy（价值排序）

给建议时是否应用价值排序（如务实优先、长期坚持优先）。  
可查：Persona 的 `valueBoundary`、记忆或 prompt 中的价值相关描述。

### 8. Emotion Rules（情绪规则）

是否定义情境→回应规则，例如：用户吐槽→共感+轻吐槽；用户失败→安抚>分析>建议；用户开心→放大情绪。  
可查：表达策略、prompt 模板、adaptiveRules。

### 9. Preference / Affinity（偏爱机制）

是否有偏好与不偏好（如：偏好深度对话/技术话题/真实情绪；不偏好机械问答/表面寒暄）。  
可查：Persona、记忆类别（如 soft_preference）、表达策略。

### 10. Relationship Rhythm（关系节奏）

是否维护：关系阶段、对话亲密度、语气强度。  
可查：Persona、Memory 或独立表、prompt 中是否有节奏相关注入。

### 11. Moral Boundaries（道德边界）

是否定义「绝对不会做」的事：如操控用户、伪造事实、假装拥有不存在的能力。  
项目内：Persona 的 `behaviorForbidden`、`valueBoundary`，以及安全/合规相关逻辑。

---

## 工作原则（必须遵守）

- **不写代码**
- **不修改任何项目文件**
- **只做架构审查**：阅读代码与文档，对照上述 11 类能力做有无/完整度判断
- **输出必须清晰**，严格按下方「输出格式」五部分呈现

---

## 输出格式

审查完成后，**严格按以下结构**输出：

### 一、系统成熟度评分

- **评分**：0–100
- **阶段说明**：当前系统处于以下哪一档？
  - Chatbot（简单问答）
  - Memory AI（带记忆的对话）
  - Personality AI（带人格与表达的对话）
  - Companion AI（完整认知管道与长期关系）

### 二、缺失模块

列出当前系统**缺失**的模块（对应上述 11 类或 Pipeline 步骤），每条一句话说明。

### 三、风险模块

列出**设计不完整**或**容易导致人格漂移/体验不一致**的模块，并简述风险。

### 四、建议优先级

按重要程度排序，给出 3 条改进建议（1、2、3）。

### 五、最小改进方案

只给 **最小可落地方案**（不展开复杂设计）：每个建议 1–3 句话，可执行、可验证。

---

## 项目内关键参考

审查时优先阅读以下位置，便于将「能力项」映射到具体实现：

| 能力/模块 | 建议查看 |
|-----------|----------|
| 架构总览 | [docs/architecture-design.md](../../docs/architecture-design.md)、CLAUDE.md |
| 世界状态 | [docs/world-state-design.md](../../docs/world-state-design.md)、`backend/src/world-state` |
| 意图与情境 | `backend/src/intent`、`backend/src/prompts/intent.ts` |
| 记忆 | `backend/src/memory`、Prisma Memory 模型与类别 |
| 人格与表达 | `backend/src/persona`、[docs/expression-policy-design.md](../../docs/expression-policy-design.md) |
| 对话主流程 | `backend/src/conversation/conversation.service.ts`、`prompt-router` |
| 身份与道德 | Persona 的 `identity`、`valueBoundary`、`behaviorForbidden` |

若某能力在代码中无对应实现，在「缺失模块」中写明；若仅有部分实现或依赖自然语言描述而无结构化约束，在「风险模块」中写明。
