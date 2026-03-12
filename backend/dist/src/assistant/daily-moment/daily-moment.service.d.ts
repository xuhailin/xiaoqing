import { DailyMomentTriggerEvaluator } from './daily-moment-trigger.evaluator';
import { DailyMomentSnippetExtractor } from './daily-moment-snippet.extractor';
import { DailyMomentGenerator } from './daily-moment-generator';
import { DailyMomentPolicy } from './daily-moment-policy';
import { DailyMomentPrismaRepository } from './daily-moment-prisma.repository';
import { type DailyMomentChatMessage, type DailyMomentFeedback, type DailyMomentRecord, type DailyMomentSuggestionCheckResult, type DailyMomentTriggerContext, type DailyMomentTriggerMode } from './daily-moment.types';
export interface DailyMomentUserTriggerIntent {
    shouldGenerate: boolean;
    mode?: DailyMomentTriggerMode;
    acceptedSuggestionId?: string;
}
export declare class DailyMomentService {
    private readonly evaluator;
    private readonly extractor;
    private readonly generator;
    private readonly policy;
    private readonly repo;
    constructor(evaluator: DailyMomentTriggerEvaluator, extractor: DailyMomentSnippetExtractor, generator: DailyMomentGenerator, policy: DailyMomentPolicy, repo: DailyMomentPrismaRepository);
    detectUserTriggerIntent(conversationId: string, userInput: string, now: Date): Promise<DailyMomentUserTriggerIntent>;
    ingestUserSignal(conversationId: string, userInput: string, now: Date): Promise<void>;
    generateMomentEntry(input: {
        conversationId: string;
        recentMessages: DailyMomentChatMessage[];
        now: Date;
        triggerMode: DailyMomentTriggerMode;
        acceptedSuggestionId?: string;
    }): Promise<{
        record: DailyMomentRecord;
        renderedText: string;
    }>;
    maybeSuggest(input: {
        conversationId: string;
        recentMessages: DailyMomentChatMessage[];
        now: Date;
        triggerContext: Omit<DailyMomentTriggerContext, 'now' | 'hasRecentTriggerInSession' | 'policyBlocked'>;
    }): Promise<DailyMomentSuggestionCheckResult>;
    saveFeedback(conversationId: string, recordId: string, feedback: DailyMomentFeedback): Promise<void>;
    listRecords(conversationId: string): Promise<DailyMomentRecord[]>;
    renderForChat(record: DailyMomentRecord): string;
    private isManualDiaryCommand;
    private isAcceptSuggestionCommand;
    private isRepeatManualDiaryCommand;
    private isPositiveFeedbackCommand;
    private isNegativeFeedbackCommand;
    private isBookmarkOrViewCommand;
    private getLatestPendingSuggestion;
    private countUserShortReplyStreak;
    private hasSameMoodSuggestionToday;
    private getFeedbackSummary;
    private isSeriousTopic;
    private pickHint;
    private dayKey;
    private newId;
}
