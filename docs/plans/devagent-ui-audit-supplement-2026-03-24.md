# DevAgent UI 审查补充报告（已废弃）

> **已合并到 `docs/dev-agent-ui-v2-implementation-plan.md`，请阅读该文件。**
> 基于初稿补充：证据闭环 / 前后端契约边界 / 组件抽象 / 交互过程感 / Phase 0 验证
> 日期：2026-03-24

---

## 1. "成功但 UI 一直 pending" 的证据闭环

### 1.1 精确调用链（有代码行号支撑）

以下是 `send()` 被调用后的完整事件序列，附上每步对应的代码位置。

```
T=0ms      用户点击发送
T=100ms    POST /conversations/dev-default/messages 响应
           → store.ts:160  lastResult.set({ run.id:'R1', status:'queued' })
           → store.ts:171  selectedSessionId.set('S1')
           → store.ts:172  selectedRunId.set('R1')
           → store.ts:174  pollRun('R1', 'S1')       ← [P1] 第一次 pollRun
           → store.ts:176  loadSessions('S1')         ← [L-A] 第一次 loadSessions 开始飞

T=100ms    [P1] pollOnce() 立刻执行（无 timer 延迟，store.ts:521）
           GET /dev-agent/runs/R1 → 'queued'
           → updateSessionRun(queued) [sessions 里还没有 S1 的 run，append 到前面]
           → schedulePoll +1500ms → T=1600ms

T=1600ms   [L-A] 如果慢（>1500ms），还没回来

T=1600ms   [P1-tick2] GET /dev-agent/runs/R1 → 'running'
           → updateSessionRun({status:'running'})  ← sessions.runs 里 R1 = running ✓
           → schedulePoll +1500ms → T=3100ms

T=2800ms   [L-A] loadSessions 回来（慢了 2700ms），携带 T=100ms 时的快照数据：
           → store.ts:390  sessions.set([{ runs:[{id:'R1', status:'queued'}] }])
                          ← !!!【覆盖】掉了 T=1600ms 那次 updateSessionRun 打的 running 补丁
           → store.ts:408  applySelectedSession(session, 'R1')
             → store.ts:433  lastResult().run.id === 'R1' → 不覆盖 lastResult ✓
             → store.ts:436  !isTerminalStatus('queued') → 调用 pollRun('R1','S1') ← [P2] 重启！

T=2800ms   [P2] 取消 T=3100ms 那个 timer，立即执行新 pollOnce()
           GET /dev-agent/runs/R1 → 可能还是 'running'
           → updateSessionRun(running) ← 重新补丁 running ✓
           → schedulePoll +1500ms → T=4300ms

T=4300ms   [P2-tick2] GET /dev-agent/runs/R1 → 'success' ← ★ 真正的完成
           → store.ts:508  lastResult.set({status:'success'})   ← runState 的数据源 ✓
           → store.ts:510  updateSessionRun({status:'success'})  ← sessions 补丁 ✓
           → store.ts:511  isTerminalStatus('success') = true
           → store.ts:512  clearRunPolling()
           → store.ts:513  loadSessions('S1')  ← [L-B]

T=4300ms ~ T=4500ms
           ★ 正常窗口：
             sessions.runs 有 success（来自 updateSessionRun）
             chatMessages 构建 → 用 session.runs 中 success 的 run → 显示 finalText ✓
             runState 用 lastResult → success ✓
             → UI 正常

T=4500ms   [L-B] 回来，success 数据，没有回退风险 ✓
```

**这是理想路径**。"成功但一直 pending" 出现在下面这个更差的时序：

---

### 1.2 触发 "pending 不消失" 的精确竞态路径

**前提**：`GET /sessions` 响应时间 > 运行总时长（或恰好在 success 补丁后到来且携带更旧的快照）。

