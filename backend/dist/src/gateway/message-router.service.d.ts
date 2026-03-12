import { LlmService } from '../infra/llm/llm.service';
import type { MessageChannel, RouteDecision } from './message-router.types';
export declare class MessageRouterService {
    private readonly llm;
    private readonly logger;
    constructor(llm: LlmService);
    route(content: string, mode?: MessageChannel): Promise<RouteDecision>;
    private classifyIntent;
}
