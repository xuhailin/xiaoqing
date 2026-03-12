---
name: timesheet-entry
description: 工时录入技能。用于处理工时预览（preview）、确认提交（confirm）、直接提交（submit，兼容旧动作）和缺失日期查询（query_missing），包含用户文本改写解析与项目名模糊匹配。
---

# 工时录入技能（按当前代码实现）

## 何时触发

- 用户表达工时相关意图，且 `taskIntent=timesheet`。
- 典型输入：
  - 预览：`帮我填今天工时`、`先看下今天工时`
  - 确认提交：`确认`、`就按这个提`
  - 带修改确认：`住院医生 松江现场支持 8`
  - 查询漏填：`这个月哪天没录工时`

## 可用性前提

- `FEATURE_TIMESHEET=true`
- `TIMESHEET_LOGIN_ID` 非空
- 实际提交流程还需要：
  - `TIMESHEET_PASSWORD`
  - `TIMESHEET_PROJECTS_CONFIG` 对应配置文件可读（默认 `timesheet-projects.json`）

## 输入槽位与动作

- `timesheetAction`: `preview | confirm | submit | query_missing`
- `timesheetDate`: `YYYY-MM-DD`（`preview/confirm/submit` 可用）
- `timesheetMonth`: `YYYY-MM`（`query_missing` 可用）
- `timesheetRawOverride`: 确认时用户原始修改文本

说明：
- `submit` 为兼容旧动作，当前链路仍支持。
- 对 `timesheet`，策略层允许日期/月份缺省，不会因为 `timesheetDate/timesheetMonth` 缺失而先反问；下游默认今天/当月。

## 端到端执行链路

1. 意图层
- `intent` 将工时意图归一化到上述槽位。
- `timesheetAction` 允许：`preview/confirm/submit/query_missing`。

2. 会话路由层
- 命中 `run_local_timesheet` 后调用本地执行器。
- 若 `timesheetAction=confirm`：
  - 先取 `timesheetRawOverride`。
  - 若槽位没有，则尝试从用户原文推断覆盖文本：
    - 支持多行或 `;`/`；` 分隔。
    - 每行需以工时数字结尾（例如 `... 8`、`... 4h`、`... 3小时`）。

3. 执行器层
- 解析参数并调用 `TimesheetSkillService.execute()`。
- `confirm` 同时支持 `rawOverride` 和 `timesheetRawOverride` 两种入参键名。

4. 工时技能服务层（`TimesheetSkillService`）
- 根据 `action` 分派到：
  - `previewTimesheet`
  - `confirmTimesheet`
  - `submitTimesheet`
  - `queryMissingDates`

5. OA 自动化执行层（`executeTimesheetWorkflow`）
- 负责登录、导航、填表、提交、错误截图。
- 在 `confirm` 场景下，只有“用户输入每一行都以工时数字结尾”才会自动把原文当作 `rawOverride` 透传。

## 各动作详细步骤

### A. `preview`（只读，不提交）

1. 目标日期：`targetDate` 或默认今天。
2. 查 `timesheetRecord`，若该日期已存在记录，直接返回“已提交过”。
3. 加载项目映射。
4. 遍历项目仓库读取当日 git log（可按 `TIMESHEET_GIT_AUTHOR` 过滤）。
5. 仅保留有提交的项目，按项目数分配工时（总计 8h，整数分配）。
  - 若项目数 > 8，分配数组长度最多 8；预览里超过 8 的项目会显示 `0h` 建议值。
6. 返回：
  - 文本预览（项目、提交摘要、建议工时、总工时）
  - `previewEntries`
  - `totalHours`
7. 不写库、不触发 OA 提交。

### B. `confirm`（确认后提交）

1. 目标日期：`targetDate` 或默认今天。
2. 若该日期已存在 `timesheetRecord`，返回失败（避免重复提交）。
3. 加载项目映射。
4. 分支：
  - 有 `rawOverride`：
    - 解析覆盖文本（见“覆盖文本解析规则”）。
    - 解析失败（0 条有效覆盖）则返回失败，提示格式示例。
    - 解析成功则走“覆盖提交”。
  - 无 `rawOverride`：
    - 回退到默认提交流程（按 git log 自动生成）。

### C. `submit`（兼容旧动作，直接提交）

1. 目标日期：`targetDate` 或默认今天。
2. 重复提交检查（`timesheetRecord`）。
3. 调用 `executeTimesheetWorkflow(date)`：
  - 从 git log 自动构建项目与内容。
  - 自动分配工时。
  - 登录 OA 并提交。
  - 实际提交时若项目数 > 8，仅提交前 8 个项目。
4. 成功后写入 `timesheetRecord`（`date/totalHours/projectsSummary`）。

### D. `query_missing`（查询漏填）

1. 目标月份：`targetMonth` 或默认当月。
2. 计算该月工作日（周一到周五）。
3. 查询该月 `timesheetRecord` 已记录日期。
4. 仅统计 `<= 今天` 的工作日缺失项。
5. 返回缺失日期列表。