```
T=100ms   [L-A] loadSessions 开始
T=3100ms  [P1-tick3] 最后一次 poll → success
          → lastResult = success ✓
          → updateSessionRun(success) ✓
          → clearRunPolling()
          → [L-B] loadSessions 开始

T=3300ms  [L-B] 回来，success 数据，sessions 继续是 success ✓

T=4800ms  [L-A] 终于回来！带着 T=100ms 时的快照 → run.status = 'queued'
          → sessions.set([{run:'queued'}])   ← 【覆盖！】把 success 改回了 queued
          → applySelectedSession() 被调用
            → lastResult.run.id === R1 → lastResult 不被覆盖（success 保留）
            → !isTerminalStatus('queued') → pollRun 重启！[P3]

T=4800ms  [P3] pollOnce() 立即执行
          GET /dev-agent/runs/R1 → 后端返回 success（DB 状态正确）
          → updateSessionRun(success) ← 再次补丁

T=4800ms ~ T=4900ms（[P3] 的 HTTP 在飞中）：
          ★★ 关键窗口：
            sessions.runs = {status:'queued'}（L-A 覆盖）
            lastResult.status = 'success'（从未被覆盖）

            runState = buildRunState(currentResult())
              → currentResult() → lastResult().run.id === currentRun.id → 返回 lastResult
              → status = 'success' → header badge 显示 "Success" ✓

            chatMessages = buildChatMessages(selectedSession(), currentResult())
              → selectedSession().runs 有 R1.status = 'queued'（已被 L-A 覆盖）
              → buildRunMessages(queued run):
                  buildRunningAssistantText: status='running' → 返回 "正在处理..." 文本
                  buildFinalAssistantText:   status='running' → 返回 null
              → 消息列表：用户消息 + progress assistant 消息（running 语气）+ 无 summary
              ★ 消息区还在 running，header 却说 Success ← 这就是"成功但 pending"的症状
```

**[P3] 返回后（约 100ms）**，`updateSessionRun(success)` 再次补丁，消息区才恢复正常。

**结论**：这个 bug 不是理论推断，是代码路径决定的必然竞态。只要 `GET /sessions` 的响应时间比 run 执行时间长（常见于后端冷启动、session 数量多、网络抖动），用户就会看到 header="Success" + 消息区="正在处理"的分裂状态，持续约 100~500ms（[P3] 的 HTTP RTT）。

---

### 1.3 是否还有第二个根因

**有。** 与 loadSessions 竞态无关的、独立存在的结构性问题：

**第二根因：`chatMessages` 对 `currentResult` 完全视而不见**

在 `dev-agent.view-model.ts:183-191`：
```typescript
const runs = session?.runs?.length
  ? [...session.runs].sort(...)  // session 存在时 activeResult 参数被完全丢弃
  : activeResult ? [taskResultToRun(activeResult)] : [];
```

一旦 session 有 runs（哪怕只有 1 条），`activeResult`（即 `currentResult`，是实时轮询数据）就永远不会用到消息构建。所有消息都来自 `session.runs`。

这意味着：
- 即便不触发任何竞态，`currentResult` 和 `chatMessages` 在结构上就是两条独立通道
- `runState`（header）正确，是因为用了 `currentResult`
- `chatMessages`（消息体）的正确性完全依赖 `updateSessionRun` 的及时性

只要有任何原因导致 `session.runs` 比 `lastResult` 慢一拍，就会分裂。loadSessions 竞态只是最常见的触发器，不是唯一一个。

---

### 1.4 日志建议（用于线上/本地复现验证）

在以下位置加 `console.debug` 可在 DevTools 里验证时序：

| 位置 | 日志内容 |
|------|---------|
| `store.ts:390` `sessions.set(sessions)` | `[loadSessions] set sessions, run R1 status=<status>` |
| `store.ts:508` `lastResult.set(...)` | `[pollRun] lastResult → status=<status>, runId=<id>` |
| `store.ts:510` `updateSessionRun(run)` | `[pollRun] updateSessionRun → status=<status>` |
| `store.ts:437` `pollRun(...)` in applySelectedSession | `[applySession] restart poll from loadSessions, run status=<status>` |
| `buildChatMessages` 入口 | `[chatMessages] session.runs[0].status=<status>, activeResult.run.status=<status>` |

