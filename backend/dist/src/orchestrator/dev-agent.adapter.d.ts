import { DevAgentService } from '../dev-agent/dev-agent.service';
import type { IAgent, AgentRequest, AgentResult } from './agent.interface';
import type { MessageChannel } from '../gateway/message-router.types';
export declare class DevAgentAdapter implements IAgent {
    private readonly devAgent;
    readonly channel: MessageChannel;
    constructor(devAgent: DevAgentService);
    handle(req: AgentRequest): Promise<AgentResult>;
}
