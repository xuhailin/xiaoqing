# DevAgent 会话界面审查报告（已废弃）

> **已合并到 `docs/dev-agent-ui-v2-implementation-plan.md`，请阅读该文件。**
> 审查日期：2026-03-24
> 审查范围：DevAgent 会话界面、DesignAgent 会话界面、输入法回车 bug、状态流转与消息投影

---

## 一、现状理解

### DevAgent 前端架构

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

状态由 `DevAgentPageStore`（Angular `@Injectable()`）管理：
- `sessions` signal：从 `GET /dev-agent/sessions` 加载的完整 session 列表
- `lastResult` signal：最近一次 `send()` / 轮询的最新 run 结果
- `chatMessages` = `computed(() => buildChatMessages(selectedSession(), currentResult()))`
- `runState` = `computed(() => buildRunState(currentResult()))`
- 轮询：`pollRun(runId)` 每 1500ms 调用 `GET /dev-agent/runs/:runId`

### DesignAgent 前端架构

```
DesignAgentPageComponent                   // 单一巨型组件，所有 UI 内联在模板和 styles 中
  ├─ 侧边栏：对话列表（sidebar）
  └─ 主区域：消息流 + 输入区（行内 article/div，无复用组件）
```

**无状态管理层**，所有状态用 `signal()` 直接放在组件里，服务调用也在组件里。

### 样式体系对比

| 维度         | DevAgent                                      | DesignAgent                              |
|------------|-----------------------------------------------|------------------------------------------|
| CSS 变量前缀   | `--workbench-*`, `--dev-agent-*`             | `--color-*`, `--space-*`, `--radius-*`   |
| 消息样式     | 独立组件（`UserMessageComponent` 等）          | 内联 BEM（`design-agent-page__message`）  |
| 面板容器     | `AppPanelComponent` + `variant="workbench"`  | 裸 `div + border + border-radius`        |
| 输入框       | `ChatInputComponent`（独立）                  | 内联 `textarea.design-agent-page__input` |
| Markdown    | 不渲染（plain text）                           | 手写 regex `renderMarkdown()` + `[innerHTML]` |
| 布局         | `height: 100%` flex column                   | `grid-template-columns: 240px 1fr`       |

---

## 二、缺陷清单

### P0 缺陷（直接影响核心功能，必须修）

---

#### P0-1：中文输入法选字按回车会直接发送消息

**现象**：
用拼音输入法（或任意 CJK IME）打字时，按 Enter 确认候选词，会触发消息发送，导致用户输入中途被打断、发出空消息或半句话。

**根因**：
两个输入框都在 `keydown.enter` 事件处理时未检查 `KeyboardEvent.isComposing`。IME 输入期间按 Enter 选字时，`isComposing = true`，但代码没有 bail-out。

**文件位置**：
- `frontend/src/app/dev-agent/components/chat-input.component.ts:87-92`
  ```typescript
  handleEnter(event: Event) {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    // 缺少: if (keyboard.isComposing) return;
    keyboard.preventDefault();
    this.submit.emit();
  }
  ```
- `frontend/src/app/design-agent/design-agent-page.component.ts:736-742`
  ```typescript
  protected handleKeyDown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      // 缺少: if (keyboardEvent.isComposing) return;
      keyboardEvent.preventDefault();
      this.sendMessage();
    }
  }
  ```

**对比**：
主聊天组件 `frontend/src/app/chat/chat.component.ts:324-327` 已有正确实现：
```typescript
if (event.isComposing || (event as any).keyCode === 229) {
  return;
}
if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { ... }
```

**修复建议**：
在两处 `handleEnter` / `handleKeyDown` 的第一行均加：
```typescript
if (keyboard.isComposing || (keyboard as any).keyCode === 229) return;
```

---

#### P0-2：run 状态为 `waiting_input` 时前端轮询永不停止

**现象**：
当 workspace 路径不可用时，后端返回 `run.status = 'waiting_input'` 且 `run.id = ''`（空字符串）。前端无法识别这是终态，持续向 `GET /dev-agent/runs/` 发请求（runId 为空），后端返回 404 或异常，轮询 error handler 继续重试，UI 永远显示"执行中"。

**根因**：
`dev-agent-page.store.ts:18`：
```typescript
private static readonly TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
```
不包含 `waiting_input`。而后端 `dev-agent.service.ts:76` 会返回虚拟状态：
```typescript
run: {
  id: '',               // 空 ID —— 轮询 /runs/ 会 404
  status: 'waiting_input',
  ...
}
```

