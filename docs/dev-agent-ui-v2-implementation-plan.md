# DevAgent / DesignAgent UI 参考文档

> 合并自：devagent-ui-audit-2026-03-24.md、devagent-ui-audit-supplement-2026-03-24.md（均已废弃）
> 最后更新：2026-03-24

---

## 1. 前端架构现状

### 1.1 DevAgent 前端结构

```
DevAgentSessionComponent                    // 顶层：绑定 store，接受路由
  └─ DevChatPanelComponent                  // 面板容器：header + 消息列表 + 输入框
       ├─ ChatMessageListComponent          // 消息列表（AfterViewChecked 自动滚动）
       │    ├─ UserMessageComponent
       │    ├─ AssistantMessageComponent
       │    ├─ ToolCallMessageComponent
       │    └─ ToolResultMessageComponent
       └─ ChatInputComponent               // 输入框 + 发送按钮
```

状态由 `DevAgentPageStore`（`frontend/src/app/dev-agent/dev-agent-page.store.ts`）管理：
- `sessions` signal：从 `GET /dev-agent/sessions` 加载
- `lastResult` signal：最近一次 `send()` / 轮询结果
- `currentResult` computed：合并 `lastResult` 与 `session.runs`（当前 run 优先用 lastResult）
- `chatMessages` = `computed(() => buildChatMessages(selectedSession(), currentResult()))`
- `runState` = `computed(() => buildRunState(currentResult()))`
- 轮询：`pollRun(runId)` 每 1500ms 调用 `GET /dev-agent/runs/:runId`

### 1.2 DesignAgent 前端结构

```
DesignAgentPageComponent                   // 单一组件（有侧边栏 + 消息流 + 输入框）
  ├─ sidebar：对话历史列表
  ├─ 消息区：app-chat-message-bubble + renderMarkdown
  └─ 输入区：ChatInputComponent（复用自 DevAgent）+ 图片上传 slot
```

状态：全部 `signal()` 在组件内，服务调用也在组件内。
服务：`DesignAgentService`（`frontend/src/app/core/services/design-agent.service.ts`）。
后端：`DesignConversationService` + `DesignOrchestratorService`（持久化对话 + AI 编排）。

### 1.3 样式体系对比

| 维度 | DevAgent | DesignAgent |
|------|----------|-------------|
| CSS 变量前缀 | `--workbench-*`, `--dev-agent-*` | `--color-*`, `--space-*` |
| 输入框 | `ChatInputComponent`（独立） | 复用 `ChatInputComponent` |
| Markdown | 不渲染（plain text） | `marked` 库 + `[innerHTML]` |
| 布局 | `height: 100%` flex column | `grid-template-columns: 240px 1fr` |

---

## 2. Phase 1：已修复缺陷（2026-03-24 完成）

| 问题 | 修复位置 |
|------|----------|
| IME Enter 误触发送（DevAgent） | `chat-input.component.ts:107`：加 `isComposing \|\| keyCode === 229` 守卫 |
| IME Enter 误触发送（DesignAgent） | 改用 `ChatInputComponent`，`handleKeyDown` 已删除 |
| `waiting_input` 不在 TERMINAL_STATUSES | `dev-agent-page.store.ts:18`：已补入 |
| `run.id = ''` 触发无限轮询 | `dev-agent-page.store.ts:175`：`if (result.run.id)` 守卫后才启动 pollRun |
| `loadSessions` 竞态覆盖 sessions | `dev-agent-page.store.ts:393`：`loadSessionsSeq` 序列号，旧响应直接 return |
| chatMessages / runState 数据源分裂 | `dev-agent-page.store.ts:55`：新增 `currentResult` computed 合并两路数据 |
| `buildChatMessages` 忽略 activeResult | `dev-agent.view-model.ts:192`：activeRun 替换 allRuns 中同 ID run |
| `waiting_input` 无用户文案 | `dev-agent.view-model.ts:477`：加明确提示文字 |
| DesignAgent markdown 渲染用 regex | 改用 `marked` 库，移除 regex 实现 |
| DesignAgent `chatInputTop` slot 不生效 | `design-agent-page.component.ts`：图片预览移入 `app-chat-input` 内作为投影内容 |

---

## 3. Phase 2：待完成——状态反馈改进

| 任务 | 文件 | 说明 |
|------|------|------|
| running 状态的 AssistantMessage 加脉冲动效 | `assistant-message.component.ts` | CSS `animation` |
| ChatMessageListComponent 改进滚动 | `chat-message-list.component.ts:70` | 追踪最后消息 ID，而非只看数量变化 |
| queued/pending 阶段区分文案 | `dev-agent.view-model.ts:462` | 显示"任务已接收，等待执行"而非"正在处理" |
| `waiting_input` 状态友好提示 | `dev-agent.view-model.ts:477` | 已有基础文案，可优化为引导用户填写 workspace |
| DevAgent 失败消息增加内联重试 CTA | `assistant-message.component.ts` | 降低用户找到 header 重试按钮的成本 |
| **DesignAgent 失败时无任何 UI 展示** | `design-agent-page.component.ts:628` | 严重：失败只有 `console.error`，用户无感知 |
| 长任务已用时计数（心跳） | `assistant-message.component.ts` | `interval(1000)` 基于 `run.startedAt` 计算 |

