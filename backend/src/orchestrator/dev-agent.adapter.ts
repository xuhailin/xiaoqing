import { Injectable } from '@nestjs/common';
import { DevAgentService } from '../dev-agent/dev-agent.service';
import type { IAgent, AgentRequest, AgentResult } from './agent.interface';
import type { MessageChannel } from '../gateway/message-router.types';

// ──────────────────────────────────────────────
// DevAgentAdapter
// 将 DevAgentService.handleTask 适配为 IAgent 接口。
// 纯薄包装，不改 DevAgentService 任何逻辑。
// ──────────────────────────────────────────────

@Injectable()
export class DevAgentAdapter implements IAgent {
  readonly channel: MessageChannel = 'dev';

  constructor(private readonly devAgent: DevAgentService) {}

  async handle(req: AgentRequest): Promise<AgentResult> {
    const result = req.metadata?.resumeWorkItemId
      ? await this.devAgent.resumeWorkItem(
        req.conversationId,
        req.metadata.resumeWorkItemId,
        req.content,
      )
      : await this.devAgent.handleTask(
        req.conversationId,
        req.content,
        req.metadata,
        req.metadata?.devRunMode === 'agent' ? { mode: 'agent' } : undefined,
      );

    return {
      channel: 'dev',
      reply: result.reply,
      payload: result,
    };
  }
}
