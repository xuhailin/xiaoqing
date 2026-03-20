import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntryAgentId } from '../gateway/message-router.types';
import { ConversationWorkService } from '../conversation-work/conversation-work.service';
import { KeyedFifoQueueService } from '../infra/queue';
import { OpenClawService } from '../openclaw/openclaw.service';
import { parseDelegationResultFromText } from './agent-bus.protocol';
import { AgentBusRepository } from './agent-bus.repository';
import { AgentBusService } from './agent-bus.service';
import { MemoryProposalService } from './memory-proposal.service';
import type {
  AgentDelegationKind,
  AgentDelegationEnvelope,
  CreateAgentDelegationInput,
} from './agent-bus.types';

@Injectable()
export class AgentDelegationExecutorService {
  private readonly logger = new Logger(AgentDelegationExecutorService.name);
  private readonly xiaoqinOpenClawAgentId: string;

  constructor(
    private readonly bus: AgentBusService,
    private readonly repo: AgentBusRepository,
    private readonly memoryProposal: MemoryProposalService,
    private readonly openClaw: OpenClawService,
    private readonly queue: KeyedFifoQueueService,
    private readonly conversationWork: ConversationWorkService,
    config: ConfigService,
  ) {
    this.xiaoqinOpenClawAgentId = config.get<string>('XIAOQIN_OPENCLAW_AGENT_ID') || 'xiaoqin';
  }

  async createDelegationAndDispatch(
    input: CreateAgentDelegationInput & { autoDispatch?: boolean },
  ) {
    const delegation = await this.bus.createDelegation(input);
    const work = await this.conversationWork.createDelegationWorkItem({
      conversationId: input.originConversationId,
      delegationId: delegation.id,
      originMessageId: input.originMessageId,
      fromAgentId: input.requesterAgentId,
      toAgentId: input.executorAgentId,
      delegationKind: input.kind ?? input.payload.requestType,
      title: input.title,
      summary: input.summary ?? input.payload.userFacingSummary ?? null,
      userFacingGoal: input.payload.userFacingSummary ?? input.summary ?? input.payload.userInput ?? null,
    });
    const receiptMessage = work.receiptMessage;

    await this.bus.updateStatus({
      delegationId: delegation.id,
      status: 'acknowledged',
      receiptMessageId: receiptMessage.id,
    });

    await this.bus.appendEvent({
      delegationId: delegation.id,
      actorAgentId: input.requesterAgentId,
      eventType: 'acknowledged',
      message: 'delegation accepted by agent bus',
      payload: {
        receiptMessageId: receiptMessage.id,
      },
    });

    await this.bus.appendEvent({
      delegationId: delegation.id,
      actorAgentId: input.requesterAgentId,
      eventType: 'receipt_projected',
      message: 'receipt projected to conversation',
      relatedMessageId: receiptMessage.id,
    });

    if (input.autoDispatch !== false) {
      this.enqueueDelegation(delegation.id, input.originConversationId);
    }

    return this.bus.findById(delegation.id);
  }

  enqueueDelegation(delegationId: string, conversationId: string) {
    this.queue.enqueue(
      `agent-delegation:${conversationId}`,
      delegationId,
      async (itemId) => this.executeDelegation(itemId),
    );
  }

