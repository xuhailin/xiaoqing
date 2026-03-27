import { Injectable } from '@nestjs/common';
import { ConversationService } from '../assistant/conversation/conversation.service';
import type { IAgent, AgentRequest, AgentResult } from './agent.interface';
import type { MessageChannel } from '../gateway/message-router.types';

// ──────────────────────────────────────────────
// AssistantAgentAdapter
// 将 ConversationService.sendMessage 适配为 IAgent 接口。
// 纯薄包装，不改 ConversationService 任何逻辑。
// ──────────────────────────────────────────────

@Injectable()
export class AssistantAgentAdapter implements IAgent {
  readonly channel: MessageChannel = 'chat';

  constructor(private readonly conversation: ConversationService) {}

  async handle(req: AgentRequest): Promise<AgentResult> {
    const result = await this.conversation.sendMessage(
      req.conversationId,
      req.content,
      req.userId,
    );

    return {
      channel: 'chat',
      reply: result.assistantMessage.content,
      payload: result,
      trace: result.trace,
    };
  }
}