用这 5 条日志可以在 Network throttling（Slow 3G 或自定义 4000ms delay）下精确复现上述竞态窗口。

---

## 2. 前端缺陷 vs. 后端契约问题分类

### 2.1 完全是前端应该修的

| 问题 | 理由 |
|------|------|
| IME Enter 不检查 `isComposing` | 后端无关，纯前端事件处理遗漏 |
| `chatMessages` 不用 `currentResult` 覆盖活跃 run | 前端自己的数据投影逻辑设计问题 |
| `loadSessions` 无序列号保护，旧响应覆盖新状态 | 前端并发请求管理缺失，与后端无关 |
| `TERMINAL_STATUSES` 不含 `waiting_input` | 前端对后端状态枚举不完整的应对 |
| `ChatMessageListComponent` 只在消息数变化时滚动 | 纯前端 UX 问题 |
| `applySelectedSession` 用旧 session 数据重启 poll | 前端状态机设计问题 |

---

### 2.2 后端契约不合理、前端被迫兜底的

**问题 A：`waiting_input` 时 `run.id = ''` 是不合理的契约**

**现状**（`dev-agent.service.ts:74-87` 和 `:319-332`）：
```typescript
run: {
  id: '',              // ← 空字符串，不是合法的 run ID
  status: 'waiting_input',
  ...
}
```

**影响**：
- 前端 `pollRun('')` → `GET /dev-agent/runs/` → 路由 404 → 无限重试
- `selectedRunId.set('')` 会导致后续所有依赖 `selectedRunId` 的 computed 行为异常
- `currentRun()` 在 session 里找不到 `id=''` 的 run，退回 `sortedRuns[0]`（上一次 run）—— 切换到了错误的 run 视图

**根因判断**：这是**后端契约问题**。`waiting_input` 是一个特殊状态（不是真正的 run），后端用 `run.id=''` 来表示"还没有创建真实 run"，但前端没有能力区分"空 ID = 没有 run"和"有效 run"。

**契约应当改为**：后端在 `waiting_input` 时不应返回 `run` 字段（或明确用 null），而是用单独字段表示需要用户补充信息：
```typescript
// 建议的契约形状
{
  session: { id: 'S1', ... },
  run: null,  // 或者不返回 run 字段
  waitingInput: {
    prompt: '我需要一个可访问的项目目录，回复我新的 workspace 路径后我就继续处理。',
    blockReason: '工作区不可用：...',
  },
  reply: '...',
}
```

**前端在契约未改之前的兜底方案**：
- `send()` 收到响应后，检查 `result.run?.id` 是否为空，若为空则跳过 `pollRun`，直接按特殊状态处理
- `normalizeRunStatus('waiting_input')` 映射到 `'failed'`（已在 view-model 逻辑里是这样），但 UI 应该区分为"等待补充"而非"失败"

---

**问题 B：`waiting_input` 应该被视为终态还是"等待补充信息"状态？**

**分析**：
- 在 DB 层面，`DevRunStatus` 枚举里**没有** `waiting_input`（`schema.prisma:805-812`）。它只是一个 DTO 中的虚拟状态字符串，从不持久化。
- 在业务上，它意味着"任务没有开始，需要用户提供更多信息"。这不是失败，也不是成功。
- 如果视为终态（前端停止轮询），UI 应显示"待补充"状态 + 提示用户下一步操作（在聊天框输入 workspace 路径）。
- 如果不视为终态（继续轮询），则需要用真实 run ID 才能有意义地轮询。