**轮询错误路径**（`dev-agent-page.store.ts:499-522`）：
```typescript
error: () => this.schedulePoll(pollOnce),  // 任何错误都重试，包括 runId='' 造成的 404
```

**修复建议**：
1. `TERMINAL_STATUSES` 加入 `waiting_input`：
   ```typescript
   private static readonly TERMINAL_STATUSES = new Set([
     'success', 'failed', 'cancelled', 'waiting_input'
   ]);
   ```
2. `send()` 收到响应后，若 `run.id` 为空，不启动轮询：
   ```typescript
   if (result.run.id) {
     this.pollRun(result.run.id, result.session.id);
   }
   ```
3. `normalizeRunStatus()` 中把 `waiting_input` 映射到 `'failed'`，使 UI 显示失败状态而非 running。

---

### P1 缺陷（影响状态正确性和用户感知，应该修）

---

#### P1-1："实际成功但界面一直 pending" 的根本原因

**现象**：
run 已经成功，header 的状态徽章可能显示正确，但消息列表仍然展示"执行中"的进度消息，没有出现最终结果（finalReply/stopReason）。

**根因**：
`chatMessages` 和 `runState` 使用了**不同的数据源**：

```
runState   → currentResult → lastResult（由 pollRun 直接 set，实时）
chatMessages → buildChatMessages(selectedSession(), currentResult())
            → selectedSession() 中的 session.runs（来自 sessions signal）
```

`buildChatMessages` 的实现（`dev-agent.view-model.ts:183-191`）：
```typescript
const runs = session?.runs?.length
  ? [...session.runs].sort(...)     // 有 session 时，只用 session.runs，currentResult 被忽略
  : activeResult ? [taskResultToRun(activeResult)] : [];
```

`session.runs` 的更新依赖 `updateSessionRun(run)`（store 内的手动补丁）或 `loadSessions()` 重新加载。

**竞态场景（最常见）**：
1. poll 检测到 success → `updateSessionRun(run)` 补丁 sessions ✓ → `clearRunPolling()` → `loadSessions()` 发出
2. `loadSessions()` 请求在 DB 写入 success 之前发出（或先前某次 `loadSessions` 还在飞）
3. 旧的 `loadSessions` 响应回来，调用 `this.sessions.set(staleData)` **完全覆盖** 已经补丁好的 sessions
4. `selectedSession().runs` 被覆盖为 running 状态
5. `chatMessages` 重算 → 消息区还在 running，但 header 从 `lastResult` 里读是 success

**补充**：`lastResult.run.id === currentRun.id` 的保护（store:60-63）能让 `currentResult` 不被覆盖，所以 header 是对的。但 `chatMessages` 直接吃 `session.runs`，就完全被覆盖了。

**修复建议**：
`buildChatMessages` 应在有 `activeResult` 的情况下，对当前活跃 run 用 `activeResult` 覆盖 session 中对应的旧 run 数据：
```typescript
export function buildChatMessages(
  session: DevSession | null,
  activeResult: DevTaskResult | null,
): DevChatMessage[] {
  const allRuns = session?.runs?.length
    ? [...session.runs].sort(...)
    : activeResult ? [taskResultToRun(activeResult)] : [];

  // 用 activeResult 覆盖 session.runs 中的同 ID run（确保消息区与 runState 一致）
  const activeRunId = activeResult?.run.id;
  const runs = activeRunId
    ? allRuns.map((r) => r.id === activeRunId ? taskResultToRun(activeResult!) : r)
    : allRuns;

  return runs.flatMap((run) => buildRunMessages(run));
}
```

---

#### P1-2：多个并发 `loadSessions` 调用竞争覆盖 sessions

**现象**：
UI 偶发抖动（消息区在 running 和 success 之间闪）。

**根因**：
`send()` 调用后，同时发出两个 HTTP：
- `pollRun(runId)` 开始轮询
- `loadSessions(sessionId)` 加载 session 列表

而 `applySelectedSession()` 每次被调用时，若 run 仍未终态，会再次调用 `pollRun()`，`pollRun()` 内部先 `clearRunPolling()`（取消旧的 poll）再开新的。

两个 `loadSessions` 并发时，响应先后顺序不确定，后到的会用 stale data 覆盖 `sessions`。

