# YOU_KNOW（模块定位：Plan/Task/Reminder/Occurrence）

这是给你自己（以及未来协作者）看的“概念对照卡”。目标是：当你在系统里做新增功能或改语义时，能立刻判断**该改哪一层**，避免把长期规则、一次执行、通知机制、以及“某天某次”的实例混在一起。

---

## 四个核心对象（强语义分层）

### 1) Plan：长期意图 / 规则 / 安排（稳定对象）

Plan 表示你“想持续做一件事”，是长期可持续的安排模板。

它回答：
- 我想长期实现什么（意图/目标）
- 我希望在什么条件/时间规律下触达（调度策略/规则）
- 这件事的“生成器”是什么（会不断产生未来待办或触发点）

Plan 不回答（或不承载）：
- “今天这一次到底做没做”（那是 Occurrence）
- “这一次发什么通知”（那是 Reminder/Occurrence）
- “具体任务怎么执行”（那是 Task）

常见例子：
- 工作日 18:00 工时上报
- 每天 12:00 吃午饭提醒
- 每周五整理本周总结
- 下周开始准备面试复盘

---

### 2) Task：某一次需要完成的具体事项（执行单元）

Task 是可执行单元，回答“某次具体要不要做、做没做、状态如何”。

Task 可以来自：
- 手动创建
- Plan 派生（由 Plan 生成 occurrence，再从 occurrence 派生 task）
- Agent 委派
- 提醒触发后转成待办

Task 关心：
- 执行状态（pending / running / succeeded / failed / cancelled）
- 结果（产物、摘要、错误原因）
- 需要的上下文（任务参数、关联资源）

---

### 3) Reminder：触达机制 / 唤醒机制（附属机制）

Reminder 不是业务主语，它只是告诉系统“在什么时候提醒你、用什么方式提醒、是否重复、和哪一个 Plan/Task 关联”。

Reminder 的职责边界：
- 它负责“通知投递”相关字段与策略（如渠道、模板、重试/节流）
- 它不负责“这次业务到底应该不应该发生”（业务是否发生由 Occurrence 决定）

因此：
- “取消今天工时提醒”可以是 reminder 层（如果是单次投递层面的取消）
- “今天不用工时上报”一般不是 reminder 层（这是 occurrence/task 是否产生/是否执行的问题）

---

### 4) Occurrence：某个规则在某天产生的一次实例（你现在最缺的）

Occurrence 是 Plan 在具体时间点上的“实例化结果”。

它回答：
- 这条 Plan 的规则，在某个具体日期/时间（例如 3 月 19 日 18:00）上是否发生
- 如果发生，它会进一步走向哪种后续形态：
  - 派生出一个 Task
  - 派生出一个 Reminder
  - 进入 skipped（跳过）或 postponed（延期）

Occurrence 通常是最容易被用户“当天意愿”影响的层级：
- 用户说“今天不用了”，改的是 occurrence（而不是 Plan 本体）
- 用户说“下次改到明天”，也是改 occurrence 的时间实例/状态

---

## 关系速记（什么时候会生成什么）

最常见的链路可以理解为：

`Plan`（长期模板）
  → 在某个具体时间点实例化为 `Occurrence`
  → `Occurrence` 决定派生 `Task` 与/或 `Reminder`
  → `Task` 执行、`Reminder` 投递、或 `Occurrence` 变为 skipped/postponed/cancelled

---

## 建议补充的配套概念（同一语义风格）

下面这些概念不是必须，但很有助于你在写实现/改语义时保持边界清晰。

### A) Schedule / Recurrence（调度规则）

Plan 内部通常包含“时间规律”部分（例如工作日、每周五、每天 12:00、以及时区/日历规则）。

你可以把它当成 Plan 的一部分实现，但概念上要能区分：
- Plan：长期意图与规则集合（稳定对象）
- Recurrence：时间规律本体（Plan 的字段/组成）

---

### B) Trigger（触发/唤醒事件）

系统里可能存在“发生了某件事 -> 让 occurrence 生成/派生”的机制。

你需要区分：
- Trigger 是系统层的“发生条件/唤醒”
- Occurrence 是业务层的“实例化结果”

---

### C) Status（状态机字段）

建议所有对象都显式拥有状态（且语义一致）：

- `PlanStatus`：启用/暂停/废弃（长期层）
- `OccurrenceStatus`：scheduled / postponed / skipped / cancelled / resolved（实例层）
- `TaskStatus`：pending / running / succeeded / failed / cancelled（执行层）
- `ReminderStatus`：queued / sent / failed / cancelled（投递层）

（你不需要一次性把状态机做得很复杂，但要避免“同一句话在不同层含义不一致”。）

---

### D) Postponed / Deferred（延期）

postponed 是发生了但被推迟的 occurrence 语义。

推荐你用一句话约定：
- Postponed 不是“取消”，而是“该 occurrence 的业务结果会在新的时间实例里继续完成”

---

### E) Skipped（跳过）

skipped 是“这一次不执行/不投递”的实例语义。

推荐约束：
- skipped 通常意味着不会派生 task 或 reminder（或其派生被撤销/作废）

---

### F) Attempt / Delivery（投递尝试）

如果你将来要做投递重试，建议把它明确为：
- Reminder（配置与关联）
- DeliveryAttempt（一次发送尝试：成功/失败/重试时间/错误码）

这样你就不会把“通知失败”错误地当成“业务没发生”。

---

## 你应该如何做决策（用户话术 -> 修改层）

用这个最小映射表，你每次看到用户意图就能落点：

1. 用户改“以后一直都不要/一直都要”：改 `Plan`
2. 用户改“今天这一场不做了/改了时间”：改 `Occurrence`
3. 用户改“这次提醒别发/换渠道/重试策略”：改 `Reminder`（或与 Reminder 绑定的 occurrence 派生规则）
4. 用户改“具体要做什么任务/怎么执行/执行结果”：改 `Task`

---

## 一句总纲

Plan 稳定；Task 可执行；Reminder 只负责触达；Occurrence 是“某一天的那一次实例”。当你想清楚“用户改的是哪一天”，就能自然落到 Occurrence；当你想清楚“用户改的是长期规则”，就能落到 Plan。

