import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  ConversationWorkEventType,
  ConversationWorkExecutorType,
  ConversationWorkStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { estimateTokens } from '../infra/token-estimator';
import type { EntryAgentId } from '../gateway/message-router.types';
import type { AgentDelegationKind } from '../agent-bus/agent-bus.types';
import type {
  ConversationWorkItemDto,
  ConversationWorkProjectionType,
} from './conversation-work.types';

const DEFAULT_DEV_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class ConversationWorkService {
  private readonly logger = new Logger(ConversationWorkService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createDevWorkItem(input: {
    conversationId: string;
    userInput: string;
    title?: string | null;
  }) {
    const goal = input.userInput.trim();
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + DEFAULT_DEV_TIMEOUT_MS);

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: 'user',
        kind: 'user',
        content: goal,
        tokenCount: estimateTokens(goal),
      },
    });

    const workItem = await this.prisma.conversationWorkItem.create({
      data: {
        conversationId: input.conversationId,
        originUserMessageId: userMessage.id,
        status: ConversationWorkStatus.accepted,
        title: this.normalizeTitle(input.title, goal),
        userFacingGoal: goal,
        latestSummary: '我已经接手，准备开始处理。',
        timeoutAt,
        lastEventAt: now,
        closureContractJson: {
          returnToConversationId: input.conversationId,
          sourceUserMessageId: userMessage.id,
          mustProjectTerminalResult: true,
          resultProjectionMode: 'same_conversation',
          timeoutAt: timeoutAt.toISOString(),
        } satisfies Prisma.JsonObject,
      },
    });

    await this.appendEvent(workItem.id, ConversationWorkEventType.accepted, {
      summary: '小晴已正式接手这件事',
    });

    const receiptContent = this.buildDevReceiptContent(goal);
    const receiptMessage = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: 'assistant',
        kind: 'chat',
        content: receiptContent,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'receipt',
          status: ConversationWorkStatus.accepted,
        }),
        tokenCount: estimateTokens(receiptContent),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        originReceiptMessageId: receiptMessage.id,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.receipt_projected, {
      summary: '前台回执已投影到会话',
      payload: {
        receiptMessageId: receiptMessage.id,
      },
    });

    return {
      userMessage,
      receiptMessage,
      workItem: this.toDto(updated),
    };
  }

  async attachDevRun(workItemId: string, runId: string) {
    const now = new Date();
    const workItem = await this.prisma.conversationWorkItem.update({
      where: { id: workItemId },
      data: {
        status: ConversationWorkStatus.queued,
        executorType: ConversationWorkExecutorType.dev_run,
        sourceRefId: runId,
        latestSummary: '任务已加入后台队列，正在等待开始。',
        lastEventAt: now,
      },
    });

    await this.appendEvent(workItem.id, ConversationWorkEventType.queued, {
      summary: '任务已进入后台队列',
      sourceRefId: runId,
    });

    return this.toDto(workItem);
  }

  async createDelegationWorkItem(input: {
    conversationId: string;
    delegationId: string;
    originMessageId?: string | null;
    fromAgentId: EntryAgentId;
    toAgentId: EntryAgentId;
    delegationKind: AgentDelegationKind;
    title?: string | null;
    summary?: string | null;
    userFacingGoal?: string | null;
  }) {
    const goal = input.userFacingGoal?.trim()
      || input.summary?.trim()
      || `转交${this.getAgentLabel(input.toAgentId)}处理`;
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + DEFAULT_DEV_TIMEOUT_MS);
    const originUserMessageId = await this.resolveOriginUserMessageId(
      input.conversationId,
      input.originMessageId,
      goal,
    );

    const workItem = await this.prisma.conversationWorkItem.create({
      data: {
        conversationId: input.conversationId,
        originUserMessageId,
        status: ConversationWorkStatus.accepted,
        executorType: ConversationWorkExecutorType.agent_delegation,
        sourceRefId: input.delegationId,
        title: this.normalizeTitle(input.title, goal),
        userFacingGoal: goal,
        latestSummary: `我已经转给${this.getAgentLabel(input.toAgentId)}，准备开始跟进。`,
        timeoutAt,
        lastEventAt: now,
        closureContractJson: {
          returnToConversationId: input.conversationId,
          sourceUserMessageId: originUserMessageId,
          mustProjectTerminalResult: true,
          resultProjectionMode: 'same_conversation',
          timeoutAt: timeoutAt.toISOString(),
          executorType: 'agent_delegation',
          sourceRefId: input.delegationId,
        } satisfies Prisma.JsonObject,
      },
    });

    await this.appendEvent(workItem.id, ConversationWorkEventType.accepted, {
      summary: `已接手并准备转给${this.getAgentLabel(input.toAgentId)}`,
      sourceRefId: input.delegationId,
    });

    const receiptContent = `已转达给${this.getAgentLabel(input.toAgentId)}，我这边继续跟进。`;
    const receiptMessage = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: 'assistant',
        kind: 'agent_receipt',
        content: receiptContent,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'receipt',
          status: ConversationWorkStatus.queued,
          extra: {
            source: 'assistant',
            delegationId: input.delegationId,
            fromAgentId: input.fromAgentId,
            toAgentId: input.toAgentId,
            delegationKind: input.delegationKind,
            delegationStatus: 'acknowledged',
            summary: input.summary?.trim() || undefined,
          },
        }),
        tokenCount: estimateTokens(receiptContent),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.queued,
        originReceiptMessageId: receiptMessage.id,
        latestSummary: `${this.getAgentLabel(input.toAgentId)}已接收，等待开始处理。`,
        lastEventAt: new Date(),
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.receipt_projected, {
      summary: '协作回执已投影到会话',
      sourceRefId: input.delegationId,
      payload: {
        receiptMessageId: receiptMessage.id,
      },
    });
    await this.appendEvent(updated.id, ConversationWorkEventType.queued, {
      summary: '协作任务已进入后台队列',
      sourceRefId: input.delegationId,
    });

    return {
      receiptMessage,
      workItem: this.toDto(updated),
    };
  }

  async markFailedById(workItemId: string, reason: string) {
    const workItem = await this.prisma.conversationWorkItem.findUnique({
      where: { id: workItemId },
    });
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    await this.appendEvent(workItem.id, ConversationWorkEventType.failed, {
      summary: reason,
      sourceRefId: workItem.sourceRefId ?? undefined,
    });

    const reply = `这件事我这边没能开始处理：${reason}`;
    const resultMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'assistant',
        kind: 'chat',
        content: reply,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'result',
          status: ConversationWorkStatus.failed,
        }),
        tokenCount: estimateTokens(reply),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.failed,
        latestSummary: reason,
        errorMessage: reason,
        resultMessageId: resultMessage.id,
        finishedAt: new Date(),
        lastEventAt: new Date(),
        retryable: true,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.result_projected, {
      summary: '失败结果已回流到原会话',
      sourceRefId: updated.sourceRefId ?? undefined,
      payload: {
        resultMessageId: resultMessage.id,
      },
    });

    return this.toDto(updated);
  }

  async markDevRunRunning(runId: string, summary?: string) {
    const workItem = await this.findBySourceRef(ConversationWorkExecutorType.dev_run, runId);
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    const now = new Date();
    const nextSummary = summary?.trim() || '我已经开始处理这件事。';
    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.running,
        startedAt: workItem.startedAt ?? now,
        latestSummary: nextSummary,
        lastEventAt: now,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.started, {
      summary: nextSummary,
      sourceRefId: runId,
    });

    return this.toDto(updated);
  }

  async markDevRunCompleted(runId: string, content: string) {
    const workItem = await this.findBySourceRef(ConversationWorkExecutorType.dev_run, runId);
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    await this.appendEvent(workItem.id, ConversationWorkEventType.completed, {
      summary: '后台执行已完成',
      sourceRefId: runId,
    });

    const reply = this.wrapCompletedContent(content);
    const resultMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'assistant',
        kind: 'chat',
        content: reply,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'result',
          status: ConversationWorkStatus.completed,
        }),
        tokenCount: estimateTokens(reply),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.completed,
        latestSummary: '这件事已经处理完成。',
        resultMessageId: resultMessage.id,
        finishedAt: new Date(),
        lastEventAt: new Date(),
        errorCode: null,
        errorMessage: null,
        blockReason: null,
        waitingQuestion: null,
        retryable: false,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.result_projected, {
      summary: '最终结果已回流到原会话',
      sourceRefId: runId,
      payload: {
        resultMessageId: resultMessage.id,
      },
    });

    return this.toDto(updated);
  }

  async markDevRunFailed(runId: string, reason: string) {
    const workItem = await this.findBySourceRef(ConversationWorkExecutorType.dev_run, runId);
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    await this.appendEvent(workItem.id, ConversationWorkEventType.failed, {
      summary: reason,
      sourceRefId: runId,
    });

    const reply = `这件事我这边没能完成：${reason}`;
    const resultMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'assistant',
        kind: 'chat',
        content: reply,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'result',
          status: ConversationWorkStatus.failed,
        }),
        tokenCount: estimateTokens(reply),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.failed,
        latestSummary: reason,
        errorMessage: reason,
        resultMessageId: resultMessage.id,
        finishedAt: new Date(),
        lastEventAt: new Date(),
        retryable: true,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.result_projected, {
      summary: '失败结果已回流到原会话',
      sourceRefId: runId,
      payload: {
        resultMessageId: resultMessage.id,
      },
    });

    return this.toDto(updated);
  }

  async markDevRunCancelled(runId: string, reason: string) {
    const workItem = await this.findBySourceRef(ConversationWorkExecutorType.dev_run, runId);
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    await this.appendEvent(workItem.id, ConversationWorkEventType.cancelled, {
      summary: reason,
      sourceRefId: runId,
    });

    const reply = `这件事已停止处理：${reason}`;
    const resultMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'assistant',
        kind: 'chat',
        content: reply,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'result',
          status: ConversationWorkStatus.cancelled,
        }),
        tokenCount: estimateTokens(reply),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.cancelled,
        latestSummary: reason,
        errorMessage: reason,
        resultMessageId: resultMessage.id,
        finishedAt: new Date(),
        lastEventAt: new Date(),
        retryable: false,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.result_projected, {
      summary: '取消结果已回流到原会话',
      sourceRefId: runId,
      payload: {
        resultMessageId: resultMessage.id,
      },
    });

    return this.toDto(updated);
  }

  async markDelegationRunning(delegationId: string, summary?: string) {
    const workItem = await this.findBySourceRef(
      ConversationWorkExecutorType.agent_delegation,
      delegationId,
    );
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    const now = new Date();
    const nextSummary = summary?.trim() || '协作助手已经开始处理。';
    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.running,
        startedAt: workItem.startedAt ?? now,
        latestSummary: nextSummary,
        lastEventAt: now,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.started, {
      summary: nextSummary,
      sourceRefId: delegationId,
    });

    return this.toDto(updated);
  }

  async markDelegationProgress(delegationId: string, summary: string) {
    const workItem = await this.findBySourceRef(
      ConversationWorkExecutorType.agent_delegation,
      delegationId,
    );
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    const nextSummary = summary.trim();
    if (!nextSummary) {
      return this.toDto(workItem);
    }

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: workItem.status === ConversationWorkStatus.accepted
          ? ConversationWorkStatus.queued
          : workItem.status,
        latestSummary: nextSummary,
        lastEventAt: new Date(),
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.progress, {
      summary: nextSummary,
      sourceRefId: delegationId,
    });

    return this.toDto(updated);
  }

  async markDelegationCompleted(input: {
    delegationId: string;
    fromAgentId: EntryAgentId;
    toAgentId: EntryAgentId;
    delegationKind: AgentDelegationKind;
    content: string;
    summary?: string | null;
    relatedMessageId?: string | null;
  }) {
    const workItem = await this.findBySourceRef(
      ConversationWorkExecutorType.agent_delegation,
      input.delegationId,
    );
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    await this.appendEvent(workItem.id, ConversationWorkEventType.completed, {
      summary: input.summary?.trim() || `${this.getAgentLabel(input.fromAgentId)}已完成处理`,
      sourceRefId: input.delegationId,
    });

    const reply = this.wrapCompletedContent(input.content);
    const resultMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'assistant',
        kind: 'agent_result',
        content: reply,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'result',
          status: ConversationWorkStatus.completed,
          extra: {
            source: 'assistant',
            success: true,
            delegationId: input.delegationId,
            fromAgentId: input.fromAgentId,
            toAgentId: input.toAgentId,
            delegationKind: input.delegationKind,
            delegationStatus: 'completed',
            summary: input.summary?.trim() || undefined,
            relatedMessageId: input.relatedMessageId ?? undefined,
          },
        }),
        tokenCount: estimateTokens(reply),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.completed,
        latestSummary: input.summary?.trim() || '协作任务已完成。',
        resultMessageId: resultMessage.id,
        finishedAt: new Date(),
        lastEventAt: new Date(),
        errorCode: null,
        errorMessage: null,
        retryable: false,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.result_projected, {
      summary: '协作结果已回流到原会话',
      sourceRefId: input.delegationId,
      payload: {
        resultMessageId: resultMessage.id,
      },
    });

    return {
      resultMessage,
      workItem: this.toDto(updated),
    };
  }

  async markDelegationFailed(input: {
    delegationId: string;
    fromAgentId: EntryAgentId;
    toAgentId: EntryAgentId;
    delegationKind: AgentDelegationKind;
    reason: string;
    content?: string | null;
    relatedMessageId?: string | null;
  }) {
    const workItem = await this.findBySourceRef(
      ConversationWorkExecutorType.agent_delegation,
      input.delegationId,
    );
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    const summary = input.reason.trim() || `${this.getAgentLabel(input.fromAgentId)}处理失败`;
    await this.appendEvent(workItem.id, ConversationWorkEventType.failed, {
      summary,
      sourceRefId: input.delegationId,
    });

    const reply = input.content?.trim()
      || `委托给${this.getAgentLabel(input.fromAgentId)}时失败了：${summary}`;
    const resultMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'assistant',
        kind: 'agent_result',
        content: reply,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'result',
          status: ConversationWorkStatus.failed,
          extra: {
            source: 'assistant',
            success: false,
            delegationId: input.delegationId,
            fromAgentId: input.fromAgentId,
            toAgentId: input.toAgentId,
            delegationKind: input.delegationKind,
            delegationStatus: 'failed',
            summary,
            relatedMessageId: input.relatedMessageId ?? undefined,
          },
        }),
        tokenCount: estimateTokens(reply),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.failed,
        latestSummary: summary,
        errorMessage: summary,
        resultMessageId: resultMessage.id,
        finishedAt: new Date(),
        lastEventAt: new Date(),
        retryable: true,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.result_projected, {
      summary: '协作失败结果已回流到原会话',
      sourceRefId: input.delegationId,
      payload: {
        resultMessageId: resultMessage.id,
      },
    });

    return {
      resultMessage,
      workItem: this.toDto(updated),
    };
  }

  async listByConversation(conversationId: string): Promise<ConversationWorkItemDto[]> {
    const items = await this.prisma.conversationWorkItem.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.toDto(item));
  }

  async findByConversationAndId(
    conversationId: string,
    workItemId: string,
  ): Promise<ConversationWorkItemDto | null> {
    const item = await this.prisma.conversationWorkItem.findFirst({
      where: { id: workItemId, conversationId },
    });
    return item ? this.toDto(item) : null;
  }

  @Interval(30000)
  async timeoutExpiredWorkItems() {
    const now = new Date();
    const items = await this.prisma.conversationWorkItem.findMany({
      where: {
        status: {
          in: [
            ConversationWorkStatus.accepted,
            ConversationWorkStatus.queued,
            ConversationWorkStatus.running,
          ],
        },
        timeoutAt: { lte: now },
      },
      take: 20,
      orderBy: { timeoutAt: 'asc' },
    });

    for (const item of items) {
      if (this.isTerminalStatus(item.status) || item.resultMessageId) {
        continue;
      }

      this.logger.warn(`Timing out stale work item: ${item.id}`);
      await this.appendEvent(item.id, ConversationWorkEventType.timed_out, {
        summary: '后台处理超时',
        sourceRefId: item.sourceRefId ?? undefined,
      });

      const reply = '这件事处理超时了，我暂时没有拿到完整结果。';
      const resultMessage = await this.prisma.message.create({
        data: {
          conversationId: item.conversationId,
          role: 'assistant',
          kind: 'chat',
          content: reply,
          metadata: this.buildProjectionMetadata({
            workItemId: item.id,
            projectionType: 'result',
            status: ConversationWorkStatus.timed_out,
          }),
          tokenCount: estimateTokens(reply),
        },
      });

      await this.prisma.conversationWorkItem.update({
        where: { id: item.id },
        data: {
          status: ConversationWorkStatus.timed_out,
          latestSummary: '处理超时，已停止等待。',
          errorCode: 'TIMEOUT',
          errorMessage: '处理超时',
          resultMessageId: resultMessage.id,
          finishedAt: now,
          lastEventAt: now,
        },
      });

      await this.appendEvent(item.id, ConversationWorkEventType.result_projected, {
        summary: '超时结果已回流到原会话',
        sourceRefId: item.sourceRefId ?? undefined,
        payload: {
          resultMessageId: resultMessage.id,
        },
      });
    }
  }

  private async findBySourceRef(
    executorType: ConversationWorkExecutorType,
    sourceRefId: string,
  ) {
    return this.prisma.conversationWorkItem.findFirst({
      where: { executorType, sourceRefId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async appendEvent(
    workItemId: string,
    eventType: ConversationWorkEventType,
    input?: {
      summary?: string;
      payload?: Prisma.JsonObject;
      sourceRefId?: string;
    },
  ) {
    return this.prisma.conversationWorkEvent.create({
      data: {
        workItemId,
        eventType,
        summary: input?.summary?.trim() || null,
        payloadJson: input?.payload ? input.payload : Prisma.DbNull,
        sourceRefId: input?.sourceRefId ?? null,
      },
    });
  }

  private toDto(item: {
    id: string;
    conversationId: string;
    originUserMessageId: string;
    originReceiptMessageId: string | null;
    resultMessageId: string | null;
    status: ConversationWorkStatus;
    executorType: ConversationWorkExecutorType | null;
    sourceRefId: string | null;
    title: string | null;
    userFacingGoal: string;
    latestSummary: string | null;
    blockReason: string | null;
    waitingQuestion: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    retryable: boolean;
    timeoutAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastEventAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ConversationWorkItemDto {
    return {
      id: item.id,
      conversationId: item.conversationId,
      originUserMessageId: item.originUserMessageId,
      originReceiptMessageId: item.originReceiptMessageId,
      resultMessageId: item.resultMessageId,
      status: item.status,
      executorType: item.executorType,
      sourceRefId: item.sourceRefId,
      title: item.title,
      userFacingGoal: item.userFacingGoal,
      latestSummary: item.latestSummary,
      blockReason: item.blockReason,
      waitingQuestion: item.waitingQuestion,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      retryable: item.retryable,
      timeoutAt: item.timeoutAt,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      lastEventAt: item.lastEventAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private buildProjectionMetadata(input: {
    workItemId: string;
    projectionType: ConversationWorkProjectionType;
    status: ConversationWorkStatus;
    extra?: Prisma.JsonObject;
  }) {
    return {
      ...(input.extra ?? {}),
      source: 'assistant' as const,
      workItemId: input.workItemId,
      workProjection: input.projectionType,
      workStatus: input.status,
    } satisfies Prisma.JsonObject;
  }

  private buildDevReceiptContent(goal: string): string {
    return `这件事我已经接手了，先在后台处理，进展和结果都会直接回到这条对话。`;
  }

  private normalizeTitle(title: string | null | undefined, goal: string): string {
    const trimmed = title?.trim();
    if (trimmed) return trimmed.slice(0, 120);
    return goal.length > 40 ? `${goal.slice(0, 40)}...` : goal;
  }

  private wrapCompletedContent(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) {
      return '这件事已经处理完成。';
    }
    return trimmed;
  }

  private isTerminalStatus(status: ConversationWorkStatus): boolean {
    return status === ConversationWorkStatus.completed
      || status === ConversationWorkStatus.failed
      || status === ConversationWorkStatus.cancelled
      || status === ConversationWorkStatus.timed_out;
  }

  private async resolveOriginUserMessageId(
    conversationId: string,
    originMessageId: string | null | undefined,
    fallbackGoal: string,
  ): Promise<string> {
    if (originMessageId?.trim()) {
      return originMessageId.trim();
    }

    const latestUserMessage = await this.prisma.message.findFirst({
      where: {
        conversationId,
        role: 'user',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latestUserMessage) {
      return latestUserMessage.id;
    }

    const syntheticUserMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        kind: 'user',
        content: fallbackGoal,
        tokenCount: estimateTokens(fallbackGoal),
      },
    });
    return syntheticUserMessage.id;
  }

  private getAgentLabel(agentId: EntryAgentId): string {
    return agentId === 'xiaoqin' ? '小勤' : '小晴';
  }
}
