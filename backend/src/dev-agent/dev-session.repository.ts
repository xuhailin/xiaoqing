import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class DevSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateSession(conversationId?: string) {
    // 如果有关联的 conversationId，尝试复用活跃 session
    if (conversationId) {
      const existing = await this.prisma.devSession.findFirst({
        where: { conversationId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }
    return this.prisma.devSession.create({
      data: { conversationId, status: 'active' },
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
        status: 'queued',
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

  async listRunsByStatuses(statuses: string[]) {
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

  async markRunFailedForRecovery(runId: string, message: string) {
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

  async requeueRunningRun(runId: string, message: string) {
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

  async cancelRun(runId: string, reason: string) {
    const existing = await this.prisma.devRun.findUnique({
      where: { id: runId },
    });
    if (!existing) return null;

    if (['success', 'failed', 'canceled'].includes(existing.status)) {
      return existing;
    }

    const canceledAt = new Date().toISOString();
    const nextResult: Prisma.InputJsonValue =
      existing.result &&
      typeof existing.result === 'object' &&
      !Array.isArray(existing.result)
        ? ({
            ...(existing.result as Record<string, unknown>),
            phase: 'canceled',
            cancelReason: reason,
            canceledAt,
            updatedAt: canceledAt,
          } as Prisma.InputJsonValue)
        : ({
            phase: 'canceled',
            cancelReason: reason,
            canceledAt,
            updatedAt: canceledAt,
          } as Prisma.InputJsonValue);

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

  async updateRunStatus(
    runId: string,
    update: {
      status?: string;
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
