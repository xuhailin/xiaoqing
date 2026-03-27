# 当前系统边界（2026-03）

> 本文档描述**当前已生效的运行时边界**。  
> 若与 `docs/plans/**`、`docs/requirements/**` 中的阶段性方案冲突，**以本文档与当前代码实现为准**。

---

## 1. 结论

当前系统按**单用户**运行。

- 不对外承诺多用户模式
- 不通过 `X-User-Id` 建立真实用户隔离
- 所有 HTTP 请求在后端统一收敛到 `DEFAULT_USER_KEY`（默认 `default-user`）

---

## 2. 请求与数据边界

### 2.1 请求边界

- 后端 `UserIdMiddleware` 统一解析为单一默认用户
- 前端不再提供登录 / 切换用户 / 注入 `X-User-Id` 的产品语义
- `/app/mode` 仅用于返回执行域 feature flag，不再表达 user mode

### 2.2 数据边界

以下表中的 `userId` / `userKey` 字段**允许保留**：

- `Conversation`
- `Memory`
- `Plan`
- `CognitiveProfile`
- `RelationshipState`
- `BoundaryEvent`
- `SocialEntity`
- `SocialInsight`
- `SocialRelationEdge`
- `DailySummary`
- `SharedExperience`
- `UserClaim`
- `ClaimEvidence`
- `SessionState`

这些字段当前视为：

- 单用户运行时下的统一 owner 字段
- 未来如需恢复多用户改造时的预埋结构

**注意**：这些字段的存在，**不代表当前系统支持多用户**。

---

## 3. Chat Domain

### 3.1 当前成立的边界

- chat 主链允许继续保留 owner-aware 代码路径
- Conversation / Memory / Summarizer / Growth / Claim 等链路内部可继续传递 `userId`
- 但在当前运行时里，这些 `userId` 都收敛为单一默认用户

### 3.2 当前不承诺的能力

- 不承诺跨请求 header 级别的真实 owner 隔离
- 不承诺多用户共存时的 prompt / social / reflection 数据绝对隔离

---

## 4. Execution Domain

以下执行域能力当前都按**单用户、环境绑定能力**理解：

- DevAgent
- DesignAgent
- OpenClaw 调用
- 本地技能 / browser 类工具
- checkin
- timesheet

约束：

- 是否开放以后端 feature flag 为准
- 前端隐藏不算关闭，后端 controller / service gate 才算真实收口
- 不做多用户 workspace / session / run 隔离承诺

特别说明：

- `DevAgent` / `DesignAgent` 当前是**单用户执行面**
- `timesheet` 仍是单用户工具域
- `checkin` 属于操作当前环境凭证的单用户动作

---

## 5. 暂不继续推进的方向

以下内容当前**不作为现阶段目标**：

- `APP_USER_MODE=multi`
- 基于 `X-User-Id` 的前端登录态
- 多用户 DevAgent / DesignAgent
- 多用户 scheduler / social planner 的继续扩展

其中旧计划文档：

- `docs/plans/multi-user-chat-phase1.md`
- `docs/plans/multi-user-chat-phase2.md`
- `docs/plans/0326.md`

都应视为**历史设计材料**，不是当前系统事实。

---

## 6. 后续整理原则

若继续开发，优先遵循：

1. 先保持单用户边界清晰
2. 新能力默认先做单用户闭环
3. 只有在全链路数据边界、执行边界、运行时边界都能闭合时，才重新讨论多用户
