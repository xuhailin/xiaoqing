/**
 * OpenClaw Agent 配置 — 描述一个远端 OpenClaw 实例。
 * 通过环境变量 OPENCLAW_AGENTS（JSON 数组）注册；每项的 id 为实例唯一标识。
 */
export interface OpenClawAgentConfig {
  /** 唯一标识，如 'intel-cat'、'code-reviewer' */
  id: string;
  /** 显示名称，如 '情报喵' */
  name: string;
  /** API 基地址 */
  baseUrl: string;
  /** Bearer Token */
  token: string;
  /** 可选 HMAC-SHA256 签名密钥（公网部署时建议配置） */
  signKey?: string;
  /** 该 Agent 具备的能力标签，用于路由选择 */
  capabilities: string[];
  /** 请求超时秒数，默认 60 */
  timeout?: number;
  /** API 风格：'json'（默认，直连 JSON）或 'chat'（OpenAI 兼容） */
  apiStyle?: 'json' | 'chat';
  /** 请求路径，默认 '/task'；chat 风格默认 '/chat/completions' */
  taskPath?: string;
}

export interface OpenClawTaskRequest {
  /** 发给 OpenClaw 的任务描述 */
  message: string;
  /** 会话隔离键 */
  sessionKey?: string;
  /** 超时秒数 */
  timeoutSeconds?: number;
  /** 指定 Agent ID（不指定则使用默认 Agent） */
  agentId?: string;
}

export interface OpenClawTaskResult {
  success: boolean;
  /** OpenClaw 返回的原始结果 */
  content: string;
  error?: string;
  /** 实际执行的 Agent ID */
  agentId?: string;
}

export interface OpenClawToolInvokeRequest {
  tool: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
  /** 指定 Agent ID */
  agentId?: string;
}
