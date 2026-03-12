import { DevAgentService } from './dev-agent.service';
import type { CreateDevReminderInput } from './dev-reminder.service';
export declare class DevAgentController {
    private readonly devAgent;
    constructor(devAgent: DevAgentService);
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
    getSession(id: string): Promise<({
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
    cancelRun(runId: string, body?: {
        reason?: string;
    }): Promise<{
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
    createReminder(body: CreateDevReminderInput): Promise<{
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
    setReminderEnabled(id: string, body?: {
        enabled?: boolean;
    }): Promise<{
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