  async executeDelegation(delegationId: string) {
    const delegation = await this.repo.findById(delegationId);
    if (!delegation) {
      this.logger.warn(`Delegation not found: ${delegationId}`);
      return;
    }

    if (
      delegation.status === 'running'
      || delegation.status === 'completed'
      || delegation.status === 'failed'
      || delegation.status === 'cancelled'
    ) {
      return;
    }

    await this.bus.updateStatus({
      delegationId,
      status: 'running',
    });
    await this.conversationWork.markDelegationRunning(
      delegationId,
      `${this.getAgentLabel(delegation.executorAgentId as EntryAgentId)}已开始处理。`,
    );
    await this.bus.appendEvent({
      delegationId,
      actorAgentId: delegation.executorAgentId as EntryAgentId,
      eventType: 'started',
      message: 'delegation dispatch started',
      payload: {
        remoteSessionKey: this.buildRemoteSessionKey(delegationId),
      },
    });
    await this.conversationWork.markDelegationProgress(
      delegationId,
      `已把上下文发给${this.getAgentLabel(delegation.executorAgentId as EntryAgentId)}，等待处理结果。`,
    );

    const payload = delegation.payloadJson as unknown as AgentDelegationEnvelope;
    const delegationKind = (delegation.kind || payload.requestType) as AgentDelegationKind;
    const resolvedAgentId = this.resolveOpenClawAgentId(delegation.executorAgentId as EntryAgentId);

    if (!resolvedAgentId) {
      await this.failDelegation(delegationId, delegation.originConversationId, {
        requesterAgentId: delegation.requesterAgentId as EntryAgentId,
        executorAgentId: delegation.executorAgentId as EntryAgentId,
        delegationKind,
        reason: `executor ${delegation.executorAgentId} is not wired to OpenClaw`,
        relatedMessageId: delegation.receiptMessageId,
      });
      return;
    }

    const taskMessage = this.formatStructuredDelegationPayload({
      delegationId,
      requesterAgentId: delegation.requesterAgentId as EntryAgentId,
      executorAgentId: delegation.executorAgentId as EntryAgentId,
      kind: delegationKind,
      payload,
    });

    const result = await this.openClaw.delegateTask({
      agentId: resolvedAgentId,
      sessionKey: this.buildRemoteSessionKey(delegationId),
      message: taskMessage,
    });

    if (!result.success) {
      await this.failDelegation(delegationId, delegation.originConversationId, {
        requesterAgentId: delegation.requesterAgentId as EntryAgentId,
        executorAgentId: delegation.executorAgentId as EntryAgentId,
        delegationKind,
        reason: result.error ?? 'openclaw delegation failed',
        rawContent: result.content,
        relatedMessageId: delegation.receiptMessageId,
      });
      return;
    }

    // 尝试解析远端返回的结构化 Delegation Result
    const parsed = parseDelegationResultFromText(result.content, delegationId);
    if (parsed.parsed) {
      this.logger.log(`Parsed structured delegation result for ${delegationId}`);
    }

    const summary = parsed.result.summary?.trim()
      || delegation.summary?.trim()
      || payload.userFacingSummary?.trim()
      || null;
    const resultContent = (parsed.content || parsed.result.content || '').trim()
      || `${this.getAgentLabel(delegation.executorAgentId as EntryAgentId)}已完成委托，暂未返回文本结果。`;
    await this.conversationWork.markDelegationProgress(
      delegationId,
      parsed.parsed
        ? `${this.getAgentLabel(delegation.executorAgentId as EntryAgentId)}已返回结果，正在整理回复。`
        : `${this.getAgentLabel(delegation.executorAgentId as EntryAgentId)}已完成处理，正在回流结果。`,
    );

    // 如果远端标记为失败
    if (parsed.parsed && parsed.result.status === 'failed') {
      await this.failDelegation(delegationId, delegation.originConversationId, {
        requesterAgentId: delegation.requesterAgentId as EntryAgentId,
        executorAgentId: delegation.executorAgentId as EntryAgentId,
        delegationKind,
        reason: parsed.result.error?.message ?? 'remote executor reported failure',
        rawContent: resultContent,
        relatedMessageId: delegation.receiptMessageId,
      });
      return;
    }

    const resultProjection = await this.conversationWork.markDelegationCompleted({
      delegationId,
      fromAgentId: delegation.executorAgentId as EntryAgentId,
      toAgentId: delegation.requesterAgentId as EntryAgentId,
      delegationKind,
      content: resultContent,
      summary,
      relatedMessageId: delegation.receiptMessageId,
    });
    const resultMessage = resultProjection?.resultMessage;
    if (!resultMessage) {
      throw new Error(`work item missing for delegation result projection: ${delegationId}`);
    }

    await this.bus.updateStatus({
      delegationId,
      status: 'completed',
      result: {
        content: resultContent,
        openclawAgentId: result.agentId ?? resolvedAgentId,
        remoteSessionKey: this.buildRemoteSessionKey(delegationId),
        ...(parsed.result.structuredResult ? { structuredResult: parsed.result.structuredResult } : {}),
      },
      resultMessageId: resultMessage.id,
    });

    await this.bus.appendEvent({
      delegationId,
      actorAgentId: delegation.executorAgentId as EntryAgentId,
      eventType: 'completed',
      message: 'delegation completed',
      payload: {
        openclawAgentId: result.agentId ?? resolvedAgentId,
        remoteSessionKey: this.buildRemoteSessionKey(delegationId),
        parsedStructured: parsed.parsed,
      },
    });
    await this.bus.appendEvent({
      delegationId,
      actorAgentId: delegation.executorAgentId as EntryAgentId,
      eventType: 'result_projected',
      message: 'result projected to conversation',
      relatedMessageId: resultMessage.id,
    });

    // 处理 memoryProposals
    const proposals = parsed.result.memoryProposals ?? [];
    if (proposals.length > 0) {
      try {
        await this.memoryProposal.createFromDelegationResult(
          delegationId,
          proposals,
          delegation.executorAgentId as EntryAgentId,
        );
      } catch (err) {
        this.logger.warn(`Failed to process memory proposals for ${delegationId}: ${String(err)}`);
      }
    }
  }

