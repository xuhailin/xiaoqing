"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyMomentPrismaRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
let DailyMomentPrismaRepository = class DailyMomentPrismaRepository {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    normalizeMoodTag(raw) {
        if (!raw)
            return undefined;
        const allowed = ['轻松', '被逗了一下', '温柔', '小反转', '被接住', '安静的小幸福'];
        return allowed.includes(raw) ? raw : undefined;
    }
    async saveRecord(record) {
        await this.prisma.dailyMoment.create({
            data: {
                id: record.id,
                conversationId: record.conversationId,
                triggerMode: record.triggerMode,
                title: record.title,
                body: record.body,
                closingNote: record.closingNote,
                moodTag: record.moodTag ?? null,
                sourceSnippetIds: record.sourceSnippetIds ?? [],
                sourceMessageIds: record.sourceMessageIds,
                feedback: record.feedback ?? null,
                createdAt: record.createdAt,
            },
        });
    }
    async listRecordsByConversation(conversationId) {
        const rows = await this.prisma.dailyMoment.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        return rows.map((row) => ({
            id: row.id,
            conversationId: row.conversationId,
            triggerMode: row.triggerMode,
            title: row.title,
            body: row.body,
            closingNote: row.closingNote,
            moodTag: this.normalizeMoodTag(row.moodTag),
            sourceSnippetIds: row.sourceSnippetIds,
            sourceMessageIds: row.sourceMessageIds,
            createdAt: row.createdAt,
            feedback: row.feedback ?? undefined,
        }));
    }
    async saveSuggestion(suggestion) {
        await this.prisma.dailyMomentSuggestion.create({
            data: {
                id: suggestion.id,
                conversationId: suggestion.conversationId,
                hint: suggestion.hint,
                score: suggestion.score,
                moodTag: suggestion.moodTag ?? null,
                sourceMessageIds: suggestion.sourceMessageIds,
                accepted: suggestion.accepted,
                createdAt: suggestion.createdAt,
            },
        });
    }
    async listSuggestionsByConversation(conversationId) {
        const rows = await this.prisma.dailyMomentSuggestion.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        return rows.map((row) => ({
            id: row.id,
            conversationId: row.conversationId,
            hint: row.hint,
            createdAt: row.createdAt,
            score: row.score,
            moodTag: this.normalizeMoodTag(row.moodTag),
            sourceMessageIds: row.sourceMessageIds,
            accepted: row.accepted,
        }));
    }
    async markSuggestionAccepted(suggestionId) {
        await this.prisma.dailyMomentSuggestion.updateMany({
            where: { id: suggestionId },
            data: {
                accepted: true,
                acceptedAt: new Date(),
            },
        });
    }
    async saveFeedback(recordId, feedback) {
        await this.prisma.dailyMoment.updateMany({
            where: { id: recordId },
            data: {
                feedback,
            },
        });
    }
    async saveSignal(signal) {
        await this.prisma.dailyMomentSignal.create({
            data: {
                id: signal.id,
                conversationId: signal.conversationId,
                type: signal.type,
                sourceText: signal.sourceText ?? null,
                createdAt: signal.createdAt,
            },
        });
    }
    async listSignalsByConversation(conversationId) {
        const rows = await this.prisma.dailyMomentSignal.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        return rows.map((row) => ({
            id: row.id,
            conversationId: row.conversationId,
            type: row.type,
            createdAt: row.createdAt,
            sourceText: row.sourceText ?? undefined,
        }));
    }
};
exports.DailyMomentPrismaRepository = DailyMomentPrismaRepository;
exports.DailyMomentPrismaRepository = DailyMomentPrismaRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DailyMomentPrismaRepository);
//# sourceMappingURL=daily-moment-prisma.repository.js.map