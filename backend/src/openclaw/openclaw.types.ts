export interface OpenClawTaskRequest {
  /** 发给 OpenClaw 的任务描述 */
  message: string;
  /** 会话隔离键 */
  sessionKey?: string;
  /** 超时秒数 */
  timeoutSeconds?: number;
}

export interface OpenClawTaskResult {
  success: boolean;
  /** OpenClaw 返回的原始结果 */
  content: string;
  error?: string;
}

export interface OpenClawToolInvokeRequest {
  tool: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
}
