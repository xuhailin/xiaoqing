export interface WorldState {
    city?: string;
    timezone?: string;
    language?: string;
    device?: string;
    conversationMode?: 'chat' | 'thinking' | 'decision' | 'task';
}
export interface WorldStateUpdate {
    city?: string;
    timezone?: string;
    language?: string;
    device?: string;
    conversationMode?: string;
}
export type WorldStateRecord = WorldState | null;