**文件位置**：`dev-agent-page.store.ts:387-411`

**修复建议**：
在 `loadSessions` 内维护一个 `loadSessionsSeq` 计数器，只处理最新的那次响应（last-write-wins 变 last-issued-wins）：
```typescript
private loadSessionsSeq = 0;

private loadSessions(preferredSessionId?: string, ...) {
  const seq = ++this.loadSessionsSeq;
  this.devAgent.listSessions().subscribe({
    next: (sessions) => {
      if (seq !== this.loadSessionsSeq) return; // 丢弃过期响应
      this.sessions.set(sessions);
      ...
    },
  });
}
```

---

#### P1-3：`DesignAgent` 的 `renderMarkdown` 有 HTML 注入风险 + 产出破碎 HTML

**现象**：
DesignAgent 的 AI 回复通过 `renderMarkdown()` 处理后，用 `[innerHTML]` 注入。

**根因**：`design-agent-page.component.ts:811-825`
```typescript
.replace(/^(.+)$/gm, '<p>$1</p>');
```
这条 catch-all 正则会把 HTML 标签本身再包一层 `<p>`，产出 `<p><h3>...</h3></p>` 等无效 HTML。另外，对于 `<script>` 等标签，Angular 的 `DomSanitizer` 会自动拦截，但字符串拼接逻辑本身极易因 markdown 嵌套而产出残缺 HTML，导致渲染错位。

**修复建议**：
用 `marked` 或 `marked-mangle` 等成熟库替代手写 regex。若不想引入依赖，至少在 `renderMarkdown` 中先对用户输入做 `escapeHtml()`，再进行 markdown 替换，且移除最后一行覆盖所有行的 `<p>` wrapper。

---

### P2 缺陷（体验/架构层面，建议修）

---

#### P2-1：`ChatMessageListComponent` 自动滚动仅在消息数量变化时触发

**现象**：
运行中的 assistant 消息文本更新（`lastEvent` 刷新），不会触发自动滚动到底部。

**根因**：`components/chat-message-list.component.ts:70-75`
```typescript
ngAfterViewChecked() {
  if (this.messages.length !== this.lastMessageCount) {  // 只检查数量
    this.lastMessageCount = this.messages.length;
    this.scrollToBottom();
  }
}
```

**修复建议**：
改为检查最后一条消息的 `id` 或内容哈希，或在 running 状态下始终保持在底部（只在用户向上滚动时停止）。

---

#### P2-2：`DevAgentSessionComponent` 中 `taskInput` 是组件局部变量，不是 signal

**现象**：
`taskInput = ''` 是普通属性（非 signal），与 signal 体系混用。`submitTask()` 先调用 `store.send(task)` 再清空 `taskInput`，但 `send()` 是异步的，如果提交后组件被重新挂载（路由跳转），`taskInput` 状态会丢失。

**根因**：`dev-agent-session.component.ts:37-53`

**修复建议**：
`taskInput` 改用 `signal('')`，或将其提升到 store 中统一管理。`send()` 的 `onSuccess` 才清空。

---

#### P2-3：DevAgent 和 DesignAgent 消息区 UI 完全各自实现，无任何复用

**详见"改造建议"章节**。

---

#### P2-4：DesignAgent 消息区消息有 loading 动画（spinner），但 DevAgent 没有

**现象**：
DevAgent 在 run.status = queued/pending 时，chatMessages 里的 running assistant 消息文本是静态 `'正在处理你的开发任务'`，没有动效。`DesignAgent` 有一个 `<app-icon name="loader">` 的 loading 指示器，但它是从消息列表底部浮出的，而不是嵌在消息气泡里。两者都缺少明显的"系统正在处理"信号。

**文件位置**：
- `dev-agent.view-model.ts:454-463`（`buildRunningAssistantText`）
- `design-agent-page.component.ts:159-165`

**修复建议**：
running 状态的 `AssistantMessageComponent` 应有脉冲动效（CSS `animation`），或在 `bubble.progress` 样式里加一个 spinner。

---

## 三、功能维度总结

