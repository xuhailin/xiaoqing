import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
export declare class DevSessionRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getOrCreateSession(conversationId?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        title: string | null;
        conversationId: string | null;
    }>;
    createRun(sessionId: string, userInput: string, initialResult?: Prisma.InputJsonValue): Promise<{
        error: string | null;
        result: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        executor: string | null;
        startedAt: Date | null;
        userInput: string;
        plan: Prisma.JsonValue | null;
        artifactPath: string | null;
        finishedAt: Date | null;
        sessionId: string;
    }>;
    claimRunForExecution(runId: string): Promise<({
        session: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            title: string | null;
            conversationId: string | null;
        };
    } & {
        error: string | null;
        result: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        executor: string | null;
        startedAt: Date | null;
        userInput: string;
        plan: Prisma.JsonValue | null;
        artifactPath: string | null;
        finishedAt: Date | null;
        sessionId: string;
    }) | null>;
    listRunsByStatuses(statuses: string[]): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        startedAt: Date | null;
        sessionId: string;
    }[]>;
    getRunWithSession(runId: string): Promise<({
        session: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            title: string | null;
            conversationId: string | null;
        };
    } & {
        error: string | null;
        result: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        executor: string | null;
        startedAt: Date | null;
        userInput: string;
        plan: Prisma.JsonValue | null;
        artifactPath: string | null;
        finishedAt: Date | null;
        sessionId: string;
    }) | null>;
    getSession(sessionId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        title: string | null;
        conversationId: string | null;
    } | null>;
    markRunFailedForRecovery(runId: string, message: string): Promise<Prisma.BatchPayload>;
    requeueRunningRun(runId: string, message: string): Promise<Prisma.BatchPayload>;
    cancelRun(runId: string, reason: string): Promise<{
        error: string | null;
        result: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        executor: string | null;
        startedAt: Date | null;
        userInput: string;
        plan: Prisma.JsonValue | null;
        artifactPath: string | null;
        finishedAt: Date | null;
        sessionId: string;
    } | null>;
    updateRunStatus(runId: string, update: {
        status?: string;
        executor?: string;
        plan?: Prisma.InputJsonValue;
        result?: Prisma.InputJsonValue;
        error?: string;
        artifactPath?: string;
        startedAt?: Date;
        finishedAt?: Date;
    }): Promise<{
        error: string | null;
        result: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        executor: string | null;
        startedAt: Date | null;
        userInput: string;
        plan: Prisma.JsonValue | null;
        artifactPath: string | null;
        finishedAt: Date | null;
        sessionId: string;
    }>;
    listSessions(): Promise<({
        runs: {
            error: string | null;
            result: Prisma.JsonValue | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            executor: string | null;
            startedAt: Date | null;
            userInput: string;
            plan: Prisma.JsonValue | null;
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
    getSessionWithRuns(sessionId: string): Promise<({
        runs: {
            error: string | null;
            result: Prisma.JsonValue | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            executor: string | null;
            startedAt: Date | null;
            userInput: string;
            plan: Prisma.JsonValue | null;
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
        result: Prisma.JsonValue | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        executor: string | null;
        startedAt: Date | null;
        userInput: string;
        plan: Prisma.JsonValue | null;
        artifactPath: string | null;
        finishedAt: Date | null;
        sessionId: string;
    } | null>;
}
