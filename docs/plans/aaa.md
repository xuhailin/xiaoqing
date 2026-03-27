

# 小晴当前缺失层轻量审计 Prompt

请基于当前仓库代码现状，做一次**轻量定向架构审计**。
不要重复审计已经基本稳定的主链路分层，只重点检查：

1. **Persona Projection**
2. **Relationship Projection**
3. **Execution Recovery / Result Normalization**
4. **Context Load Policy**

---

## 审计目标

我不是要你再做一次“大而全架构审计”，而是要你判断：

> 当前系统除了主链路分层之外，还缺哪些“关键桥接层 / 治理层”，会导致系统虽然结构对了，但还不够像人、不够稳定、不够轻。

---

## 已知前提

以下内容已基本成立，请不要作为本次重点问题重复展开：

* Quick Router 已前置
* 主链路已有 Perception / Decision / Execution / Expression / Post-turn 分层
* Expression 已基本成为统一出口
* 已有调试面板 / 调试视图
* 当前系统整体已接近稳定架构

---

## 本次只审这 4 个点

### 1. Persona Projection

检查：

* persona 是否仍主要停留在自然语言定义层
* 是否存在把 persona 稳定投影到 ExpressionParams / 表达控制层的机制
* 如果没有，这是否会导致回复风格漂移、tool/chat 输出人格不一致

---

### 2. Relationship Projection

检查：

* relationship / intimacy / social context 是否只是“被存储或被召回”
* 是否真正影响了本轮表达方式
* 如果关系状态变化，系统输出是否会发生可观察的差异

---

### 3. Execution Recovery / Result Normalization

检查：

* 执行层返回是否有统一状态模型
* success / failed / pending / need_clarification / partial_success 等状态是否被统一处理
* 执行失败或异常时，是否有一致的收尾策略，而不是各处各说各话

---

### 4. Context Load Policy

检查：

* tool path / chat path 是否真的加载不同级别的上下文
* 是否存在“明明是轻路径，仍全量加载社交/关系/长期上下文”的问题
* 当前是否有清晰的 context assembly policy / mode / load strategy

---

## 输出要求

请输出一份简短审计结果，格式如下：

### 1. 总结

* 当前最明显缺失的层：
* 当前最值得补的 2 个点：
* 哪些暂时不用急着补：

### 2. 分项审计

对每一项输出：

* 是否缺失：是 / 部分缺失 / 否
* 证据文件：
* 问题描述：
* 风险等级：高 / 中 / 低
* 建议方向：一句话即可

### 3. 最后结论

请明确回答：

* 现在最应该优先补的是哪一层？
* 它更适合先做“轻量 adapter”，还是直接做“完整结构化层”？

---

## 审计原则

* 不要重新批判整个主链路
* 不要输出大而全报告
* 不要写实现代码
* 重点看“缺没缺桥接层”
* 如果只是部分缺失，请明确写“部分缺失”，不要一刀切
