import { Injectable, Logger } from '@nestjs/common';
import type { IDevExecutor, DevExecutorInput, DevExecutorOutput } from './executor.interface';
import type { ICapability } from '../../action/capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../action/capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';
import { OpenClawService } from '../../openclaw/openclaw.service';
import type { DevExecutorCost, DevStepStrategy } from '../dev-agent.types';

/**
 * OpenClaw 执行器 — 将任务委派给远端 Agent 执行。
 *
 * 支持多 Agent：通过 params.agentId 指定目标 Agent，
 * 不指定时使用 OpenClawRegistryService 中的默认 Agent。
 *
 * 同时实现 IDevExecutor（DevAgent 向后兼容）和 ICapability（统一能力接口）。
 */
@Injectable()
export class OpenClawExecutor implements IDevExecutor, ICapability {
  readonly name = 'openclaw';
  readonly supportedStrategies: DevStepStrategy[] = ['inspect', 'edit', 'verify', 'autonomous_coding'];
  readonly costLevel: DevExecutorCost = 'medium';
  readonly taskIntent = 'openclaw_delegate';
  readonly channels: MessageChannel[] = ['dev', 'chat'];
  readonly description = '远端 AI Agent 执行（复杂推理、代码生成等）';
  readonly surface = 'dev' as const;
  readonly scope = 'private' as const;
  readonly portability = 'config-bound' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = false;
  readonly visibility = 'default' as const;

  private readonly logger = new Logger(OpenClawExecutor.name);

  constructor(private readonly openclaw: OpenClawService) {}

  isAvailable(): boolean {
    return this.openclaw.isAvailable();
  }

  // ── ICapability.execute ────────────────────────────────
  async execute(request: CapabilityRequest): Promise<CapabilityResult>;
  async execute(input: DevExecutorInput): Promise<DevExecutorOutput>;
  async execute(input: CapabilityRequest | DevExecutorInput): Promise<CapabilityResult | DevExecutorOutput> {
    const isCapabilityRequest = 'params' in input && 'conversationId' in input;

    const message = isCapabilityRequest
      ? (typeof input.params.taskMessage === 'string' ? input.params.taskMessage : input.userInput)
      : (input as DevExecutorInput).userInput;

    const sessionKey = isCapabilityRequest
      ? input.conversationId
      : (input as DevExecutorInput).sessionId;

    const agentId = isCapabilityRequest
      ? (typeof input.params.agentId === 'string' ? input.params.agentId : undefined)
      : undefined;

    const runId = 'runId' in input ? (input as DevExecutorInput).runId : undefined;
    this.logger.log(`[openclaw] ${runId ? `runId=${runId} ` : ''}${agentId ? `agent=${agentId} ` : ''}delegating task`);

    const result = await this.openclaw.delegateTask({
      message,
      sessionKey,
      agentId,
    });

    return {
      success: result.success,
      content: result.content || null,
      error: result.error ?? null,
      errorType: result.success ? null : 'NON_ZERO_EXIT',
      exitCode: result.success ? 0 : 1,
      command: 'openclaw.delegateTask',
      args: [],
      cwd: null,
      stdout: result.content || null,
      stderr: result.error ?? null,
      durationMs: null,
      failureReason: result.success ? null : (result.error ?? 'OpenClaw 执行失败'),
      retryHint: result.success ? null : '可尝试缩小任务范围后重试。',
    };
  }
}
