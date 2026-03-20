import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Observable, Subject, filter } from 'rxjs';
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
  ConversationWorkHealthState,
  ConversationWorkItemDto,
  ConversationWorkProjectionType,
} from './conversation-work.types';

const DEFAULT_DEV_TIMEOUT_MS = 15 * 60 * 1000;
const ACCEPTED_ATTENTION_MS = 60 * 1000;
const ACCEPTED_STALLED_MS = 3 * 60 * 1000;
const RUNNING_ATTENTION_MS = 2 * 60 * 1000;
const RUNNING_STALLED_MS = 6 * 60 * 1000;

@Injectable()
export class ConversationWorkService {
  private readonly logger = new Logger(ConversationWorkService.name);
  private readonly updates$ = new Subject<ConversationWorkItemDto>();

  constructor(private readonly prisma: PrismaService) {}

  async createDevWorkItem(input: {
    conversationId: string;
    userInput: string;
    title?: string | null;
    parentWorkItemId?: string | null;
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
        executorType: ConversationWorkExecutorType.dev_run,
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
          ...(input.parentWorkItemId?.trim() ? { parentWorkItemId: input.parentWorkItemId.trim() } : {}),
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
      workItem: this.publish(this.toDto(updated)),
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

    return this.publish(this.toDto(workItem));
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
    parentWorkItemId?: string | null;
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
    const parentWorkItemId = input.parentWorkItemId?.trim()
      || await this.resolveParentWorkItemId(input.originMessageId);

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
          ...(parentWorkItemId ? { parentWorkItemId } : {}),
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
      workItem: this.publish(this.toDto(updated)),
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

    return this.publish(this.toDto(updated));
  }

  async markWaitingInputById(
    workItemId: string,
    question: string,
    blockReason?: string | null,
  ) {
    const workItem = await this.prisma.conversationWorkItem.findUnique({
      where: { id: workItemId },
    });
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    const waitingQuestion = question.trim();
    const nextBlockReason = blockReason?.trim() || waitingQuestion;
    const now = new Date();
    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.waiting_input,
        latestSummary: nextBlockReason,
        blockReason: nextBlockReason,
        waitingQuestion,
        lastEventAt: now,
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.waiting_input, {
      summary: nextBlockReason,
      sourceRefId: updated.sourceRefId ?? undefined,
    });

    const followupMessage = await this.prisma.message.create({
      data: {
        conversationId: updated.conversationId,
        role: 'assistant',
        kind: 'chat',
        content: waitingQuestion,
        metadata: this.buildProjectionMetadata({
          workItemId: updated.id,
          projectionType: 'followup',
          status: ConversationWorkStatus.waiting_input,
        }),
        tokenCount: estimateTokens(waitingQuestion),
      },
    });

    return {
      workItem: this.publish(this.toDto(updated)),
      followupMessage,
    };
  }

