import { DispatcherService } from '../orchestrator/dispatcher.service';
import type { SendMessageBody } from './message-router.types';
export declare class GatewayController {
    private readonly dispatcher;
    constructor(dispatcher: DispatcherService);
    sendMessage(id: string, body: SendMessageBody): Promise<unknown>;
}
