import { Injectable, Logger } from '@nestjs/common';
import { CapabilityRegistry } from '../capability-registry.service';
import { OpenClawService } from '../../openclaw/openclaw.service';
import type { ToolExecutionResult, ToolRequest } from './tool-executor.types';

/**
 * executor 名称 → capability 名称映射。
 * 保持向后兼容：ConversationService 仍然使用 'local-weather' 等 executor 名称构造 ToolRequest。
 */
const EXECUTOR_TO_CAPABILITY: Record<string, string> = {
  'local-weather': 'weather',
  'local-book-download': 'book-download',
  'local-general-action': 'general-action',
  'local-timesheet': 'timesheet',
  'local-reminder': 'reminder',
};

/**
 * ToolExecutorRegistry — 向后兼容的执行分发层。
 *
 * 已改为委托 CapabilityRegistry：通过 executor 名称映射到 capability name，
 * 调用统一的 ICapability.execute()。不再直接注入各 skill service。
 *
 * 后续 ConversationService 完全迁移到 CapabilityRegistry 后，本类可移除。
 */
@Injectable()
export class ToolExecutorRegistry {
  private readonly logger = new Logger(ToolExecutorRegistry.name);

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly openClaw: OpenClawService,
  ) {}

  isExecutorAvailable(executor: ToolRequest['executor']): boolean {
    const capName = EXECUTOR_TO_CAPABILITY[executor];
    if (capName) {
      const cap = this.capabilityRegistry.get(capName);
      return cap ? cap.isAvailable() : false;
    }
    return true; // openclaw 等默认可用
  }

  async execute(request: ToolRequest): Promise<ToolExecutionResult> {
    const capName = EXECUTOR_TO_CAPABILITY[request.executor];

    if (capName) {
      const cap = this.capabilityRegistry.get(capName);
      if (!cap) {
        return this.fail(request, `capability "${capName}" not registered`);
      }
      const result = await cap.execute({
        conversationId: request.conversationId,
        turnId: request.turnId,
        userInput: request.userInput,
        params: request.params,
        intentState: request.intentState,
      });
      return this.fromCapabilityResult(request, result);
    }

    // fallback: openclaw
    const taskMessage = typeof request.params.taskMessage === 'string'
      ? request.params.taskMessage
      : '';
    if (!taskMessage) {
      return this.fail(request, 'openclaw taskMessage missing');
    }
    const result = await this.openClaw.delegateTask({
      message: taskMessage,
      sessionKey: request.conversationId,
    });
    return {
      conversationId: request.conversationId,
      turnId: request.turnId,
      executor: request.executor,
      capability: request.capability,
      success: result.success,
      content: result.content || null,
      error: result.error ?? null,
    };
  }

  private fail(request: ToolRequest, error: string): ToolExecutionResult {
    return {
      conversationId: request.conversationId,
      turnId: request.turnId,
      executor: request.executor,
      capability: request.capability,
      success: false,
      content: null,
      error,
    };
  }

  private fromCapabilityResult(
    request: ToolRequest,
    result: { success: boolean; content: string | null; error: string | null; meta?: Record<string, unknown> },
  ): ToolExecutionResult {
    return {
      conversationId: request.conversationId,
      turnId: request.turnId,
      executor: request.executor,
      capability: request.capability,
      success: result.success,
      content: result.content,
      error: result.error,
      ...(result.meta ? { meta: result.meta } : {}),
    };
  }
}
