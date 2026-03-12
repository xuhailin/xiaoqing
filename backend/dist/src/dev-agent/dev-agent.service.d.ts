import type { DevTaskResult } from './dev-agent.types';
import { DevSessionRepository } from './dev-session.repository';
import { DevRunRunnerService } from './dev-runner.service';
import { DevReminderService, type CreateDevReminderInput } from './dev-reminder.service';
export declare class DevAgentService {
    private readonly sessions;
    private readonly runner;
    private readonly reminders;
    constructor(sessions: DevSessionRepository, runner: DevRunRunnerService, reminders: DevReminderService);
    handleTask(conversationId: string, userInput: string): Promise<DevTaskResult>;
    listSessions(): Promise<({
        runs: {
            error: string | null;
            result: import("@prisma/client/runtime/client").JsonValue | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            executor: string | null;
            startedAt: Date | null;
            userInput: string;
            plan: import("@prisma/client/runtime/client").JsonValue | null;
            artifactPath: string | null;
            finishedAt: Date | null;
            sessionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        title: string | null;
        conversationId: string | null;
    })[]>;
    getSession(sessionId: string): Promise<({
        runs: {
            error: string | null;
            result: import("@prisma/client/runtime/client").JsonValue | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            executor: string | null;
            startedAt: Date | null;
            userInput: string;
            plan: import("@prisma/client/runtime/client").JsonValue | null;
            artifactPath: string | null;
            finishedAt: Date | null;
            sessionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        title: string | null;
        conversationId: string | null;
    }) | null>;
    getRun(runId: string): Promise<{
        error: string | null;
        result: import("@prisma/client/runtime/client").JsonValue | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        executor: string | null;
        startedAt: Date | null;
        userInput: string;
        plan: import("@prisma/client/runtime/client").JsonValue | null;
        artifactPath: string | null;
        finishedAt: Date | null;
        sessionId: string;
    } | null>;
    cancelRun(runId: string, reason?: string): Promise<{
        ok: boolean;
        error: string;
        run?: undefined;
    } | {
        ok: boolean;
        error: string;
        run: {
            id: string;
            status: string;
            error: string | null;
            finishedAt: Date | null;
        };
    } | {
        ok: boolean;
        run: {
            id: string;
            status: string;
            error: string | null;
            finishedAt: Date | null;
        };
        error?: undefined;
    }>;
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
}
