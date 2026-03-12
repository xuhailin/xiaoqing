import { PrismaService } from '../infra/prisma.service';
import { DevRunRunnerService } from './dev-runner.service';
import { DevSessionRepository } from './dev-session.repository';
export interface CreateDevReminderInput {
    sessionId?: string;
    conversationId?: string;
    title?: string;
    message: string;
    cronExpr?: string;
    runAt?: string | Date;
    timezone?: string;
    enabled?: boolean;
}
export declare class DevReminderService {
    private readonly prisma;
    private readonly sessions;
    private readonly runner;
    private readonly logger;
    private pollInProgress;
    constructor(prisma: PrismaService, sessions: DevSessionRepository, runner: DevRunRunnerService);
    createReminder(input: CreateDevReminderInput): Promise<{
        session: {
            id: string;
            status: string;
            conversationId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        message: string;
        enabled: boolean;
        title: string | null;
        timezone: string | null;
        sessionId: string;
        cronExpr: string | null;
        runAt: Date | null;
        nextRunAt: Date | null;
        lastTriggeredAt: Date | null;
        lastRunId: string | null;
        lastError: string | null;
    }>;
    listReminders(sessionId?: string): Promise<({
        session: {
            id: string;
            status: string;
            conversationId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        message: string;
        enabled: boolean;
        title: string | null;
        timezone: string | null;
        sessionId: string;
        cronExpr: string | null;
        runAt: Date | null;
        nextRunAt: Date | null;
        lastTriggeredAt: Date | null;
        lastRunId: string | null;
        lastError: string | null;
    })[]>;
    setReminderEnabled(id: string, enabled: boolean): Promise<{
        session: {
            id: string;
            status: string;
            conversationId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        message: string;
        enabled: boolean;
        title: string | null;
        timezone: string | null;
        sessionId: string;
        cronExpr: string | null;
        runAt: Date | null;
        nextRunAt: Date | null;
        lastTriggeredAt: Date | null;
        lastRunId: string | null;
        lastError: string | null;
    }>;
    triggerReminderNow(id: string): Promise<{
        reminderId: string;
        runId: string;
        sessionId: string;
    }>;
    deleteReminder(id: string): Promise<{
        ok: boolean;
    }>;
    dispatchDueReminders(limit?: number): Promise<{
        scanned: number;
        triggered: number;
        skipped: boolean;
    }>;
    private dispatchSingleReminder;
    private parseRunAt;
    private assertScheduleInput;
    private computeNextAfterTrigger;
    private computeNextRunAt;
    private resolveSession;
    private buildReminderQueuedResult;
}
