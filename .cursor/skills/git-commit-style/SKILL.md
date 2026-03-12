---
name: git-commit-style
description: Commits and usually pushes with this repository's fixed conventions: run status/diff, sync with remote before add, write concise Chinese commit messages following Conventional Commits, and report hash after success. Uses optional log inspection only when conventions are unclear, and asks confirmation only for larger pushes. Use when the user asks to commit, push, or summarize commit content.
---

# 提交风格与流程 (Git Commit Style)

用于本仓库的提交任务。目标是：提交准确、信息清晰、风格稳定。

## 触发场景

- 用户说「帮我提交」「帮我 commit」「把当前改动提交」
- 用户要你给提交信息建议，或要求总结将要提交的内容

## 固定流程（必须按顺序）

1. 先检查当前状态与改动范围
   - 查看未跟踪/已修改文件（`git status`）
   - 查看 staged + unstaged 差异（`git diff`）
2. 在 `git add` 之前先同步远端代码，降低冲突概率
   - 若有工作区改动（未提交），先执行 `git stash` 再执行 `git pull --rebase`；pull 成功后再 `git stash pop` 恢复
   - 若 `git pull --rebase` 发生冲突：不自动解决，交由用户决断；提示用户本地解决冲突、修改完成后，再次请求提交（或自行 commit）
   - 用户解决冲突后再次提交时，从步骤 1 检查状态开始，按正常流程执行
3. 确认测试状态
   - 默认以"已测试通过后再提交"为前提
   - 若未测试且风险较高，先提醒用户补测或说明风险
4. 根据改动内容拟定提交信息
   - 中文描述，遵循 Conventional Commits 规范
   - 说明"为什么改"，不是机械罗列文件
   - 如果改动跨多个主题，先提醒用户是否拆分提交
5. 执行提交
   - 按用户要求决定范围（全部改动或指定文件）
   - 提交后再检查一次 `git status`，确认提交结果
6. 向用户回报
   - 给出 commit hash（短哈希）
   - 给出提交标题
   - 简要说明包含了哪些类型改动

## 强约束（默认生效）

1. 默认只提交"当前任务直接相关"的文件，不做兜底式 `git add -A`。
2. 若发现存在明显无关改动，先排除无关文件，再提交目标改动。
3. 若同时存在 `.cursor/` 配置改动与业务代码改动，必须先询问用户是否拆分为两个 commit：
   - commit A：`.cursor/`（规则/技能/文档）
   - commit B：业务代码
4. 用户未明确说"全部一起提交"时，禁止把跨主题改动合并成单个 commit。
5. 当改动跨多个独立目的（例如"功能修复 + 文档整理"），优先建议拆分提交并等待确认。
6. 默认遵循"测试通过后直接 push"的团队习惯：
   - 若本次拟推送改动文件数 `<= 5`：commit 完成后直接 push。
   - 若本次拟推送改动文件数 `> 5`：先向用户确认是否 push。
   - 若用户明确说了「推送 / push」：无论文件数多少，都按用户要求 push。
7. 不把"别人最近怎么写"当作新的标准；以本 Skill 固定规范为准。
8. 只有以下场景才查看 `git log` 做风格校准：
   - 新仓库/新分支首次协作，规范尚未明确
   - 发布流程或 CI 对提交格式有新增要求

## 提交信息风格（Conventional Commits）

### 格式

```
<类型>(<作用域>): <描述>

[可选正文]

[可选脚注]
```

### 类型

| 类型       | 用途                                   |
| ---------- | -------------------------------------- |
| `feat`     | 新功能                                 |
| `fix`      | 修复缺陷                               |
| `docs`     | 仅文档变更                             |
| `style`    | 代码格式调整（不影响逻辑）               |
| `refactor` | 既非修复也非新增功能的代码重构            |
| `perf`     | 性能优化                               |
| `test`     | 增加或修正测试                          |
| `build`    | 构建系统或外部依赖变更                   |
| `ci`       | CI 配置变更                            |
| `chore`    | 日常维护任务                            |
| `revert`   | 回退先前的提交                          |

### 规则

1. 描述使用中文，祈使语气（"增加功能"而非"增加了功能"）
2. 描述末尾不加句号
3. 描述控制在 72 字符以内
4. 主题与正文之间用空行分隔
5. 正文用于解释"是什么"和"为什么"，而非"怎么做"

### 作用域（可选）

用于指定改动涉及的模块，例如 `api`、`ui`、`auth`、`db`、`backend`、`frontend`、`desktop` 等。

### 破坏性变更

在类型/作用域后加 **!**，或在脚注中标注 **BREAKING CHANGE:**：

```
feat(api)!: 移除已废弃的接口

BREAKING CHANGE: /v1/users 接口已被移除。
```

### 示例

- `fix(ui): 修复切换患者下拉展开滚动定位`
- `chore: 调整 Cursor 规则与技能目录结构`
- `feat(backend): 增加 timesheet 技能执行器`
- `refactor(auth): 简化登录鉴权流程`
- `docs: 更新项目 README 部署说明`

### 正文（可选）

- 1-2 句补充背景与目的
- 写影响面与收益，不写无意义流水账

## 安全与边界

- 默认可在 commit 后执行 push（遵循上方"<=5 直接推，>5 先确认"规则）
- 未经用户明确要求，不使用 amend
- 不提交疑似敏感文件（如密钥、凭证）
- 若 hook 改写了文件，先重新检查再完成提交
- 发现提交范围与用户目标不一致时，先暂停并向用户确认

## 输出模板

提交完成后按如下结构回复：

- 提交哈希：`<short-hash>`
- 提交信息：`<subject>`
- 提交范围：`<核心改动概述>`
- 说明：`<如 hook 执行结果 / 是否仍有未提交改动>`