**结论**：
1. 前端应将其视为**需要用户响应的特殊终态**，而非运行中或失败
2. 后端应提供真实 run ID（哪怕是占位 run）或明确 null
3. 消息区应显示 assistant 的提问文字（`reply` 字段里有），而非"任务执行失败"
4. 输入框应保持可用（不应因 `sending = true` 被 lock）—— 但当前 `sending.set(false)` 在 `send()` 回调里已经执行，所以输入框还是开放的 ✓

---

**问题 C：`DevTaskResult` 的 `reply` 字段在前端完全没有被显示**

**现状**：后端返回的 `DevTaskResult.reply` 字段（`dev-agent.service.ts:128,261`）是给聊天主链（Gateway）用的，前端 store 把它存在 `lastResult.reply` 里，但 `buildChatMessages` 和 `buildRunState` 都没有用到它。

相比之下，`dev-agent.view-model.ts:639-651` 的 `resolveReply` 自己从 `run.result` 里提取 `finalReply`。两条路径可能给出不同的结果。

**这是前后端职责分工不清**：后端以为自己通过 `reply` 字段传递了最终文本，但前端完全忽略，自己从 `result.finalReply` 里重新解析。万一两者不一致，用户看到的消息可能与后端设计意图不同。

**建议**：前端 `resolveReply` 应优先使用 `DevTaskResult.reply`（当非空时）作为 finalText，再 fallback 到 `run.result.finalReply`。

---

## 3. 共享组件边界（具体化）

### 3.1 组件抽象分层图

```
frontend/src/app/shared/ui/
├─ [已有] app-panel.component.ts          → 通用面板容器
├─ [已有] app-badge.component.ts
├─ [已有] app-button.component.ts
├─ [已有] app-state.component.ts          → 空状态
├─ [建议新增]
│   ├─ app-conversation-shell.component.ts   → ConversationShell
│   ├─ app-message-viewport.component.ts     → MessageViewport
│   ├─ app-message-composer.component.ts     → MessageComposer
│   └─ app-status-notice.component.ts        → StatusNotice（行内通知条）
│
frontend/src/app/dev-agent/components/
├─ [已有] chat-message-list.component.ts     → DevAgent 专属（有 tool-call/result 类型）
├─ [已有] chat-input.component.ts            → 可升级为 MessageComposer 的具体实现
├─ user-message.component.ts                 → 可提取到 shared（纯气泡，无业务逻辑）
├─ assistant-message.component.ts            → 可提取到 shared（纯气泡）
├─ tool-call-message.component.ts            → DevAgent 专属
└─ tool-result-message.component.ts          → DevAgent 专属
```

---

### 3.2 各组件职责与边界

#### `AppConversationShell`（放 shared/ui）

**职责**：提供"侧边栏 + 主内容"或"纯主内容"的布局容器，类似于一个有结构约束的 Panel。

**API 设计**：
```typescript
@Component({ selector: 'app-conversation-shell', template: `
  <div class="conversation-shell" [class.has-sidebar]="hasSidebar">
    @if (hasSidebar) {
      <aside class="conversation-shell__sidebar">
        <ng-content select="[slot=sidebar]" />
      </aside>
    }
    <main class="conversation-shell__main">
      <ng-content select="[slot=header]" />    <!-- 放 header/toolbar -->
      <ng-content select="[slot=viewport]" />  <!-- 放消息列表 -->
      <ng-content select="[slot=composer]" />  <!-- 放输入框 -->
    </main>
  </div>
` })
export class AppConversationShellComponent {
  @Input() hasSidebar = false;
}
```

**使用场景**：
- DevAgent：`hasSidebar=false`，只用 main 区域
- DesignAgent：`hasSidebar=true`，sidebar 放对话列表

**当前状态**：两者都手写了这个布局，代码重复。DevAgent 用 `AppPanelComponent + 手动 flex column`，DesignAgent 用 `grid-template-columns: 240px 1fr`。

---

#### `AppMessageViewport`（放 shared/ui）

**职责**：可滚动的消息容器，封装自动滚动逻辑。