  async reaskWaitingInputById(input: {
    workItemId: string;
    userInput: string;
    question: string;
    blockReason?: string | null;
  }) {
    const workItem = await this.prisma.conversationWorkItem.findUnique({
      where: { id: input.workItemId },
    });
    if (!workItem || this.isTerminalStatus(workItem.status)) return null;

    const userContent = input.userInput.trim() || '继续处理';
    const userMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'user',
        kind: 'user',
        content: userContent,
        tokenCount: estimateTokens(userContent),
      },
    });

    const waiting = await this.markWaitingInputById(
      workItem.id,
      input.question,
      input.blockReason,
    );

    return waiting ? {
      userMessage,
      assistantMessage: waiting.followupMessage,
      workItem: waiting.workItem,
    } : null;
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

    return this.publish(this.toDto(updated));
  }

  async markDevRunWaitingInput(
    runId: string,
    question: string,
    blockReason?: string | null,
  ) {
    const workItem = await this.findBySourceRef(ConversationWorkExecutorType.dev_run, runId);
    if (!workItem) return null;
    return this.markWaitingInputById(workItem.id, question, blockReason);
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

    return this.publish(this.toDto(updated));
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

    return this.publish(this.toDto(updated));
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

    return this.publish(this.toDto(updated));
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

    return this.publish(this.toDto(updated));
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

    return this.publish(this.toDto(updated));
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
      workItem: this.publish(this.toDto(updated)),
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
      workItem: this.publish(this.toDto(updated)),
    };
  }

  streamByConversation(conversationId: string): Observable<ConversationWorkItemDto> {
    return this.updates$.pipe(
      filter((item) => item.conversationId === conversationId),
    );
  }

  async findLatestWaitingInputByConversation(conversationId: string): Promise<ConversationWorkItemDto | null> {
    const item = await this.prisma.conversationWorkItem.findFirst({
      where: {
        conversationId,
        status: ConversationWorkStatus.waiting_input,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return item ? this.toDto(item) : null;
  }

  async findWaitingDevWorkItemForConversation(
    conversationId: string,
    workItemId: string,
  ): Promise<ConversationWorkItemDto | null> {
    const item = await this.prisma.conversationWorkItem.findFirst({
      where: {
        id: workItemId,
        conversationId,
        status: ConversationWorkStatus.waiting_input,
        executorType: ConversationWorkExecutorType.dev_run,
      },
    });
    return item ? this.toDto(item) : null;
  }

  async resumeDevWorkItem(input: {
    conversationId: string;
    workItemId: string;
    newRunId: string;
    userInput: string;
  }) {
    const workItem = await this.prisma.conversationWorkItem.findFirst({
      where: {
        id: input.workItemId,
        conversationId: input.conversationId,
        status: ConversationWorkStatus.waiting_input,
        executorType: ConversationWorkExecutorType.dev_run,
      },
    });
    if (!workItem) {
      throw new Error(`waiting dev work item not found: ${input.workItemId}`);
    }

    const now = new Date();
    const userContent = input.userInput.trim() || '继续处理';
    const previousRunId = workItem.sourceRefId;
    const userMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'user',
        kind: 'user',
        content: userContent,
        tokenCount: estimateTokens(userContent),
      },
    });

    const assistantContent = '收到你补充的信息了，我继续接着处理，进展和结果还是会直接回到这条对话。';
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId: workItem.conversationId,
        role: 'assistant',
        kind: 'chat',
        content: assistantContent,
        metadata: this.buildProjectionMetadata({
          workItemId: workItem.id,
          projectionType: 'followup',
          status: ConversationWorkStatus.queued,
        }),
        tokenCount: estimateTokens(assistantContent),
      },
    });

    const updated = await this.prisma.conversationWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: ConversationWorkStatus.queued,
        executorType: ConversationWorkExecutorType.dev_run,
        sourceRefId: input.newRunId,
        latestSummary: '已收到补充信息，继续处理中。',
        blockReason: null,
        waitingQuestion: null,
        errorCode: null,
        errorMessage: null,
        retryable: false,
        lastEventAt: now,
        timeoutAt: new Date(now.getTime() + DEFAULT_DEV_TIMEOUT_MS),
      },
    });

    await this.appendEvent(updated.id, ConversationWorkEventType.resumed, {
      summary: '已收到补充信息，恢复处理。',
      sourceRefId: input.newRunId,
      payload: {
        newRunId: input.newRunId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        ...(previousRunId ? { previousRunId } : {}),
      },
    });
    await this.appendEvent(updated.id, ConversationWorkEventType.queued, {
      summary: '恢复后的任务已重新进入后台队列',
      sourceRefId: input.newRunId,
    });

    return {
      userMessage,
      assistantMessage,
      workItem: this.toDto(updated),
    };
  }

  async listByConversation(conversationId: string): Promise<ConversationWorkItemDto[]> {
    const items = await this.prisma.conversationWorkItem.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    return this.toDtos(items);
  }

  async findByConversationAndId(
    conversationId: string,
    workItemId: string,
  ): Promise<ConversationWorkItemDto | null> {
    const item = await this.prisma.conversationWorkItem.findFirst({
      where: { id: workItemId, conversationId },
    });
    if (!item) return null;
    const related = await this.prisma.conversationWorkItem.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    return this.toDtos(related).find((entry) => entry.id === item.id) ?? null;
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

      const updated = await this.prisma.conversationWorkItem.update({
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
      this.publish(this.toDto(updated));

      await this.appendEvent(item.id, ConversationWorkEventType.result_projected, {
        summary: '超时结果已回流到原会话',
        sourceRefId: item.sourceRefId ?? undefined,
        payload: {
          resultMessageId: resultMessage.id,
        },
      });
    }

    const activeItems = await this.prisma.conversationWorkItem.findMany({
      where: {
        status: {
          in: [
            ConversationWorkStatus.accepted,
            ConversationWorkStatus.queued,
            ConversationWorkStatus.running,
            ConversationWorkStatus.waiting_input,
          ],
        },
      },
      take: 100,
      orderBy: { updatedAt: 'desc' },
    });
    for (const item of activeItems) {
      this.publish(this.toDto(item));
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
    closureContractJson?: Prisma.JsonValue | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastEventAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ConversationWorkItemDto {
    const parentWorkItemId = this.readParentWorkItemId(item.closureContractJson ?? null);
    const health = this.resolveHealthState({
      status: item.status,
      lastEventAt: item.lastEventAt,
      timeoutAt: item.timeoutAt,
      createdAt: item.createdAt,
      waitingQuestion: item.waitingQuestion,
    });
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
      parentWorkItemId,
      childCount: 0,
      activeChildCount: 0,
      healthState: health.state,
      healthSummary: health.summary,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toDtos(items: Array<{
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
    closureContractJson?: Prisma.JsonValue | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastEventAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>): ConversationWorkItemDto[] {
    const childCounts = new Map<string, number>();
    const activeChildCounts = new Map<string, number>();

    for (const item of items) {
      const parentWorkItemId = this.readParentWorkItemId(item.closureContractJson ?? null);
      if (!parentWorkItemId) continue;
      childCounts.set(parentWorkItemId, (childCounts.get(parentWorkItemId) ?? 0) + 1);
      if (!this.isTerminalStatus(item.status)) {
        activeChildCounts.set(parentWorkItemId, (activeChildCounts.get(parentWorkItemId) ?? 0) + 1);
      }
    }

    return items.map((item) => {
      const dto = this.toDto(item);
      return {
        ...dto,
        childCount: childCounts.get(item.id) ?? 0,
        activeChildCount: activeChildCounts.get(item.id) ?? 0,
      };
    });
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

  private publish(item: ConversationWorkItemDto): ConversationWorkItemDto {
    this.updates$.next(item);
    return item;
  }

  private readParentWorkItemId(value: Prisma.JsonValue | null | undefined): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const candidate = (value as Record<string, unknown>).parentWorkItemId;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  }

  private resolveHealthState(input: {
    status: ConversationWorkStatus;
    lastEventAt: Date | null;
    timeoutAt: Date | null;
    createdAt: Date;
    waitingQuestion: string | null;
  }): { state: ConversationWorkHealthState; summary: string | null } {
    if (input.status === ConversationWorkStatus.timed_out) {
      return { state: 'timed_out', summary: '这件事已经超时，我这边不会继续空等。' };
    }
    if (input.status === ConversationWorkStatus.waiting_input) {
      return {
        state: 'waiting_user',
        summary: input.waitingQuestion?.trim() || '等你补充一下，我就继续处理。',
      };
    }
    if (this.isTerminalStatus(input.status)) {
      return { state: 'normal', summary: null };
    }

    const now = Date.now();
    const baseline = input.lastEventAt?.getTime() ?? input.createdAt.getTime();
    const ageMs = Math.max(0, now - baseline);
    if (input.timeoutAt && input.timeoutAt.getTime() <= now) {
      return { state: 'timed_out', summary: '这件事已经超过预计时限。' };
    }

    const attentionMs = input.status === ConversationWorkStatus.running
      ? RUNNING_ATTENTION_MS
      : ACCEPTED_ATTENTION_MS;
    const stalledMs = input.status === ConversationWorkStatus.running
      ? RUNNING_STALLED_MS
      : ACCEPTED_STALLED_MS;

    if (ageMs >= stalledMs) {
      return {
        state: 'stalled',
        summary: input.status === ConversationWorkStatus.running
          ? '处理卡住得有点久，我还在继续跟进。'
          : '排队时间有点久，我还在继续推进。',
      };
    }
    if (ageMs >= attentionMs) {
      return {
        state: 'attention',
        summary: input.status === ConversationWorkStatus.running
          ? '处理时间比平时久一些，我还在继续跟进。'
          : '这件事还在排队，我会继续盯着。',
      };
    }

    return { state: 'normal', summary: null };
  }

  private async resolveParentWorkItemId(originMessageId?: string | null): Promise<string | null> {
    if (!originMessageId?.trim()) {
      return null;
    }
    const message = await this.prisma.message.findUnique({
      where: { id: originMessageId.trim() },
      select: { metadata: true },
    });
    if (!message?.metadata || typeof message.metadata !== 'object' || Array.isArray(message.metadata)) {
      return null;
    }
    const workItemId = (message.metadata as Record<string, unknown>).workItemId;
    return typeof workItemId === 'string' && workItemId.trim() ? workItemId.trim() : null;
  }
}
