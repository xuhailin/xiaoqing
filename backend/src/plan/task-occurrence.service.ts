import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OccurrenceStatus } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import type { OccurrenceExceptionInput } from './plan.types';

@Injectable()
export class TaskOccurrenceService {
  private readonly logger = new Logger(TaskOccurrenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 为一次 Plan 触发创建 occurrence 记录 */
  async createOccurrence(planId: string, scheduledAt: Date) {
    return this.prisma.taskOccurrence.create({
      data: {
        planId,
        scheduledAt,
        status: OccurrenceStatus.pending,
      },
    });
  }

  /** 标记 occurrence 已完成 */
  async markDone(occurrenceId: string, resultRef?: string) {
    return this.prisma.taskOccurrence.update({
      where: { id: occurrenceId },
      data: {
        status: OccurrenceStatus.done,
        dispatchedAt: new Date(),
        resultRef: resultRef || null,
      },
    });
  }

  /** 对某次 occurrence 做 skip / reschedule */
  async applyException(input: OccurrenceExceptionInput) {
    // 先查找是否已有对应的 occurrence（可能尚未生成）
    let occurrence = await this.prisma.taskOccurrence.findFirst({
      where: {
        planId: input.planId,
        scheduledAt: input.scheduledAt,
        status: OccurrenceStatus.pending,
      },
    });

    if (!occurrence) {
      // 为尚未生成的 occurrence 预创建记录
      occurrence = await this.prisma.taskOccurrence.create({
        data: {
          planId: input.planId,
          scheduledAt: input.scheduledAt,
          status: OccurrenceStatus.pending,
        },
      });
    }

    if (input.action === 'skip') {
      return this.prisma.taskOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: OccurrenceStatus.skipped,
          skipReason: input.reason || null,
        },
      });
    }

    if (input.action === 'reschedule') {
      if (!input.rescheduledTo) {
        throw new BadRequestException('rescheduledTo is required for reschedule action');
      }
      return this.prisma.taskOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: OccurrenceStatus.rescheduled,
          rescheduledTo: input.rescheduledTo,
          skipReason: input.reason || null,
        },
      });
    }

    throw new BadRequestException(`unknown exception action: ${input.action}`);
  }

  /** 检查某次 occurrence 是否被 skip（用于调度器在触发前检查） */
  async isSkipped(planId: string, scheduledAt: Date): Promise<boolean> {
    const occurrence = await this.prisma.taskOccurrence.findFirst({
      where: {
        planId,
        scheduledAt,
        status: { in: [OccurrenceStatus.skipped] },
      },
    });
    return !!occurrence;
  }

  /** 查询某个 Plan 的 occurrence 列表 */
  async listByPlan(planId: string, options?: { limit?: number; status?: OccurrenceStatus }) {
    return this.prisma.taskOccurrence.findMany({
      where: {
        planId,
        status: options?.status,
      },
      orderBy: { scheduledAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  /** 查询某个时间范围内的所有 occurrence（跨 Plan） */
  async listByTimeRange(from: Date, to: Date, options?: { conversationId?: string }) {
    return this.prisma.taskOccurrence.findMany({
      where: {
        scheduledAt: { gte: from, lte: to },
        ...(options?.conversationId
          ? { plan: { conversationId: options.conversationId } }
          : {}),
      },
      include: { plan: { select: { id: true, title: true, scope: true, dispatchType: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }
}