**修复点**：当前 `ChatMessageListComponent` 只在消息数量变化时自动滚动。`AppMessageViewport` 应该通过 `lastMessageId` 输入来判断是否需要滚动，或接受一个 `autoScroll: boolean` 输入让父层控制。

```typescript
@Component({ selector: 'app-message-viewport' })
export class AppMessageViewportComponent {
  @Input() autoScrollAnchor = '';  // 变化时触发滚动（通常传最后一条 message.id）
  @ContentChildren(...) // 或者用 ng-content，子内容由调用方决定
}
```

**与现有 `ChatMessageListComponent` 的关系**：
- `ChatMessageListComponent` 是 DevAgent 专属的消息分发层（知道 user/assistant/tool-call/tool-result）
- `AppMessageViewport` 只是滚动容器壳
- DevAgent：`ChatMessageListComponent` 内部用 `AppMessageViewport`
- DesignAgent：直接用 `AppMessageViewport`，内部放自己的消息模板

---

#### `AppMessageComposer`（升级现有 `ChatInputComponent`）

**职责**：输入框 + 发送按钮 + 可选的附加内容区（图片预览、工具按钮等）。

**建议**：将 `ChatInputComponent` 升级为 `AppMessageComposer`，通过 `ng-content` 暴露 `[slot=prepend]`（用于 DesignAgent 的图片预览）。

```typescript
@Component({ selector: 'app-message-composer', template: `
  <section class="message-composer">
    <ng-content select="[slot=prepend]" />  <!-- DesignAgent 图片预览放这里 -->
    <div class="message-composer__row">
      <ng-content select="[slot=toolbar]" />  <!-- 上传按钮等 -->
      <textarea ... (keydown.enter)="handleEnter($event)" />
      <app-button (click)="submit.emit()">...</app-button>
    </div>
    <ng-content select="[slot=hint]" />
  </section>
` })
```

**当前 `ChatInputComponent` 缺少的**：
- `isComposing` 检查（P0 bug）
- 图片上传区域 slot
- 暗示文字 slot（现在是 `@Input() hint`，够用）

---

#### `AppStatusNotice`（放 shared/ui）

**职责**：行内通知条，用于替代当前 DevAgent 的 `actionNotice` toast（`notify()` 机制）和 DesignAgent 完全没有通知的现状。

**使用场景**：
- "已创建新 run 重跑任务。"
- "workspace 不可用，请输入新路径"
- "正在取消..."

**当前状态**：DevAgent 的 `actionNotice` 信号只在 `dev-agent.component.ts`（顶层）被 subscribe，具体 UI 渲染方式需要确认（此文件未读到，但信号已在 store 里定义）。DesignAgent 用 `console.error` 替代。

---

### 3.3 不提取到 shared 的（DevAgent/DesignAgent 专属）

| 组件 | 专属于 | 理由 |
|------|--------|------|
| `UserMessageComponent` | 可提取（但优先级低） | 纯气泡，无业务逻辑；但两者消息气泡语义不同（DevAgent 的 user 是"开发任务指令"，DesignAgent 的 user 包含图片） |
| `AssistantMessageComponent` | 可提取（但优先级低） | 同上 |
| `ToolCallMessageComponent` | DevAgent 专属 | DesignAgent 无 tool-call 概念 |
| `ToolResultMessageComponent` | DevAgent 专属 | 同上 |
| DesignAgent 建议修改面板 | DesignAgent 专属 | DevAgent 无此交互 |
| DesignAgent 图片上传 | DesignAgent 专属 | DevAgent 无此能力 |
| DevAgent session board | DevAgent 专属 | DesignAgent 无 session/run 层级 |

---

### 3.4 改造优先级

```
P0（修 bug 顺带）：
  ✦ ChatInputComponent → 加 isComposing 检查，顺带重命名为 AppMessageComposer

P1（独立可并行）：
  ✦ AppMessageViewport：提取滚动容器，修复滚动只在数量变化时触发的问题
  ✦ AppStatusNotice：统一 DevAgent 的 actionNotice 和 DesignAgent 的通知展示

P2（结构性重构，择机）：
  ✦ AppConversationShell：提取布局容器
  ✦ DesignAgent 的 textarea 迁移到 AppMessageComposer
  ✦ DesignAgent token 对齐到 workbench 体系
```

