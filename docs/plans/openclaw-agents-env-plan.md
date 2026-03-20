# OpenClaw 配置收敛计划（修订版）

**状态：已在仓库落地**（legacy 与 `FEATURE_OPENCLAW` 已移除，启用条件为 `OpenClawRegistryService.hasAny()`）。

## 目标

- **保留**环境变量名 **`OPENCLAW_AGENTS`**（不改为 REMOTE_AGENTS）。
- **保留**入站白名单 **`AGENT_BUS_INBOUND_TOKENS`**（与出站配置分离；双向可用同一字符串作共享密钥）。
- **移除** legacy 单实例：`OPENCLAW_PLUGIN_BASE_URL`、`OPENCLAW_TOKEN`、`OPENCLAW_BOT_ID`、`OPENCLAW_SIGN_KEY` 及全局 `OPENCLAW_TIMEOUT_SECONDS`（超时以 JSON 每项 `timeout` 为准，默认 60）。
- **移除** **`FEATURE_OPENCLAW`**：是否走远端路由改为 **`OpenClawRegistryService.hasAny()`**（至少注册一个 agent 即视为可用）；未配置或解析失败则等价关闭。
- **不**把 `OPENCLAW_AGENTS` 与 `AGENT_BUS_INBOUND_TOKENS` 合并；**不**为 BOT_ID 单独引入 `type` 字段——多实例标识统一为数组项的 **`id`**。

## 实现要点（代码）

| 文件 | 变更 |
|------|------|
| [`backend/src/config/feature-flags.ts`](../../backend/src/config/feature-flags.ts) | 删除 `openclaw` 条目 |
| [`backend/src/openclaw/openclaw-registry.service.ts`](../../backend/src/openclaw/openclaw-registry.service.ts) | 删除 legacy 注册块；仅解析 `OPENCLAW_AGENTS` |
| [`backend/src/assistant/conversation/feature-flag.config.ts`](../../backend/src/assistant/conversation/feature-flag.config.ts) | 注入 `OpenClawRegistryService`，`featureOpenClaw = registry.hasAny()` |
| [`backend/src/system-self/system-self.service.ts`](../../backend/src/system-self/system-self.service.ts) | `features.openclaw` / 外部服务 `enabled` 使用 `hasAny()` |
| [`backend/src/openclaw/openclaw.types.ts`](../../backend/src/openclaw/openclaw.types.ts) | 注释去掉 legacy 描述 |
| [`backend/src/openclaw/openclaw.service.spec.ts`](../../backend/src/openclaw/openclaw.service.spec.ts) | 用 `OPENCLAW_AGENTS` JSON 构造 registry |
| [`backend/.env.example`](../../backend/.env.example) | 删除 `FEATURE_OPENCLAW` 与方式一四行 + `OPENCLAW_TIMEOUT_SECONDS`；保留 `OPENCLAW_CONFIDENCE_THRESHOLD` 与 `OPENCLAW_AGENTS` |
| [`backend/scripts/test-openclaw.mjs`](../../backend/scripts/test-openclaw.mjs) | 若有 legacy 依赖则改为读 `OPENCLAW_AGENTS` 或文档说明 |

## 文档

- [`docs/agent-collaboration-protocol.md`](../agent-collaboration-protocol.md) §11.4：已补充远程 / 隧道 / Agent Bus 桥接的 JSON 示例。
- [`docs/requirements/TECH-OPENCLAW-INTEGRATION.md`](../requirements/TECH-OPENCLAW-INTEGRATION.md) §4：同步「仅多 Agent JSON」推荐与示例。

## 行为说明（与 Agent Bus 的关系）

- **出站**：`AgentDelegationExecutorService` 仍调用 **`OpenClawService.delegateTask`**；是否包 `AGENT_DELEGATION_V1` 由该项的 **`capabilities` 含 `agent-bus`**（或 `baseUrl` 以 `/agent-bus` 结尾）决定，与「多 agent」正交。
- **入站**：仍仅依赖 **`AGENT_BUS_INBOUND_TOKENS`**。

## 本地 `.env` 迁移

- 删除 `FEATURE_OPENCLAW` 与 legacy 相关键；将原单实例信息合并为 `OPENCLAW_AGENTS` 数组中一条，**`id` 即原 bot 标识**。
