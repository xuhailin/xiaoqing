import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Claude Code Agent SDK 通信层。
 *
 * 通过 @anthropic-ai/claude-agent-sdk 的 query() 启动 Claude Code Agent，
 * 以 AsyncGenerator 方式消费 JSONL 事件流，返回最终结果。
 *
 * SDK 类型在运行时按需 import（ESM 包），避免编译期 CJS/ESM 冲突。
 */

export interface ClaudeCodeStreamOptions {
  /** 工作目录（workspace isolation） */
  cwd?: string;
  /** 最大 agent 轮次 */
  maxTurns?: number;
  /** 最大花费（USD） */
  maxBudgetUsd?: number;
  /** 使用的模型 */
  model?: string;
  /** 自动授权的工具列表 */
  allowedTools?: string[];
  /** AbortController 用于外部取消 */
  abortController?: AbortController;
  /** 传入前次 session ID 以恢复对话上下文 */
  resumeSessionId?: string;
}

export interface ClaudeCodeStreamResult {
  success: boolean;
  /** 最终文本结果 */
  content: string | null;
  error: string | null;
  /** 总耗时 ms */
  durationMs: number;
  /** 总花费 USD */
  costUsd: number;
  /** 总 turn 数 */
  numTurns: number;
  /** session id，可用于后续 resume */
  sessionId: string | null;
  /** 停止原因 */
  stopReason: string | null;
}

/** 进度回调 */
export type ClaudeCodeProgressCallback = (event: {
  type: string;
  text?: string;
  toolName?: string;
}) => void;

@Injectable()
export class ClaudeCodeStreamService {
  private readonly logger = new Logger(ClaudeCodeStreamService.name);

  private readonly defaultModel: string;
  private readonly defaultMaxTurns: number;
  private readonly defaultMaxBudgetUsd: number;

  constructor(config: ConfigService) {
    this.defaultModel = config.get('CLAUDE_CODE_MODEL') || 'claude-sonnet-4-6';
    this.defaultMaxTurns = parseInt(config.get('CLAUDE_CODE_MAX_TURNS') || '50', 10);
    this.defaultMaxBudgetUsd = parseFloat(config.get('CLAUDE_CODE_MAX_BUDGET_USD') || '5.0');
  }

  /**
   * 执行一次 Claude Code Agent 任务。
   *
   * @param prompt 任务目标描述
   * @param options 执行选项
   * @param onProgress 可选的进度回调
   */
  async execute(
    prompt: string,
    options: ClaudeCodeStreamOptions = {},
    onProgress?: ClaudeCodeProgressCallback,
  ): Promise<ClaudeCodeStreamResult> {
    // 动态 import ESM 包
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const abortController = options.abortController ?? new AbortController();

    const sdkOptions: Record<string, unknown> = {
      abortController,
      cwd: options.cwd || process.cwd(),
      model: options.model || this.defaultModel,
      maxTurns: options.maxTurns || this.defaultMaxTurns,
      maxBudgetUsd: options.maxBudgetUsd || this.defaultMaxBudgetUsd,
      allowedTools: options.allowedTools || [
        'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
      ],
      persistSession: true,
      env: this.buildChildEnv(),
    };

    // resume: 传入前次 session ID 恢复对话
    if (options.resumeSessionId) {
      sdkOptions.resume = options.resumeSessionId;
    }

    this.logger.log(
      `Starting Claude Code Agent: model=${sdkOptions.model} maxTurns=${sdkOptions.maxTurns} cwd=${sdkOptions.cwd}` +
      (options.resumeSessionId ? ` resume=${options.resumeSessionId}` : ''),
    );

    try {
      const stream = query({ prompt, options: sdkOptions });

      for await (const message of stream) {
        // 进度回调
        if (onProgress) {
          this.emitProgress(message, onProgress);
        }

        // 捕获最终结果
        if (message.type === 'result') {
          const isSuccess = message.subtype === 'success';

          return {
            success: isSuccess,
            content: isSuccess && 'result' in message ? (message as any).result : null,
            error: !isSuccess && 'errors' in message
              ? (message as any).errors?.join('\n') ?? 'Unknown error'
              : null,
            durationMs: message.duration_ms ?? 0,
            costUsd: message.total_cost_usd ?? 0,
            numTurns: message.num_turns ?? 0,
            sessionId: message.session_id ?? null,
            stopReason: message.stop_reason ?? null,
          };
        }
      }

      // stream 结束但没有 result 消息（不应发生）
      return {
        success: false,
        content: null,
        error: 'Stream ended without result message',
        durationMs: 0,
        costUsd: 0,
        numTurns: 0,
        sessionId: null,
        stopReason: null,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.logger.warn('Claude Code Agent execution was cancelled');
        return {
          success: false,
          content: null,
          error: 'Execution cancelled',
          durationMs: 0,
          costUsd: 0,
          numTurns: 0,
          sessionId: null,
          stopReason: 'cancelled',
        };
      }

      this.logger.error(`Claude Code Agent execution failed: ${err.message}`, err.stack);
      return {
        success: false,
        content: null,
        error: err.message || 'Unknown execution error',
        durationMs: 0,
        costUsd: 0,
        numTurns: 0,
        sessionId: null,
        stopReason: 'error',
      };
    }
  }

  /**
   * 构建 Claude Code 子进程的环境变量。
   *
   * 策略：继承宿主 env，排除已知干扰 SDK 子进程的变量。
   * - CLAUDECODE: SDK 嵌套检测；后端进程不是真正嵌套场景
   * - NODE_OPTIONS: 防止宿主 inspect/debug 标志传入子进程
   */
  private buildChildEnv(): Record<string, string | undefined> {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.NODE_OPTIONS;
    return env;
  }

  /** 从 SDK message 提取进度信息 */
  private emitProgress(message: any, onProgress: ClaudeCodeProgressCallback): void {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          onProgress({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          onProgress({ type: 'tool_use', toolName: block.name });
        }
      }
    }
  }
}
