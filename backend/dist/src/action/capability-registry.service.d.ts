import type { MessageChannel } from '../gateway/message-router.types';
import type { ICapability } from './capability.interface';
import type { CapabilityMeta } from './capability.types';
export declare class CapabilityRegistry {
    private readonly logger;
    private readonly capabilities;
    register(capability: ICapability): void;
    get(name: string): ICapability | undefined;
    findByTaskIntent(taskIntent: string, channel: MessageChannel): ICapability | undefined;
    listAvailable(channel: MessageChannel): ICapability[];
    listAll(): CapabilityMeta[];
    buildCapabilityPrompt(channel: MessageChannel): string;
}
