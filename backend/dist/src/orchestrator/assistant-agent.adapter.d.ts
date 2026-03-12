import { ConversationService } from '../assistant/conversation/conversation.service';
import type { IAgent, AgentRequest, AgentResult } from './agent.interface';
import type { MessageChannel } from '../gateway/message-router.types';
export declare class AssistantAgentAdapter implements IAgent {
    private readonly conversation;
    readonly channel: MessageChannel;
    constructor(conversation: ConversationService);
    handle(req: AgentRequest): Promise<AgentResult>;
}
