import { PrismaService } from '../../infra/prisma.service';
import { type DailyMomentEngagementSignal, type DailyMomentFeedback, type DailyMomentRecord, type DailyMomentRepository, type DailyMomentSuggestion } from './daily-moment.types';
export declare class DailyMomentPrismaRepository implements DailyMomentRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private normalizeMoodTag;
    saveRecord(record: DailyMomentRecord): Promise<void>;
    listRecordsByConversation(conversationId: string): Promise<DailyMomentRecord[]>;
    saveSuggestion(suggestion: DailyMomentSuggestion): Promise<void>;
    listSuggestionsByConversation(conversationId: string): Promise<DailyMomentSuggestion[]>;
    markSuggestionAccepted(suggestionId: string): Promise<void>;
    saveFeedback(recordId: string, feedback: DailyMomentFeedback): Promise<void>;
    saveSignal(signal: DailyMomentEngagementSignal): Promise<void>;
    listSignalsByConversation(conversationId: string): Promise<DailyMomentEngagementSignal[]>;
}
