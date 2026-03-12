import { type DailyMomentChatMessage, type DailyMomentSnippet } from './daily-moment.types';
export declare class DailyMomentSnippetExtractor {
    private readonly minMessages;
    private readonly maxMessages;
    extractCandidates(conversationId: string, recentMessages: DailyMomentChatMessage[], maxCandidates?: number): DailyMomentSnippet[];
    pickPrimarySnippet(conversationId: string, recentMessages: DailyMomentChatMessage[]): DailyMomentSnippet;
    private buildSnippet;
    private buildSummaryHint;
    private scoreSnippet;
    private scoreAlternation;
}
