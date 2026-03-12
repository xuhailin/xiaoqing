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
exports.DevSessionRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../infra/prisma.service");
let DevSessionRepository = class DevSessionRepository {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOrCreateSession(conversationId) {
        if (conversationId) {
            const existing = await this.prisma.devSession.findFirst({
                where: { conversationId, status: 'active' },
                orderBy: { createdAt: 'desc' },
            });
            if (existing)
                return existing;
        }
        return this.prisma.devSession.create({
            data: { conversationId, status: 'active' },
        });
    }
    async createRun(sessionId, userInput, initialResult) {
        return this.prisma.devRun.create({
            data: {
                sessionId,
                userInput,
                status: 'queued',
                result: initialResult ??
                    {
                        phase: 'queued',
                        currentStepId: null,
                        planRounds: 0,
                        completedSteps: 0,
                        totalSteps: 0,
                        stepLogs: [],
                        events: [
                            {
                                type: 'queued',
                                message: '任务已入队，等待执行',
                                at: new Date().toISOString(),
                            },
                        ],
                    },
            },
        });
    }
    async claimRunForExecution(runId) {
        const startedAt = new Date();
        const claimed = await this.prisma.devRun.updateMany({
            where: {
                id: runId,
                status: { in: ['queued', 'pending'] },
            },
            data: {
                status: 'running',
                startedAt,
                finishedAt: null,
                error: null,
            },
        });
        if (claimed.count === 0) {
            return null;
        }
        return this.prisma.devRun.findUnique({
            where: { id: runId },
            include: { session: true },
        });
    }
    async listRunsByStatuses(statuses) {
        if (statuses.length === 0) {
            return [];
        }
        return this.prisma.devRun.findMany({
            where: { status: { in: statuses } },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                sessionId: true,
                status: true,
                createdAt: true,
                startedAt: true,
            },
        });
    }
    async getRunWithSession(runId) {
        return this.prisma.devRun.findUnique({
            where: { id: runId },
            include: { session: true },
        });
    }
    async getSession(sessionId) {
        return this.prisma.devSession.findUnique({
            where: { id: sessionId },
        });
    }
    async markRunFailedForRecovery(runId, message) {
        return this.prisma.devRun.updateMany({
            where: {
                id: runId,
                status: 'running',
            },
            data: {
                status: 'failed',
                error: message,
                finishedAt: new Date(),
            },
        });
    }
    async requeueRunningRun(runId, message) {
        return this.prisma.devRun.updateMany({
            where: {
                id: runId,
                status: 'running',
            },
            data: {
                status: 'queued',
                error: message,
                startedAt: null,
                finishedAt: null,
            },
        });
    }
    async cancelRun(runId, reason) {
        const existing = await this.prisma.devRun.findUnique({
            where: { id: runId },
        });
        if (!existing)
            return null;
        if (['success', 'failed', 'canceled'].includes(existing.status)) {
            return existing;
        }
        const canceledAt = new Date().toISOString();
        const nextResult = existing.result &&
            typeof existing.result === 'object' &&
            !Array.isArray(existing.result)
            ? {
                ...existing.result,
                phase: 'canceled',
                cancelReason: reason,
                canceledAt,
                updatedAt: canceledAt,
            }
            : {
                phase: 'canceled',
                cancelReason: reason,
                canceledAt,
                updatedAt: canceledAt,
            };
        return this.prisma.devRun.update({
            where: { id: runId },
            data: {
                status: 'canceled',
                error: reason,
                finishedAt: new Date(),
                result: nextResult,
            },
        });
    }
    async updateRunStatus(runId, update) {
        return this.prisma.devRun.update({
            where: { id: runId },
            data: update,
        });
    }
    async listSessions() {
        return this.prisma.devSession.findMany({
            orderBy: { createdAt: 'desc' },
            include: { runs: { orderBy: { createdAt: 'desc' }, take: 5 } },
        });
    }
    async getSessionWithRuns(sessionId) {
        return this.prisma.devSession.findUnique({
            where: { id: sessionId },
            include: { runs: { orderBy: { createdAt: 'asc' } } },
        });
    }
    async getRun(runId) {
        return this.prisma.devRun.findUnique({ where: { id: runId } });
    }
};
exports.DevSessionRepository = DevSessionRepository;
exports.DevSessionRepository = DevSessionRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DevSessionRepository);
//# sourceMappingURL=dev-session.repository.js.map