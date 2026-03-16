# 小晴对话回归数据目录

本目录承载小晴对话回归系统的首版数据资产。

当前目标：

1. 固定回归集来自 [QA.md](/Users/xuhailin/development/agents/xiaoqing/QA.md)
2. 真实对话回放支持后续导入你的历史对话
3. 两类数据共享同一套 schema 和评估标准

---

## 目录结构

```text
qa/
  README.md
  schemas/
    regression-scenario.schema.json
  cases/
    curated/
    promoted/
  replays/
    personal/
    snapshots/
  baselines/
    release-gate/
    replay/
  reports/
    latest/
    history/
```

---

## 数据类型

### 1. curated

固定回归用例。

用途：

- 发布门禁
- 核心承诺保底

当前来源：

- [QA.md](/Users/xuhailin/development/agents/xiaoqing/QA.md)

### 2. replay

真实对话回放样本。

用途：

- 发现固定回归集未覆盖的问题
- 比较新旧版本真实体验差异

说明：

- 首版先支持以结构化文件导入
- 后续可扩展为从数据库或导出文件直接生成

### 3. promoted

从 replay 样本中晋升出来、进入长期固定回归集的 case。

---

## 首版文件格式

首版统一使用 `json` 文件，便于后续直接用 Node.js / TypeScript 加载，不增加 YAML 解析依赖。

所有 case 必须遵循：

- [regression-scenario.schema.json](/Users/xuhailin/development/agents/xiaoqing/qa/schemas/regression-scenario.schema.json)

---

## transcript 约定

- `transcript` 只记录需要被系统实际执行的 `user` 输入顺序
- 不直接把旧的 assistant 输出作为执行输入
- 如果某条 replay 样本有原始历史回答，可放到 `reference.referenceConversation`

---

## expectations 约定

首版 `expectations.mustHappen` / `mustNotHappen` 使用统一规则结构：

```json
{
  "type": "rule_name",
  "description": "人类可读描述",
  "params": {}
}
```

`type` 首版推荐使用但不限于：

- `reply_exists`
- `route_is`
- `capability_is`
- `capability_not_triggered`
- `dev_route_not_triggered`
- `side_effect_happened`
- `reply_describes_identity`
- `reply_describes_capabilities`
- `reply_suggests_reminder`
- `reply_contains_structured_steps`
- `reply_refuses_request`
- `reply_mentions_devagent_capability`
- `forbid_phrase`
- `forbid_capability_claim`

后续可增补，不要求首版一次性穷尽。

---

## qualityDimensions 约定

首版统一使用对象结构：

```json
{
  "dimension": "persona_consistency",
  "minScore": 2,
  "weight": 1
}
```

推荐维度：

- `answer_relevance`
- `action_correctness`
- `reasoning_quality`
- `persona_consistency`
- `boundary_honesty`
- `helpfulness`
- `self_awareness_quality`
- `multi_turn_continuity`

---

## 当前首版资产

当前目录会先包含：

1. 来自 `QA.md` 的第一批 `curated` case
2. 一个 `personal replay` 示例文件
3. 空的 `promoted` / `baselines` / `reports` 目录占位

---

## 下一步实现建议

当实现 runner 时，建议优先扫描：

- `qa/cases/curated/**/*.json`
- `qa/cases/promoted/**/*.json`
- `qa/replays/**/*.json`

并统一加载为 `RegressionScenario[]`。

---

## 当前可用命令

在 [backend/package.json](/Users/xuhailin/development/agents/xiaoqing/backend/package.json) 中已接入首版 runner：

- `npm run qa:gate`
  运行 `releaseGate=true` 的固定回归集
- `npm run qa:replay`
  运行 `sourceType=replay` 的真实回放样本
- `npm run qa:run -- --mode=all`
  运行全部场景

常用附加参数：

- `--scenario=<scenarioId>`
- `--skip-soft-judge`
- `--dev-workspace=snapshot`
- `--no-cleanup`

报告会输出到：

- [qa/reports/latest](/Users/xuhailin/development/agents/xiaoqing/qa/reports/latest)
- [qa/reports/history](/Users/xuhailin/development/agents/xiaoqing/qa/reports/history)