---

## 4. Phase 3：待完成——结构统一（可选）

| 任务 | 说明 |
|------|------|
| 提取 `AppConversationShell` | 侧边栏 + 主内容布局容器，DevAgent/DesignAgent 共用（`hasSidebar` input） |
| 提取 `AppMessageViewport` | 可滚动消息容器壳，封装自动滚动逻辑，供两者复用 |
| 提取 `AppStatusNotice` | 统一 DevAgent 的 `actionNotice` toast 和 DesignAgent 完全没有通知的现状 |
| DesignAgent token 对齐 workbench | 将 `.design-agent-page__*` 的色值改用 `--workbench-*` 和 `--dev-agent-*` |
| `ChatInputComponent` → `AppMessageComposer` | 提升到 shared/ui，供 DesignAgent + DevAgent 共用（已有 ng-content slots） |

---

## 5. Phase B/C：UI V2 信息架构升级（长期）

### Phase B（交互增强）
- Timeline 事件卡片：失败高亮、重规划标记、快速跳到失败 step
- Run 动作：Rerun（基于当前 run 新建）、复制命令/错误摘要
- 线程列表：失败数量 badge、运行中置顶 + 自动焦点

### Phase C（实时化）
- 轮询升级为 SSE/WebSocket（服务端增量推送 step/event）
- run 链路化：`rerunFromRunId` 视图；后端补 `POST /dev-agent/runs/:runId/rerun`
- 最终目标信息架构：
  - 左栏：Session + Runs 分组线程列表（Running / Recent / Failed）
  - 中栏：Run Timeline（plan → step → step_eval → replan → report 事件流）
  - 右栏：Step 详情 + Run 元信息 + 动作（取消/复制/rerun）
  - 底部：Composer + workspace 选择 + 快捷模板

---

## 6. 后端契约待改项

### `waiting_input` 时 `run.id = ''` 不合理

`backend/src/dev-agent/dev-agent.service.ts:74-87`：workspace 不可用时返回空 ID，前端被迫兜底。

建议后端改为：
```typescript
// 目前
run: { id: '', status: 'waiting_input', ... }

// 建议
run: null,
waitingInput: {
  prompt: '请提供可访问的项目路径',
  blockReason: '工作区不可用：...',
}
```

前端兜底（已上线）：`if (result.run.id)` 守卫，空 ID 不启动 pollRun。

### `DevTaskResult.reply` 字段未被前端使用

后端通过 `reply` 字段返回最终文本，前端 store 存入 `lastResult.reply` 但 `buildChatMessages` 和 `buildRunState` 均不使用它，而是自己从 `run.result.finalReply` 重新解析。

建议：`resolveReply()` 优先用 `DevTaskResult.reply`，再 fallback 到 `run.result.finalReply`。

---

## 7. 关键代码位置速查

| 位置 | 文件:行号 |
|------|-----------|
| IME Enter 修复（ChatInput） | `frontend/src/app/dev-agent/components/chat-input.component.ts:107` |
| IME Enter 参考实现 | `frontend/src/app/chat/chat.component.ts:324` |
| TERMINAL_STATUSES | `frontend/src/app/dev-agent/dev-agent-page.store.ts:18` |
| pollRun 实现 | `frontend/src/app/dev-agent/dev-agent-page.store.ts:508` |
| loadSessions 序列号保护 | `frontend/src/app/dev-agent/dev-agent-page.store.ts:393` |
| currentResult computed（合并数据源） | `frontend/src/app/dev-agent/dev-agent-page.store.ts:55` |
| buildChatMessages（activeResult 合并） | `frontend/src/app/dev-agent/dev-agent.view-model.ts:179` |
| buildFinalAssistantText | `frontend/src/app/dev-agent/dev-agent.view-model.ts:473` |
| ChatMessageList 自动滚动（待改进） | `frontend/src/app/dev-agent/components/chat-message-list.component.ts:70` |
| DesignAgent sendMessage 失败无提示 | `frontend/src/app/design-agent/design-agent-page.component.ts:628` |
| 后端 waiting_input + id='' | `backend/src/dev-agent/dev-agent.service.ts:74` |
| DesignAgent 对话服务 | `backend/src/design-agent/design-conversation.service.ts` |
| DesignAgent 编排服务 | `backend/src/design-agent/design-orchestrator.service.ts` |

---

## 8. 回归矩阵（修改 store/view-model 后必验）

| 场景 | 预期 |
|------|------|
| 正常任务，快速网络 | 发送 → 用户消息 → 进度 → success + finalReply |
| 正常任务，loadSessions 3000ms 延迟 | 同上，消息区不出现状态回退 |
| workspace 路径不存在 | 停止轮询，显示"等待补充"文字，不无限请求 `/runs/` |
| 中文输入法选词 | Enter 选词不发送，Shift+Enter 换行，Enter（非 IME）发送 |
| 页面刷新后有 running run | 自动恢复轮询（init → loadSessions → applySelectedSession → pollRun） |
| 取消 running run | 立即停止轮询，显示 cancelled 状态 |
| rerun / resume | 新 run 出现消息流末尾，历史消息保留 |
