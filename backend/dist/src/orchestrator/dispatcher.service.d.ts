import { MessageRouterService } from '../gateway/message-router.service';
import { ConversationLockService } from './conversation-lock.service';
import type { IAgent, AgentResult } from './agent.interface';
import type { MessageChannel } from '../gateway/message-router.types';
export declare class DispatcherService {
    private readonly router;
    private readonly lock;
    private readonly logger;
    private readonly agentMap;
    constructor(router: MessageRouterService, lock: ConversationLockService, agents: IAgent[]);
    dispatch(conversationId: string, content: string, mode?: MessageChannel): Promise<AgentResult>;
}