  private async failDelegation(
    delegationId: string,
    conversationId: string,
    input: {
      requesterAgentId: EntryAgentId;
      executorAgentId: EntryAgentId;
      delegationKind?: CreateAgentDelegationInput['kind'];
      reason: string;
      rawContent?: string | null;
      relatedMessageId?: string | null;
    },
  ) {
    const failureText = `委托给${this.getAgentLabel(input.executorAgentId)}时失败了：${input.reason}`;
    const resultProjection = await this.conversationWork.markDelegationFailed({
      delegationId,
      fromAgentId: input.executorAgentId,
      toAgentId: input.requesterAgentId,
      delegationKind: input.delegationKind ?? 'assist_request',
      reason: input.reason,
      content: failureText,
      relatedMessageId: input.relatedMessageId,
    });
    const resultMessage = resultProjection?.resultMessage;
    if (!resultMessage) {
      throw new Error(`work item missing for delegation failure projection: ${delegationId}`);
    }

    await this.bus.updateStatus({
      delegationId,
      status: 'failed',
      failureReason: input.reason,
      result: {
        error: input.reason,
        content: input.rawContent ?? null,
        remoteSessionKey: this.buildRemoteSessionKey(delegationId),
      },
      resultMessageId: resultMessage.id,
    });
    await this.bus.appendEvent({
      delegationId,
      actorAgentId: input.executorAgentId,
      eventType: 'failed',
      message: input.reason,
      relatedMessageId: resultMessage.id,
      payload: {
        remoteSessionKey: this.buildRemoteSessionKey(delegationId),
      },
    });
    await this.bus.appendEvent({
      delegationId,
      actorAgentId: input.executorAgentId,
      eventType: 'result_projected',
      message: 'failed result projected to conversation',
      relatedMessageId: resultMessage.id,
    });
  }

  private resolveOpenClawAgentId(executorAgentId: EntryAgentId): string | null {
    if (executorAgentId === 'xiaoqin') {
      return this.xiaoqinOpenClawAgentId;
    }
    return null;
  }

  private formatStructuredDelegationPayload(input: {
    delegationId: string;
    requesterAgentId: EntryAgentId;
    executorAgentId: EntryAgentId;
    kind: string;
    payload: AgentDelegationEnvelope;
  }): string {
    return [
      'AGENT_DELEGATION_V1',
      JSON.stringify({
        delegationId: input.delegationId,
        requesterAgentId: input.requesterAgentId,
        executorAgentId: input.executorAgentId,
        kind: input.kind,
        payload: input.payload,
      }),
    ].join('\n');
  }

  private buildRemoteSessionKey(delegationId: string): string {
    return `agent-delegation:${delegationId}`;
  }

  private getAgentLabel(agentId: EntryAgentId): string {
    return agentId === 'xiaoqin' ? '小勤' : '小晴';
  }
}
