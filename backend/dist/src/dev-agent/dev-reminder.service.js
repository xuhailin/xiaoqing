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
var DevReminderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevReminderService = void 0;
const common_1 = require("@nestjs/common");
const cron_1 = require("cron");
const prisma_service_1 = require("../infra/prisma.service");
const dev_runner_service_1 = require("./dev-runner.service");
const dev_session_repository_1 = require("./dev-session.repository");
let DevReminderService = DevReminderService_1 = class DevReminderService {
    prisma;
    sessions;
    runner;
    logger = new common_1.Logger(DevReminderService_1.name);
    pollInProgress = false;
    constructor(prisma, sessions, runner) {
        this.prisma = prisma;
        this.sessions = sessions;
        this.runner = runner;
    }
    async createReminder(input) {
        const message = input.message?.trim();
        if (!message) {
            throw new common_1.BadRequestException('message is required');
        }
        const cronExpr = input.cronExpr?.trim();
        const runAt = this.parseRunAt(input.runAt);
        this.assertScheduleInput(cronExpr, runAt, input.timezone);
        const enabled = input.enabled !== false;
        const session = await this.resolveSession(input.sessionId, input.conversationId);
        const now = new Date();
        const nextRunAt = enabled
            ? this.computeNextRunAt({ cronExpr, runAt, timezone: input.timezone }, now)
            : null;
        if (enabled && !nextRunAt) {
            throw new common_1.BadRequestException('runAt must be in the future');
        }
        return this.prisma.devReminder.create({
            data: {
                sessionId: session.id,
                title: input.title?.trim() || null,
                message,
                cronExpr: cronExpr || null,
                runAt,
                timezone: input.timezone?.trim() || null,
                enabled,
                nextRunAt,
            },
            include: {
                session: {
                    select: { id: true, conversationId: true, status: true },
                },
            },
        });
    }
    async listReminders(sessionId) {
        return this.prisma.devReminder.findMany({
            where: sessionId ? { sessionId } : undefined,
            orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'desc' }],
            include: {
                session: {
                    select: { id: true, conversationId: true, status: true },
                },
            },
        });
    }
    async setReminderEnabled(id, enabled) {
        const reminder = await this.prisma.devReminder.findUnique({ where: { id } });
        if (!reminder) {
            throw new common_1.NotFoundException('reminder not found');
        }
        const nextRunAt = enabled
            ? this.computeNextRunAt({
                cronExpr: reminder.cronExpr ?? undefined,
                runAt: reminder.runAt ?? undefined,
                timezone: reminder.timezone ?? undefined,
            }, new Date())
            : null;
        if (enabled && !nextRunAt) {
            throw new common_1.BadRequestException('reminder has no future schedule');
        }
        return this.prisma.devReminder.update({
            where: { id },
            data: {
                enabled,
                nextRunAt,
                lastError: null,
            },
            include: {
                session: {
                    select: { id: true, conversationId: true, status: true },
                },
            },
        });
    }
    async triggerReminderNow(id) {
        const reminder = await this.prisma.devReminder.findUnique({
            where: { id },
        });
        if (!reminder) {
            throw new common_1.NotFoundException('reminder not found');
        }
        const dispatchResult = await this.dispatchSingleReminder(reminder.id, new Date(), true);
        if (!dispatchResult) {
            throw new common_1.BadRequestException('failed to trigger reminder');
        }
        return {
            reminderId: reminder.id,
            runId: dispatchResult.runId,
            sessionId: dispatchResult.sessionId,
        };
    }
    async deleteReminder(id) {
        const existing = await this.prisma.devReminder.findUnique({ where: { id } });
        if (!existing) {
            throw new common_1.NotFoundException('reminder not found');
        }
        await this.prisma.devReminder.delete({ where: { id } });
        return { ok: true };
    }
    async dispatchDueReminders(limit = 10) {
        if (this.pollInProgress) {
            return { scanned: 0, triggered: 0, skipped: true };
        }
        this.pollInProgress = true;
        try {
            const now = new Date();
            const dueReminders = await this.prisma.devReminder.findMany({
                where: {
                    enabled: true,
                    nextRunAt: { lte: now },
                },
                orderBy: { nextRunAt: 'asc' },
                take: limit,
                select: { id: true },
            });
            let triggered = 0;
            for (const reminder of dueReminders) {
                const result = await this.dispatchSingleReminder(reminder.id, now);
                if (result) {
                    triggered += 1;
                }
            }
            return {
                scanned: dueReminders.length,
                triggered,
                skipped: false,
            };
        }
        finally {
            this.pollInProgress = false;
        }
    }
    async dispatchSingleReminder(reminderId, now, forced = false) {
        const txResult = await this.prisma.$transaction(async (tx) => {
            const reminder = await tx.devReminder.findUnique({
                where: { id: reminderId },
            });
            if (!reminder) {
                return null;
            }
            if (!forced) {
                if (!reminder.enabled)
                    return null;
                if (!reminder.nextRunAt || reminder.nextRunAt.getTime() > now.getTime())
                    return null;
            }
            const scheduleNext = this.computeNextAfterTrigger(reminder, now);
            const run = await tx.devRun.create({
                data: {
                    sessionId: reminder.sessionId,
                    userInput: reminder.message,
                    status: 'queued',
                    result: this.buildReminderQueuedResult(reminder.id, reminder.message, forced),
                },
                select: { id: true, sessionId: true },
            });
            await tx.devReminder.update({
                where: { id: reminder.id },
                data: {
                    enabled: scheduleNext.enabled,
                    nextRunAt: scheduleNext.nextRunAt,
                    lastTriggeredAt: now,
                    lastRunId: run.id,
                    lastError: null,
                },
            });
            return run;
        });
        if (!txResult) {
            return null;
        }
        this.runner.startRun(txResult.id, txResult.sessionId);
        this.logger.log(`Reminder triggered: reminder=${reminderId} run=${txResult.id} session=${txResult.sessionId}`);
        return { runId: txResult.id, sessionId: txResult.sessionId };
    }
    parseRunAt(value) {
        if (!value)
            return undefined;
        const runAt = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(runAt.getTime())) {
            throw new common_1.BadRequestException('runAt must be a valid date');
        }
        return runAt;
    }
    assertScheduleInput(cronExpr, runAt, timezone) {
        if (!cronExpr && !runAt) {
            throw new common_1.BadRequestException('cronExpr or runAt is required');
        }
        if (cronExpr && runAt) {
            throw new common_1.BadRequestException('cronExpr and runAt cannot be used together');
        }
        if (cronExpr) {
            const validateResult = (0, cron_1.validateCronExpression)(cronExpr);
            if (!validateResult.valid) {
                throw new common_1.BadRequestException(`invalid cronExpr: ${validateResult.error}`);
            }
            try {
                new cron_1.CronJob(cronExpr, () => undefined, null, false, timezone);
            }
            catch (err) {
                throw new common_1.BadRequestException(`invalid cron/timezone: ${String(err)}`);
            }
        }
    }
    computeNextAfterTrigger(reminder, now) {
        if (reminder.cronExpr) {
            const nextRunAt = this.computeNextRunAt({
                cronExpr: reminder.cronExpr,
                timezone: reminder.timezone ?? undefined,
            }, now);
            return {
                enabled: Boolean(nextRunAt),
                nextRunAt,
            };
        }
        return { enabled: false, nextRunAt: null };
    }
    computeNextRunAt(schedule, now) {
        if (schedule.runAt) {
            return schedule.runAt.getTime() > now.getTime() ? schedule.runAt : null;
        }
        if (!schedule.cronExpr)
            return null;
        const job = new cron_1.CronJob(schedule.cronExpr, () => undefined, null, false, schedule.timezone);
        const next = job.nextDate();
        return typeof next.toJSDate === 'function'
            ? next.toJSDate()
            : new Date(String(next));
    }
    async resolveSession(sessionId, conversationId) {
        if (sessionId) {
            const existing = await this.sessions.getSession(sessionId);
            if (!existing) {
                throw new common_1.NotFoundException('session not found');
            }
            return existing;
        }
        if (!conversationId) {
            throw new common_1.BadRequestException('sessionId or conversationId is required');
        }
        return this.sessions.getOrCreateSession(conversationId);
    }
    buildReminderQueuedResult(reminderId, message, forced) {
        return {
            phase: 'queued',
            source: 'reminder',
            reminderId,
            currentStepId: null,
            planRounds: 0,
            completedSteps: 0,
            totalSteps: 0,
            stepLogs: [],
            events: [
                {
                    type: forced ? 'manual_trigger' : 'scheduled_trigger',
                    message: `提醒任务已入队：${message}`,
                    at: new Date().toISOString(),
                },
            ],
        };
    }
};
exports.DevReminderService = DevReminderService;
exports.DevReminderService = DevReminderService = DevReminderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        dev_session_repository_1.DevSessionRepository,
        dev_runner_service_1.DevRunRunnerService])
], DevReminderService);
//# sourceMappingURL=dev-reminder.service.js.map