---

## 4. "过程感"交互审查

### 4.1 发送后：用户能否立刻感知任务已被接收？

**DevAgent：偏弱**

- 用户点击发送 → `sending.set(true)` → 按钮变 "Running..."，输入框 disabled
- `send()` 响应回来之前（HTTP RTT，通常 100-500ms），UI 只有按钮禁用，没有任何 loading 提示
- 响应回来后，消息区才出现用户消息气泡（因为消息是从 `lastResult` 构建的，HTTP 响应前 `lastResult` 为空）
- **问题**：用户点击发送后有一个明显的"空白期"，不知道是否真的发出了

**DesignAgent：略好一点**
- `loading.set(true)` → textarea disabled
- 但用户消息（图片 + 文字）也是等 HTTP 响应后才显示（sendMessage 成功后 `currentConversation.set(updated)`）
- 同样有"空白期"

**修复建议**：
发送后立即**乐观投影**用户消息到消息列表（不等 HTTP 响应），用一个 `pending` 状态标记。这是现代 IM 的标准做法：
```
用户点击发送 → 立即在消息区追加 { id:'temp', kind:'user', text, status:'pending' }
HTTP 返回后 → 用真实 id 替换临时消息，开始轮询
```

---

### 4.2 执行中：是否有阶段反馈？

**DevAgent：有基础，但不连贯**

```
阶段                  当前反馈                     缺失
────────────────────────────────────────────────────────
queued（排队中）      静态文字"正在处理你的开发任务"   无排队指示（如"等待前置任务"）
pending（启动中）     同上                           无
running（执行中）     lastEvent 文字（如有）          无阶段进度条
                     tool-call/result cards          ✓ 有，但需展开才能看内容
running but no event  "正在处理你的开发任务"          用户完全不知道在做什么
```

`buildRunningAssistantText`（`view-model.ts:454-463`）逻辑：
```typescript
return normalizedText(parsed.lastEvent)   // 优先用 lastEvent
  ?? (run.plan?.summary?.trim()
    ? `已生成计划：${run.plan.summary.trim()}`
    : '正在处理你的开发任务');  // fallback：完全无信息
```

`lastEvent` 只在后端执行时写入 `run.result.lastEvent`，轮询间隔 1500ms，而且不是每个状态节点都写。如果任务执行超过 10 秒没有新 event，用户就只看到静态文字。

**DesignAgent**：只有一个 `loading` 骨架，完全没有阶段信息。

**修复建议**：
1. queued/pending 阶段：显示"任务已接收，等待执行"（与"正在处理"区分）
2. running 阶段：显示最近 event + 已用时 / 计划步骤序号（`run.plan.steps[currentStepIndex]`）
3. 无 event 超过 5 秒：显示"仍在处理中..."（心跳）而非永远静态文字

---

### 4.3 长任务心跳

**当前：无心跳机制**

如果 `lastEvent` 长时间不更新（后端的 agent 在执行长命令），前端的 running 文字永远不变。用户无法区分"任务卡住了"和"任务在正常执行中"。

**数据已有，只是没用**：
- `run.startedAt` 可以计算已用时
- `runState.updatedAtLabel` 在 header 里显示了时间戳，但不是实时的（是 `result.updatedAt`，即后端更新 result 的时间）

**修复建议**：
- 在 `AssistantMessageComponent`（progress tone）里加一个用 `interval(1000)` 驱动的已用时计数（`running since X seconds`）
- 不需要后端支持，纯前端基于 `message.timestamp`（run.startedAt）计算

---

### 4.4 成功后：是否有结果摘要？

**DevAgent：有，但依赖后端数据**