| 功能点                        | DevAgent                        | DesignAgent                     | 状态       |
|-----------------------------|---------------------------------|---------------------------------|----------|
| IME Enter 防误触             | 未处理 `isComposing`            | 未处理 `isComposing`            | P0 bug   |
| `waiting_input` 状态识别     | 不识别，无限轮询                | 不涉及                           | P0 bug   |
| 消息区与状态徽章数据同源       | 不同源（session.runs vs lastResult）| 单一数据源（OK）               | P1 bug   |
| 并发 loadSessions 竞争        | 存在                            | 不涉及                           | P1 bug   |
| Markdown 渲染安全             | 不渲染（安全）                   | regex+innerHTML（脆弱）          | P1 bug   |
| 自动滚动                     | 只在消息数量变化时触发           | `setTimeout` + scrollTop        | P2 缺陷  |
| 空消息发送保护               | 有（`!taskInput.trim()`）       | 有（`!inputText().trim() && !pendingImages().length`）| OK |
| 取消/重跑/恢复               | 有                              | 无                               | OK（各自合理）|

---

## 四、交互维度总结

| 体验点                        | DevAgent                                    | DesignAgent                    | 问题         |
|-----------------------------|---------------------------------------------|--------------------------------|------------|
| 运行中反馈                   | 静态文字（`正在处理你的开发任务`）          | spinner 图标 + `正在思考...`    | 两者均弱    |
| 运行进度（lastEvent）        | 有，但轮询间隔 1500ms，更新感知延迟         | 无                              | 偏弱        |
| 成功/失败状态呈现             | header badge（可能与消息区不一致）          | loading 消失即为完成            | P1 bug     |
| 拼音输入误触发送             | 存在                                        | 存在                            | P0 bug     |
| 取消/停止操作可见性           | 有"停止"按钮                                | 无                              | OK（各自合理）|
| 空白会话引导                 | "先在下方输入你的开发任务" 空状态组件       | `design-agent-page__welcome` 引导 | 两者各有，但样式割裂 |
| 消息滚动                     | 仅数量变化滚动                              | `setTimeout` 50ms 滚动         | 均不完整    |

---

## 五、改造建议

### 5.1 会话 UI 复用策略

**应该复用（提取为共享组件）：**

| 组件/样式                     | 现状                                      | 建议                             |
|-----------------------------|-------------------------------------------|----------------------------------|
| 消息气泡基础样式              | DevAgent 有完整 token 体系                | DesignAgent 改为使用 `--workbench-*` 和 `--dev-agent-*` token |
| `ChatInputComponent`        | DevAgent 已有，DesignAgent 自己写一套      | DesignAgent 改用 `ChatInputComponent`（扩展支持图片预览区域） |
| 消息 `user` 气泡样式         | DevAgent：`UserMessageComponent`；DesignAgent：内联 BEM | DesignAgent 可直接复用 token，样式可以相同 |
| 消息 `assistant` 气泡样式    | 同上                                      | 同上                              |
| 消息列表容器 + 自动滚动       | DevAgent：`ChatMessageListComponent`      | DesignAgent 可不复用组件，但滚动逻辑应对齐 |

**不应该强制合并（保留差异）：**

| 点                           | 理由                                      |
|-----------------------------|-------------------------------------------|
| DesignAgent 的图片上传 UI    | DevAgent 无此能力，属于 DesignAgent 特有   |
| DesignAgent 的"建议修改/确认" | DevAgent 无此交互                          |
| DevAgent 的 tool-call/tool-result 消息类型 | DesignAgent 不展示工具调用细节    |
| DevAgent 的 session/run 层级 | DesignAgent 只有单对话，无 run 概念        |

**总结原则**：共用 token 和基础输入组件，不强行合并消息结构（语义差异太大）。

---

### 5.2 输入法 Enter 修复（两处统一）

**chat-input.component.ts** 修改方案：
```typescript
handleEnter(event: Event) {
  const keyboard = event as KeyboardEvent;
  if (keyboard.isComposing || (keyboard as any).keyCode === 229) return;
  if (keyboard.shiftKey) return;
  keyboard.preventDefault();
  this.submit.emit();
}
```

**design-agent-page.component.ts** 修改方案：
```typescript
protected handleKeyDown(event: Event): void {
  const keyboardEvent = event as KeyboardEvent;
  if (keyboardEvent.isComposing || (keyboardEvent as any).keyCode === 229) return;
  if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
    keyboardEvent.preventDefault();
    this.sendMessage();
  }
}
```

注：`keyCode === 229` 是 IE/旧版浏览器上的 IME 兼容写法，和 `isComposing` 配合使用可覆盖 Safari 旧版。

---

### 5.3 状态反馈分层方案