注意：
- 这里只统计“通过本工具写入数据库”的记录，不含纯 OA 手工录入。

## 覆盖文本解析规则（confirm）

输入支持：
- 单行：`住院医生 松江现场支持 8`
- 仅改工时：`住院医生 8`
- 多行：按换行或 `;`/`；` 分隔

单行解析逻辑：
1. 从行尾提取工时：`\d+(\.\d+)?`，可带 `h/H/小时`。
2. 工时范围：`0 < hours <= 24`。
3. 去掉末尾工时后，按第一个空白拆分：
  - 第一段是 `projectHint`
  - 其余是 `content`（可空）
4. 用 `projectHint` 做项目模糊匹配。
5. 生成覆盖项：`{ displayName, content?, hours }`。

说明：
- `projectHint` 只取“工时前文本”的第一个空白分段，其后都当作 `content`。
- 覆盖模式不自动重分配工时，提交工时总和以用户输入为准（不强制等于 8）。

## 项目模糊匹配规则

按顺序命中：
1. `displayName` 全量精确匹配。
2. `displayName` 包含 `hint`，且唯一命中。
3. 字符重叠打分（`hint` 每个字符是否出现在项目名中），取最高分：
  - 分数需达到 `hint.length * 0.5` 才算命中。
4. 兜底：若仅 1 个项目，直接命中该项目。

示例：
- `住院医生` 可命中 `住院医师工作站`。

## OA 提交流程（当前实现）

1. 登录：
- `SiteAuthService.ensureLoggedIn()`
- 登录选择器：
  - 账号 `#loginid`
  - 密码 `#userpassword`
  - 提交按钮 `button:has-text("登 录")`

2. 导航到流程：
- 点击 `.wevicon-top-menu-default`
- 点击 `产研医工时录入流程(Redmine Sync)`，等待弹窗

3. 选日期并进入表单：
- 点击 `.picker-icon`
- 直接点击日数字文本
- 点击 `button:has-text("提 交")`
- 等待 URL 命中 `/spa/workflow/static4form/index.html`

4. 填每行项目：
- 首行后每新增一行，点击 `[title="添加"]`
- 按行选择两个下拉：
  - 第 1 个下拉：研发项目
  - 第 2 个下拉：客户项目
- 工作内容与工时填充：
  - 工作内容优先匹配 id 包含 `19759` 或 placeholder 包含“工作内容”
  - 工时优先匹配 id 包含 `19767` 或 placeholder 包含“工时”

5. 提交：
- 点击 `button:has-text("提 交")`
- 若出现全局 dialog：
  - 自动点击“确定”
  - 继续观察是否发生页面前进（URL 变化或离开 `static4form` 页面）
  - 若在超时时间（`max(TIMESHEET_TIMEOUT_MS, 8000ms)`）内无前进行为，返回失败并把弹窗文案反馈给用户

6. 异常：
- 分类为 `login/navigation/form-fill/submit/unknown`
- 截图保存到 `TIMESHEET_SCREENSHOT_DIR`（默认 `assets/timesheet-debug`）

## 配置与数据

### 环境变量

- `FEATURE_TIMESHEET`
- `TIMESHEET_LOGIN_ID`
- `TIMESHEET_PASSWORD`
- `TIMESHEET_OA_URL`
- `TIMESHEET_PROJECTS_CONFIG`
- `TIMESHEET_GIT_AUTHOR`
- `TIMESHEET_SCREENSHOT_DIR`
- `TIMESHEET_TIMEOUT_MS`
- `RESOURCE_SESSION_DIR`
- `LOCAL_ACTION_BROWSER_HEADLESS`

### 项目映射文件结构

```json
[
  {
    "repoPath": "/abs/path/repo",
    "rdProjectCode": "Zxxxxxxx",
    "customerProjectCode": "Axxxxxxx",
    "displayName": "项目中文名"
  }
]
```

### 本地记录表用途

- 表：`timesheetRecord`
- 用途：
  - 幂等检查（防止同日重复提交）
  - 漏填查询（`query_missing`）

## 已知限制（按代码现状）

- 日期选择是“点击日数字”的简化实现，跨月切换是 TODO。
- 表格列定位仍带硬编码特征（`19759/19767`），对 OA DOM 变更敏感。
- 下拉框“研发/客户项目”通过位置索引区分（0/1），稳定性依赖页面结构。
- 提交成功判定较弱（固定等待），未做强校验。
- 未出现弹窗时，提交后仍是固定短等待（3 秒）策略。
- `query_missing` 只统计本工具写库记录，不覆盖 OA 外部录入。
- `query_missing` 仅按工作日（周一到周五）计算，未接入法定节假日历。
- 可用性检查只要求 `FEATURE_TIMESHEET` 与 `TIMESHEET_LOGIN_ID`；`TIMESHEET_PASSWORD` 缺失会在执行提交时失败。
