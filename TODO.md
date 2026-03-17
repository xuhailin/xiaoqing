# DevAgent 演进 TODO

> 记录 DevAgent 从"编排器"向"调度器 + 上下文提供者"转型的后续计划。

---

## 已完成

- [x] 修复 `CLAUDECODE` 环境变量导致 SDK 嵌套检测误判（`buildChildEnv`）
- [x] 新增 `agent` 执行模式，整个任务委派给 Claude Code Agent 自主完成
- [x] 回归诊断入口默认走 `agent` 模式

## 近期（验证 agent 模式效果后）

- [ ] **验证 agent 模式端到端**：从回归页点击诊断 → DevAgent 走 agent 模式 → Claude Code 自主执行 → 结果回显
- [ ] **agent 模式进度推送**：当前 `onProgress` 回调只写 transcript，需要把关键事件（tool_use、text 摘要）推到前端轮询结果中
- [ ] **前端 DevAgent 面板适配**：agent 模式下没有 plan/steps，需要展示 agent 粒度的进度（turns、cost、当前动作）
- [ ] **agent 模式 cancel 支持**：通过 AbortController 传递取消信号到 ClaudeCodeStreamService

## 中期（agent 模式稳定后）

- [ ] **评估是否下线 orchestrated 模式**：如果 agent 模式在简单任务（ls、cat）上的成本和延迟可接受，可以考虑统一走 agent
- [ ] **下线 orchestrated 相关编排层**：DevTaskPlanner、DevStepRunner、DevStepRoutingService、DevProgressEvaluator、DevReplanPolicy、ShellExecutor（如果确认不再需要）
- [ ] **Prompt 组装层**：为 agent 模式设计 PromptAssembler，将 workspace 信息、项目约定（CLAUDE.md）、回归上下文等组装成高质量的 agent prompt
- [ ] **结果处理层**：设计 ResultProcessor，将 Claude Code 返回的原始文本解析为结构化数据（修改了哪些文件、诊断结论等）

## 长期

- [x] **成本追踪与预算治理**：per-run 的 costUsd 汇总、per-session 的预算上限、超额告警
- [x] **agent 模式 resume**：利用 SDK 的 session resume 能力，支持中断后继续执行
  - Schema: DevRun 新增 `agentSessionId`、`resumedFromRunId` + 自引用关系
  - SDK: `persistSession: true`，通过 `resume` 参数传入前次 sessionId
  - API: `POST /dev-agent/runs/:runId/resume`，可选 `userInput` 追加指令
  - 成本: resume 链的每个 run 独立计费，累加到 session.totalCostUsd
- [ ] **多 agent 协作**：一个 run 内启动多个 Claude Code Agent 并行处理不同子任务
