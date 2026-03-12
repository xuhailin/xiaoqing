# DevAgent UI V2 实施计划

## 1. 目标
- 从“单列结果页”升级为“线程任务工作台”。
- 对齐 Codex / OpenClaw / AutoClaw 常见体验：线程优先、执行流可视化、日志可追踪、操作可回放。
- 不破坏现有后端能力，先做前端信息架构重构，再逐步增强交互能力。

## 2. 核心原则
- `rerun` 语义必须是“创建新 run”，旧 run 只读保留日志。
- 先解耦页面结构，再增加新能力，避免一次性大改风险。
- 桌面优先三栏布局，移动端退化为两层视图，保证可用性。

## 3. 信息架构（V2）
- 左栏：线程列表（Session + Runs）
  - 分组：`Running` / `Recent` / `Failed`
  - 支持关键词筛选（userInput、runId）
- 中栏：执行流（Run Timeline）
  - 事件流：`plan -> step -> step_eval -> replan -> report`
  - 每条事件可展开，显示命令、状态、摘要输出
- 右栏：详情与动作
  - Step 详情（stdout/stderr/error）
  - Run 元信息（workspace、executor、stopReason、artifact）
  - 动作：取消、复制命令、基于本 run 新建 rerun（新 run）
- 底部固定 Composer
  - 任务输入
  - workspace 选择
  - 快捷模板（排查失败、列目录、查看日志等）

## 4. 分阶段实施

## Phase A（结构重构，低风险）
- 目标：仅重构前端布局与组件边界，不新增后端接口。
- 主要改动：
  - 将 `dev-agent.component.ts` 拆分为页面壳层 + 子组件：
    - `dev-agent-page`
    - `dev-thread-pane`
    - `dev-run-timeline`
    - `dev-step-detail`
    - `dev-composer`
  - 引入页面级状态服务（signals store），统一管理：
    - sessions / selectedSession / selectedRun
    - poll lifecycle
    - filters/search
  - UI 改为三栏布局（桌面）+ 两层布局（移动端）
- 验收标准：
  - 功能等价：发送任务、查看 run、取消任务、轮询更新均可用
  - 代码可维护性提升：页面主文件明显瘦身，样式分组件

## Phase B（交互增强，中风险）
- 目标：提升“线程任务执行”体验，减少跳转和重复操作。
- 主要改动：
  - Timeline 事件卡片：支持失败高亮、重规划标记、快速跳到失败 step
  - Run 动作：
    - `Rerun`（基于当前 run.userInput + workspace 创建新 run）
    - 复制命令 / 复制错误摘要
  - 线程列表增强：
    - 失败数量 badge
    - 运行中置顶 + 自动焦点
- 依赖：
  - 前端可先用“重新发消息”实现 rerun 交互
  - 后续后端补 `POST /dev-agent/runs/:runId/rerun` 时无缝切换
- 验收标准：
  - 常见路径（失败排查、重试、继续观察）点击次数显著下降

## Phase C（实时化与链路能力，中高风险）
- 目标：接近 Codex/OpenClaw 的实时执行观感。
- 主要改动：
  - 轮询升级为 SSE/WebSocket（服务端增量推送 step/event）
  - run 链路化：
    - 后端支持 rerun API
    - 数据模型增加 `rerunFromRunId`（可选）
  - 视图支持 run chain（某个 run 的重跑历史）
- 验收标准：
  - 页面状态延迟明显下降
  - run 链路可追踪，旧 run 日志完整可回放

## 5. API 与数据演进建议
- 当前可直接复用：
  - `GET /dev-agent/sessions`
  - `GET /dev-agent/sessions/:id`
  - `GET /dev-agent/runs/:runId`
  - `POST /dev-agent/runs/:runId/cancel`
- 后续建议新增（Phase C）：
  - `POST /dev-agent/runs/:runId/rerun`
  - DevRun 字段：`rerunFromRunId String?`

## 6. 风险与控制
- 风险：单文件组件拆分时状态丢失/轮询重复
  - 控制：先提取状态服务，统一轮询入口，确保单实例计时器
- 风险：移动端三栏不可用
  - 控制：明确断点策略，小屏切换为“列表页 -> 详情页”
- 风险：样式重构引入全局冲突
  - 控制：组件级样式命名空间 + 保持现有 token 体系

## 7. 建议落地顺序
1. 先做 Phase A（不改后端，2-3 次提交）
2. 评审后进入 Phase B（重点做 timeline 和 rerun 交互）
3. 最后做 Phase C（接口与模型升级）

## 8. Phase A 交付清单（具体）
- 新增组件与样式文件
- 页面状态服务（signals store）
- 迁移现有 send/poll/cancel/openRun 逻辑到 store
- 保持现有接口不变的回归自测清单
  - 发起任务
  - 轮询状态变化到终态
  - 打开历史 run
  - 取消运行中 run
  - workspace 透传显示