```
┌─────────────────────────────────────────────┐
│  层级 1：header badge（运行/成功/失败）        │  来源：runState（基于 lastResult，实时准确）
│  层级 2：消息区活跃 run 的 progress message   │  来源：buildChatMessages（需修复，改为覆盖 lastResult）
│  层级 3：tool-call/tool-result 展开详情       │  来源：session.runs 中的 agentTurns/stepLogs
└─────────────────────────────────────────────┘
```

修复后保证：
- 层级 1 与层级 2 使用相同的数据（`currentResult`），不再分裂
- 层级 3 展示历史详情，可以从 sessions 加载（稍有延迟但可接受）

---

## 六、分阶段改造计划

### Phase 1：修 bug（先不改结构）

优先级：P0 → P1，所有改动控制在独立文件内，不影响其他模块。

| 任务 | 文件 | 复杂度 |
|------|------|--------|
| 修复 DevAgent IME Enter | `chat-input.component.ts:87-92` | XS |
| 修复 DesignAgent IME Enter | `design-agent-page.component.ts:736-742` | XS |
| 加入 `waiting_input` 到 TERMINAL_STATUSES | `dev-agent-page.store.ts:18` | XS |
| 加入 `run.id` 为空时不启动 pollRun | `dev-agent-page.store.ts:154-175` | XS |
| `buildChatMessages` 中用 `activeResult` 覆盖活跃 run | `dev-agent.view-model.ts:179-191` | S |
| `loadSessions` 加 seq 防止旧响应覆盖 | `dev-agent-page.store.ts:387-411` | S |

---

### Phase 2：补状态反馈（提升感知）

| 任务 | 文件 | 说明 |
|------|------|------|
| running 状态的 AssistantMessageComponent 加脉冲动效 | `assistant-message.component.ts` | 加 CSS animation |
| ChatMessageListComponent 改进滚动触发条件 | `chat-message-list.component.ts` | 追踪最后一条消息 ID |
| DevAgent header 的 `queued`/`pending` 加等待动效 | `dev-chat-panel.component.ts` | badge 加 animate class |
| `waiting_input` 状态显示友好错误消息 | `dev-agent.view-model.ts` | `normalizeRunStatus` 分支 |

---

### Phase 3：结构统一（UI 复用，可选）

| 任务 | 说明 |
|------|------|
| DesignAgent 的输入框改用 `ChatInputComponent` | 扩展 `ChatInputComponent` 支持 `imageSlot` 内容投影 |
| DesignAgent 的消息气泡 token 对齐 workbench token | 将 `.design-agent-page__message` 的 CSS 改用 `--workbench-*` 和 `--dev-agent-*` |
| DesignAgent 的 `renderMarkdown` 替换为成熟库 | 引入 `marked`，移除 regex 实现 |
| 提取共享 `AppChatMessageBubble` 组件（可选） | 仅在确认 DesignAgent 也需要多种消息类型时才做 |

---

## 七、关键代码位置速查

| 问题 | 文件:行号 |
|------|----------|
| DevAgent IME Enter bug | `frontend/src/app/dev-agent/components/chat-input.component.ts:87` |
| DesignAgent IME Enter bug | `frontend/src/app/design-agent/design-agent-page.component.ts:736` |
| 正确的 IME Enter 参考实现 | `frontend/src/app/chat/chat.component.ts:324` |
| TERMINAL_STATUSES 缺 waiting_input | `frontend/src/app/dev-agent/dev-agent-page.store.ts:18` |
| pollRun 无限重试 | `frontend/src/app/dev-agent/dev-agent-page.store.ts:499-522` |
| chatMessages 数据源（不用 activeResult）| `frontend/src/app/dev-agent/dev-agent.view-model.ts:183-191` |
| loadSessions 全量覆盖 sessions | `frontend/src/app/dev-agent/dev-agent-page.store.ts:389` |
| applySelectedSession 重启 poll | `frontend/src/app/dev-agent/dev-agent-page.store.ts:436-440` |
| 后端返回 waiting_input + id='' | `backend/src/dev-agent/dev-agent.service.ts:74-87` |
| DesignAgent renderMarkdown XSS 风险 | `frontend/src/app/design-agent/design-agent-page.component.ts:811-825` |
| ChatMessageList 滚动仅检查消息数量 | `frontend/src/app/dev-agent/components/chat-message-list.component.ts:70-75` |