成功后显示的 final summary message 来自：
```typescript
buildFinalAssistantText:
  finalReply → stopReason → run.error → fallback("任务执行成功。")
```

如果后端没有写 `finalReply`（某些执行器可能遗漏），用户只看到"任务执行成功。"这条降级文字，完全没有执行摘要。

**缺失**：
- 没有"完成了多少步"、"用了多少 token/成本"等统计摘要（这些在 `runState.toolCallCount` 和 `runState.costUsd` 里有，但只显示在 header 里，不在消息气泡里）
- tool-call/result 默认折叠，用户需要手动展开才能看到执行详情

**DesignAgent**：成功后显示 AI 回复的 markdown 文本，通常含有详细说明，体验较好。

---

### 4.5 失败后：是否有可操作的错误提示？

**DevAgent**：
- 失败时显示 assistant message（summary tone），文字来自 `run.error` 或 "任务执行失败。"
- header 有"重试"按钮（`canRerun`）
- **问题**：失败原因（`run.error`）可能是技术报错（如 "工作区不可用：ENOENT..."），对用户不友好
- **问题**：没有内联的 CTA—— 用户需要找到 header 上的"重试"按钮，不如在消息气泡里也放一个

**DesignAgent**：
- 失败时 `loading.set(false)` + `console.error`，UI 上没有任何错误展示
- **严重缺陷**：用户不知道失败了，以为还在加载

**修复建议（DesignAgent）**：
```typescript
error: (err) => {
  this.loading.set(false);
  // 恢复输入（已有）
  this.inputText.set(pendingText);
  // 新增：在消息列表底部追加错误提示
  this.addErrorMessage('发送失败，请重试：' + err.message);
}
```

---

### 4.6 "过程感"缺陷汇总

| 阶段 | DevAgent 缺陷 | DesignAgent 缺陷 |
|------|--------------|----------------|
| 发送后空白期 | 用户消息不立即出现（~200ms 空白）| 同左 |
| queued 排队感知 | "正在处理"文字无区分排队与运行 | 无 |
| 执行阶段进度 | 有 lastEvent，但 1500ms 延迟 + 可能长时间静止 | 仅有一个 loader 图标 |
| 长任务心跳 | 无已用时计数，无"仍在处理"刷新感 | 无 |
| 成功摘要 | 有，但降级文字无信息量 | 有（AI 回复） |
| 失败展示 | 有错误文字，但不友好；无内联重试 | **无任何错误展示**（P1） |
| 取消后状态 | 有"任务已取消"，OK | 无取消能力 |

---

## 5. Phase 0：验证计划（改代码前先跑通这几步）

### 5.1 需要加的调试日志

在 `dev-agent-page.store.ts` 临时加以下日志（开发环境仅）：

```typescript
// 1. loadSessions 每次调用时打印调用来源 + 序列号
private loadSessionsSeq = 0;

private loadSessions(preferredSessionId?: string, ...) {
  const seq = ++this.loadSessionsSeq;
  const caller = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown';
  console.debug(`[loadSessions#${seq}] started from: ${caller}`);

  this.devAgent.listSessions().subscribe({
    next: (sessions) => {
      const activeRun = sessions
        .find(s => s.id === this.selectedSessionId())
        ?.runs?.find(r => r.id === this.selectedRunId());
      console.debug(
        `[loadSessions#${seq}] arrived, activeRun.status=${activeRun?.status}, `
        + `lastResult.status=${this.lastResult()?.run.status}`
      );
      this.sessions.set(sessions);
      ...
    },
  });
}

// 2. updateSessionRun 打 run 的关键状态
private updateSessionRun(run: DevRun) {
  console.debug(`[updateSessionRun] run=${run.id}, status=${run.status}`);
  ...
}

