import type { UserEmotion } from '../cognitive-pipeline/cognitive-pipeline.types';
export type DialogueMode = 'chat' | 'thinking' | 'decision' | 'task';
export type DialogueSeriousness = 'casual' | 'semi' | 'focused';
export type DialogueExpectation = '陪聊' | '一起想' | '直接给结果';
export type DialogueAgency = '朋友' | '并肩思考者' | '顾问' | '执行器';
export type DialogueEscalation = '不推进' | '可记录' | '应转任务';
export type DialogueTaskIntent = 'none' | 'weather_query' | 'book_download' | 'general_tool' | 'timesheet' | 'dev_task';
export type DialogueSuggestedTool = 'weather' | 'book_download' | 'timesheet';
export interface DialogueIntentSlots {
    city?: string;
    district?: string;
    dateLabel?: string;
    location?: string;
    bookName?: string;
    bookChoiceIndex?: number;
    timesheetAction?: 'preview' | 'confirm' | 'submit' | 'query_missing';
    timesheetDate?: string;
    timesheetMonth?: string;
    timesheetRawOverride?: string;
    [key: string]: unknown;
}
export interface IdentityUpdateFromIntent {
    city?: string;
    timezone?: string;
    language?: string;
    conversationMode?: string;
}
export interface WorldStateUpdateFromIntent {
    city?: string;
    timezone?: string;
    language?: string;
    device?: string;
    conversationMode?: string;
}
export interface DialogueIntentState {
    mode: DialogueMode;
    seriousness: DialogueSeriousness;
    expectation: DialogueExpectation;
    agency: DialogueAgency;
    requiresTool: boolean;
    taskIntent: DialogueTaskIntent;
    slots: DialogueIntentSlots;
    escalation: DialogueEscalation;
    confidence: number;
    missingParams: string[];
    suggestedTool?: DialogueSuggestedTool | null;
    identityUpdate?: IdentityUpdateFromIntent;
    worldStateUpdate?: WorldStateUpdateFromIntent;
    detectedEmotion?: UserEmotion;
}
export declare const DEFAULT_INTENT_STATE: DialogueIntentState;
