import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntryAgentId } from '../gateway/message-router.types';
import { KeyedFifoQueueService } from '../infra/queue';
import { OpenClawService } from '../openclaw/openclaw.service';
import { AgentBusRepository } from './agent-bus.repository';
import { AgentBusService } from './agent-bus.service';
import { AgentDelegationProjectionService } from './agent-delegation-projection.service';
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
    private readonly projection: AgentDelegationProjectionService,
    private readonly openClaw: OpenClawService,
    private readonly queue: KeyedFifoQueueService,
    config: ConfigService,
  ) {
    this.xiaoqinOpenClawAgentId = config.get<string>('XIAOQIN_OPENCLAW_AGENT_ID') || 'xiaoqin';
  }

  async createDelegationAndDispatch(
    input: CreateAgentDelegationInput & { autoDispatch?: boolean },
  ) {
    const delegation = await this.bus.createDelegation(input);

    const receiptMessage = await this.projection.projectReceipt({
      conversationId: input.originConversationId,
      delegationId: delegation.id,
      fromAgentId: input.requesterAgentId,
      toAgentId: input.executorAgentId,
      delegationKind: input.kind ?? input.payload.requestType,
      summary: input.summary ?? input.payload.userFacingSummary ?? null,
    });

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
    await this.bus.appendEvent({
      delegationId,
      actorAgentId: delegation.executorAgentId as EntryAgentId,
      eventType: 'started',
      message: 'delegation dispatch started',
      payload: {
        remoteSessionKey: this.buildRemoteSessionKey(delegationId),
      },
    });

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

    const summary = delegation.summary?.trim() || payload.userFacingSummary?.trim() || null;
    const resultContent = result.content.trim()
      || `${this.getAgentLabel(delegation.executorAgentId as EntryAgentId)}已完成委托，暂未返回文本结果。`;
    const resultMessage = await this.projection.projectResult({
      conversationId: delegation.originConversationId,
      delegationId,
      fromAgentId: delegation.executorAgentId as EntryAgentId,
      toAgentId: delegation.requesterAgentId as EntryAgentId,
      delegationKind,
      success: true,
      content: resultContent,
      summary,
      relatedMessageId: delegation.receiptMessageId,
    });

    await this.bus.updateStatus({
      delegationId,
      status: 'completed',
      result: {
        content: resultContent,
        openclawAgentId: result.agentId ?? resolvedAgentId,
        remoteSessionKey: this.buildRemoteSessionKey(delegationId),
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
      },
    });
    await this.bus.appendEvent({
      delegationId,
      actorAgentId: delegation.executorAgentId as EntryAgentId,
      eventType: 'result_projected',
      message: 'result projected to conversation',
      relatedMessageId: resultMessage.id,
    });
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
    const resultMessage = await this.projection.projectResult({
      conversationId,
      delegationId,
      fromAgentId: input.executorAgentId,
      toAgentId: input.requesterAgentId,
      delegationKind: input.delegationKind ?? 'assist_request',
      success: false,
      content: failureText,
      summary: input.reason,
      relatedMessageId: input.relatedMessageId,
    });

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
