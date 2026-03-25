---
name: plan
description: 输出一份结构化实现计划（Cursor Auto 模型友好粒度），包含目标、验收标准、分步任务、改动范围与风险提示。当用户说"出计划""plan 一下""写实现方案""列步骤"等时启用。
---

# Plan · 结构化实现计划

本 skill 产出一份「AI 可直接执行、人类可快速 review」的实现计划。

目标粒度：**每一步任务都是一个原子改动**（单文件 / 单职责），避免大段模糊描述。

---

## 前置建议

若问题不清晰，或存在多种实现路径难以取舍，优先建议先使用 `think` skill 进行架构分析后再出计划。

否则可以直接输出 plan，无需强制前置 think。

---

## 模式判断（必须先执行）

根据改动规模选择输出模式：

### 轻量模式

适用于：
- 改动范围极小（1~2 个文件 / 单函数 / 单逻辑）
- 目标和路径已完全明确
- 不涉及 Schema 变更、Feature Flag 或跨模块影响

输出格式（固定结构，不使用完整 6 节）：

```
## 快速计划

**目标**：（一句话说明要做什么）

**改动**
- `path/to/file.ts`：（具体改什么，精确到方法/字段/分支）

**验收**：（如何确认改对了，1~2条可观测条件）

**风险**：（如有，否则省略）
```

### 完整模式

适用于：
- 改动涉及 3 个以上文件，或有明确依赖顺序
- 涉及 Schema 变更 / Feature Flag / 新模块
- 用户明确要求「完整计划」「列步骤」「逐任务拆解」

输出要求：使用下方「计划结构（完整模式）」的全部章节。

---

## 计划结构（完整模式）

### 0. 背景与目标

简要说明：

- **要解决的问题**：当前系统在哪里存在缺陷 / 缺失？
- **期望结果**：完成后，系统行为有何变化？用户可感知的效果是什么？
- **不在本次范围内**：明确排除的内容，避免范围蔓延。
- **变更类型**：小范围 / 中等 / 结构调整
- **是否需要结构调整**：是 / 否（说明原因）

---

### 1. 验收标准（Acceptance Criteria）

用具体可验证的条件描述「什么叫完成」：

```
- [ ] 条件 1：（行为描述，如"调用 POST /xxx 返回 400 当 conversationId 缺失"）
- [ ] 条件 2：（可观测指标，如"日志中出现 [NotifyDispatch] planId=xxx conversationId=yyy"）
- [ ] 条件 3：（端到端可感知，如"用户在正确会话中收到提醒消息"）
```

---

### 2. 改动清单（Task Breakdown）

每条任务格式：

```
**Task N — [类型] 简短标题**
- 文件：`path/to/file.ts`
- 改动：（具体描述：新增方法 / 修改逻辑 / 新增字段 / 删除分支）
- 依赖：Task X 完成后才能做（若有）
- 风险：（此改动可能影响的其他逻辑，若有）
- 操作提示：（例如：搜索关键词 / 从哪个函数入口开始 / 需先 grep 确认调用方）
```

类型标注：`[后端]` / `[前端]` / `[Schema]` / `[Config]` / `[文档]`

改动粒度要求：
- 一个 Task 只改一个文件或一个明确职责
- 不写「优化整个模块」，要写「在 xxx 方法中增加 yyy 校验」
- Schema 变更单独列为一个 Task（需要 migrate）

---

### 3. 执行顺序与并行关系

用简洁的依赖图说明顺序：

```
Task 1 (Schema) → Task 2 (后端校验) → Task 3 (前端) → Task 4 (文档)
                                    ↗
                     Task 5 (错误处理，可与 Task 2 并行)
```

---

### 4. 风险提示

列出实施过程中需要注意的点：

- 哪些改动是**不可回滚**的（如 Schema migrate）
- 哪些改动**影响面超出本次范围**（如修改公共 service）
- 是否需要**环境变量 / Feature Flag 配合**（参考 `CLAUDE.md §5`）

---

### 5. 执行策略（给执行者）

> 非常推荐填写，帮助 AI 或人类执行者判断节奏与风险。

- **是否建议逐步执行**：是 / 否（若否，说明可以整批推进的理由）
- **需要人工确认的步骤**：列出 Task 编号（例如：Task 2 需确认 grep 结果后再改；Task 4 涉及 Schema migrate）
- **风险较高的步骤**：列出 Task 编号（例如：Task 1 影响所有 createPlan 调用方，建议先在本地验证）

---

### 6. 验收步骤（手动验证路径）

给出一套端到端验证步骤，让用户/开发者能快速确认改动生效：

```
1. 步骤 1：xxx（预期结果：yyy）
2. 步骤 2：xxx（预期结果：yyy）
3. 步骤 3：xxx（预期结果：yyy）
```

---

## 示例结构（供参考）

```markdown
## 背景与目标
- 问题：notify 任务在 conversationId 缺失时仍被标记为 done，用户无感知
- 期望：强约束 conversationId，执行失败时真实记录
- 不在范围：重构 scheduler 框架、更换队列实现
- 变更类型：小范围
- 是否需要结构调整：否（只在现有服务内增加校验与错误处理，不引入新模块）

## 验收标准
- [ ] POST /plans 在 dispatchType=notify 且无 conversationId 时返回 400
- [ ] notify-dispatch.strategy.ts 在 ReminderMessageService 未注入时抛错而非 return {}
- [ ] 前端 workspace-reminder 创建 plan 时携带 conversationId

## 改动清单
**Task 1 — [后端] PlanService 增加 conversationId 强校验**
- 文件：`backend/src/plan/plan.service.ts`
- 改动：在 createPlan() 中，当 dispatchType=notify 时，若 conversationId 为空则抛 BadRequestException
- 依赖：无
- 风险：影响所有调用 createPlan() 的地方，需确认 chat 通路的 notify 任务都有传 conversationId
- 操作提示：先 grep `createPlan` 找到所有调用方，确认哪些传了 conversationId 后再改

...

## 执行顺序
Task 1 → Task 2 → Task 3 (前端，可与 Task 2 并行) → Task 4 (文档)

## 执行策略
- 是否建议逐步执行：是
- 需要人工确认的步骤：Task 1（grep 确认所有调用方后再改）
- 风险较高的步骤：Task 1（影响面广）、Task 2（改错误处理路径）

## 风险提示
- Task 1 改动影响 createPlan() 所有调用方，需 grep 确认

## 验收步骤
1. 调用 POST /plans with dispatchType=notify 不带 conversationId → 期望 400
2. 在前端 workspace-reminder 创建一个明天的提醒 → 确认 request payload 含 conversationId
3. 等待调度触发或手动触发 → 在正确会话看到提醒消息
```

---

## 原则与禁止事项

- **不写模糊任务**：「优化错误处理」不是一个任务，「在 notify-dispatch.strategy.ts 中将 return {} 改为 throw new InternalServerErrorException」才是。
- **不加多余任务**：不加「顺便重构」「补充单元测试」等不在用户需求内的任务（遵守 `no-new-tests-by-default.mdc`）。
- **Schema 改动必须单独列出**：任何 Prisma schema 变更都要明确标注，并提示需要运行 migrate。
- **env/feature flag 同步**：若新增 feature flag，必须同时列一个 Task 更新 `.env.example`（遵守 `CLAUDE.md §5`）。
- **不生成计划后自动执行**：计划输出后等用户确认，除非用户明确说「直接做」。
