export declare class ConversationLockService {
    private readonly logger;
    private readonly locks;
    acquire(conversationId: string): Promise<() => void>;
}
