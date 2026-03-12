export type MessageChannel = 'chat' | 'dev';
export interface RouteDecision {
    channel: MessageChannel;
    content: string;
    reason: string;
}
export interface SendMessageBody {
    content: string;
    mode?: MessageChannel;
}