// 3. applySelectedSession 时打是否重启 poll
private applySelectedSession(session: DevSession, preferredRunId?: string) {
  ...
  if (!this.isTerminalStatus(currentRun.status)) {
    console.debug(`[applySession] restart poll, run=${currentRun.id}, status=${currentRun.status}`);
    this.pollRun(currentRun.id, session.id);
  } else {
    console.debug(`[applySession] terminal, no restart. status=${currentRun.status}`);
  }
}
```

---

### 5.2 最小成本复现 "pending 卡住"

**方法 A（Chrome DevTools 网络节流）**：

1. 打开 DevTools → Network → Throttling → 自定义，设置：
   - Download: 不限
   - Upload: 不限
   - Latency: **3000ms** （只加延迟，不限带宽）
2. 向 DevAgent 发送任意任务（workspace 任意填）
3. 立即观察 Console 中 `[loadSessions#1] arrived` 的时间
4. 观察该时刻 `sessions.runs[activeRunId].status` vs `lastResult.run.status`
5. 若出现分裂（`session.runs` 是 queued/running，`lastResult` 是 success），bug 复现

**方法 B（手动注入延迟，更稳定）**：

在 `DevAgentService.listSessions()` 里临时加延迟：
```typescript
listSessions() {
  return this.http.get<DevSession[]>(`${this.base}/sessions`).pipe(
    delay(3000)  // ← 临时，验证后删除
  );
}
```
然后发送任务，观察消息区和 header badge 是否出现分裂。

---

### 5.3 验证 `waiting_input` 无限轮询

1. 给 DevAgent 设置一个不存在的 workspace 路径（如 `/tmp/nonexistent-path-12345`）
2. 发送任务
3. 打开 DevTools → Network → 过滤 `runs/`
4. 观察是否每 1500ms 发一个 `GET /dev-agent/runs/`（URL 末尾无 runId，或是 empty string）
5. 如果是，bug 确认

---

### 5.4 验证 IME Enter bug

1. 切换系统输入法为中文拼音
2. 在 DevAgent 或 DesignAgent 输入框里打 `n`（触发 IME 候选词列表）
3. 按 `Enter` 选择候选词
4. 观察是否意外触发了消息发送（输入框内容被清空，消息被发出）
5. 对比在 `chat.component.ts` 的主聊天框里同样操作，验证主聊天框不会误触发

---

### 5.5 验证修复真正生效的检查清单

| 修复项 | 验证方法 |
|--------|---------|
| IME Enter | 同 5.4，修复后按 Enter 选词不发送，Shift+Enter 换行，Enter（无 IME）发送 |
| `waiting_input` 停止轮询 | 同 5.3，修复后 Network 面板里不再出现 1500ms 周期的失败请求 |
| `buildChatMessages` 用 activeResult 覆盖 | 用方法 B（延迟 3000ms），修复后即使 loadSessions 返回 stale 数据，消息区也立即显示 success 的 final summary |
| `loadSessions` seq 保护 | 用方法 B，修复后 console 应只显示最新序列号的 `arrived`，旧序列号被丢弃 |
| `waiting_input` 显示为"等待补充" | 触发 workspace 不存在，观察消息区是否显示引导用户输入路径的 assistant 消息，而非"任务执行失败" |

---

### 5.6 回归矩阵（修改后必须验证的场景）

```
场景 1：正常任务，快速网络（<200ms）
  预期：发送 → 立刻看到用户消息 → 进度更新 → 最终 success + finalReply

场景 2：正常任务，慢速网络（loadSessions 3000ms 延迟）
  预期：同场景 1，消息区不出现状态回退

场景 3：workspace 不存在
  预期：停止轮询，显示"等待补充"引导文字，不是"失败"

场景 4：中文输入法选词
  预期：Enter 选词不触发发送，Enter（非 IME）触发发送

场景 5：重刷页面后有 running 状态的 run
  预期：自动恢复轮询（init → loadSessions → applySelectedSession → pollRun）

场景 6：取消 running 中的 run
  预期：立即停止轮询，显示 cancelled 状态

场景 7：rerun / resume
  预期：新 run 出现在消息流末尾，不清除历史消息
```
