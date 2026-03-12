import { Injectable } from '@nestjs/common';
import { type Prisma, DevRunStatus, DevSessionStatus } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class DevSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(conversationId?: string) {
    return this.prisma.devSession.create({
      data: { conversationId, status: DevSessionStatus.active },
    });
  }

  async listActiveSessionsByConversation(conversationId: string) {
    return this.prisma.devSession.findMany({
      where: { conversationId, status: DevSessionStatus.active },
      orderBy: { createdAt: 'desc' },
      include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async getOrCreateSession(conversationId?: string) {
    // 如果有关联的 conversationId，尝试复用活跃 session
    if (conversationId) {
      const existing = await this.prisma.devSession.findFirst({
        where: { conversationId, status: DevSessionStatus.active },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }
    return this.prisma.devSession.create({
      data: { conversationId, status: DevSessionStatus.active },
    });
  }

  async createRun(
    sessionId: string,
    userInput: string,
    initialResult?: Prisma.InputJsonValue,
  ) {
    return this.prisma.devRun.create({
      data: {
        sessionId,
        userInput,
        status: DevRunStatus.queued,
        result:
          initialResult ??
          ({
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
          } as Prisma.InputJsonValue),
      },
    });
  }

  async claimRunForExecution(runId: string) {
    const startedAt = new Date();
    const claimed = await this.prisma.devRun.updateMany({
      where: {
        id: runId,
        status: { in: [DevRunStatus.queued, DevRunStatus.pending] },
      },
      data: {
        status: DevRunStatus.running,
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

  async listRunsByStatuses(statuses: DevRunStatus[]) {
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

  async getRunWithSession(runId: string) {
    return this.prisma.devRun.findUnique({
      where: { id: runId },
      include: { session: true },
    });
  }

  async getSession(sessionId: string) {
    return this.prisma.devSession.findUnique({
      where: { id: sessionId },
    });
  }

  async getLatestRun(sessionId: string) {
    return this.prisma.devRun.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRunFailedForRecovery(runId: string, message: string) {
    return this.prisma.devRun.updateMany({
      where: {
        id: runId,
        status: DevRunStatus.running,
      },
      data: {
        status: DevRunStatus.failed,
        error: message,
        finishedAt: new Date(),
      },
    });
  }

  async requeueRunningRun(runId: string, message: string) {
    return this.prisma.devRun.updateMany({
      where: {
        id: runId,
        status: DevRunStatus.running,
      },
      data: {
        status: DevRunStatus.queued,
        error: message,
        startedAt: null,
        finishedAt: null,
      },
    });
  }

  async cancelRun(runId: string, reason: string) {
    const existing = await this.prisma.devRun.findUnique({
      where: { id: runId },
    });
    if (!existing) return null;

    const terminalStatuses: DevRunStatus[] = [DevRunStatus.success, DevRunStatus.failed, DevRunStatus.cancelled];
    if (terminalStatuses.includes(existing.status) && existing.status !== DevRunStatus.cancelled) {
      return existing;
    }

    const cancelledAt = new Date().toISOString();
    const nextResult: Prisma.InputJsonValue =
      existing.result &&
      typeof existing.result === 'object' &&
      !Array.isArray(existing.result)
        ? ({
            ...(existing.result as Record<string, unknown>),
            phase: 'cancelled',
            cancelReason: reason,
            cancelledAt,
            updatedAt: cancelledAt,
          } as Prisma.InputJsonValue)
        : ({
            phase: 'cancelled',
            cancelReason: reason,
            cancelledAt,
            updatedAt: cancelledAt,
          } as Prisma.InputJsonValue);

    return this.prisma.devRun.update({
      where: { id: runId },
      data: {
        status: DevRunStatus.cancelled,
        error: reason,
        finishedAt: new Date(),
        result: nextResult,
      },
    });
  }

  async updateRunStatus(
    runId: string,
    update: {
      status?: DevRunStatus;
      executor?: string;
      plan?: Prisma.InputJsonValue;
      result?: Prisma.InputJsonValue;
      error?: string;
      artifactPath?: string;
      startedAt?: Date;
      finishedAt?: Date;
    },
  ) {
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

  async getSessionWithRuns(sessionId: string) {
    return this.prisma.devSession.findUnique({
      where: { id: sessionId },
      include: { runs: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getRun(runId: string) {
    return this.prisma.devRun.findUnique({ where: { id: runId } });
  }
}
