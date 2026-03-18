import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { EntryAgentId } from '../gateway/message-router.types';
import { AgentBusRepository } from './agent-bus.repository';
import { AgentBusService } from './agent-bus.service';
import { AgentDelegationProjectionService } from './agent-delegation-projection.service';
import { MemoryProposalService } from './memory-proposal.service';
import type {
  AgentInboundDelegationResult,
  AgentMemoryProposal,
} from './agent-bus.protocol';
import type { AgentDelegationKind } from './agent-bus.types';

/**
 * 处理外部 Agent 异步推送的 Delegation Result。
 *
 * 适用场景：小晴发起了一个 outbound delegation（小晴 → 小勤），
 * 但远端没有立即返回结果，而是后续通过
 * POST /agent-bus/inbound/results 推回结果。
 */
@Injectable()
export class AgentInboundResultService {
  private readonly logger = new Logger(AgentInboundResultService.name);

  constructor(
    private readonly bus: AgentBusService,
    private readonly repo: AgentBusRepository,
    private readonly projection: AgentDelegationProjectionService,
    private readonly memoryProposal: MemoryProposalService,
  ) {}

  async handleInboundResult(
    result: AgentInboundDelegationResult,
    callerAgentId: string,
  ) {
    this.validateResult(result);

    const delegation = await this.repo.findById(result.delegationId);
    if (!delegation) {
      throw new NotFoundException(`delegation "${result.delegationId}" not found`);
    }

    // 校验：结果的提交方必须是该 delegation 的 executor
    if (delegation.executorAgentId !== callerAgentId) {
      throw new BadRequestException(
        `caller "${callerAgentId}" is not the executor of delegation "${result.delegationId}"`,
      );
    }

    // 校验：delegation 必须处于可接收结果的状态
    if (delegation.status === 'completed' || delegation.status === 'failed') {
      this.logger.warn(
        `Delegation ${result.delegationId} already ${delegation.status}, returning existing result`,
      );
      return {
        accepted: false,
        delegationId: delegation.id,
        status: delegation.status,
        message: `delegation already ${delegation.status}`,
      };
    }

    if (delegation.status === 'cancelled') {
      return {
        accepted: false,
        delegationId: delegation.id,
        status: delegation.status,
        message: 'delegation was cancelled',
      };
    }

    const delegationKind = (delegation.kind || 'assist_request') as AgentDelegationKind;
    const executorAgentId = delegation.executorAgentId as EntryAgentId;
    const requesterAgentId = delegation.requesterAgentId as EntryAgentId;

    if (result.status === 'failed') {
      const failureReason = result.error?.message ?? 'remote executor reported failure';
      const failureContent = result.content?.trim()
        || `${this.getAgentLabel(executorAgentId)}执行失败：${failureReason}`;

      const resultMessage = await this.projection.projectResult({
        conversationId: delegation.originConversationId,
        delegationId: delegation.id,
        fromAgentId: executorAgentId,
        toAgentId: requesterAgentId,
        delegationKind,
        success: false,
        content: failureContent,
        summary: result.summary || failureReason,
        relatedMessageId: delegation.receiptMessageId,
      });

      await this.bus.updateStatus({
        delegationId: delegation.id,
        status: 'failed',
        failureReason,
        result: {
          content: failureContent,
          error: result.error,
        },
        resultMessageId: resultMessage.id,
      });
      await this.bus.appendEvent({
        delegationId: delegation.id,
        actorAgentId: executorAgentId,
        eventType: 'failed',
        message: failureReason,
        relatedMessageId: resultMessage.id,
      });

      return {
        accepted: true,
        delegationId: delegation.id,
        status: 'failed' as const,
        resultMessageId: resultMessage.id,
      };
    }

    // 成功路径
    const content = result.content?.trim()
      || `${this.getAgentLabel(executorAgentId)}已完成委托。`;
    const summary = result.summary?.trim() || delegation.summary?.trim() || null;

    const resultMessage = await this.projection.projectResult({
      conversationId: delegation.originConversationId,
      delegationId: delegation.id,
      fromAgentId: executorAgentId,
      toAgentId: requesterAgentId,
      delegationKind,
      success: true,
      content,
      summary,
      relatedMessageId: delegation.receiptMessageId,
    });

    await this.bus.updateStatus({
      delegationId: delegation.id,
      status: 'completed',
      result: {
        content,
        structuredResult: result.structuredResult,
        asyncCallback: true,
      },
      resultMessageId: resultMessage.id,
    });

    await this.bus.appendEvent({
      delegationId: delegation.id,
      actorAgentId: executorAgentId,
      eventType: 'completed',
      message: 'async result received',
      payload: { asyncCallback: true },
      relatedMessageId: resultMessage.id,
    });
    await this.bus.appendEvent({
      delegationId: delegation.id,
      actorAgentId: executorAgentId,
      eventType: 'result_projected',
      message: 'result projected to conversation',
      relatedMessageId: resultMessage.id,
    });

    // 处理 memoryProposals
    const proposals = result.memoryProposals ?? [];
    if (proposals.length > 0) {
      try {
        await this.memoryProposal.createFromDelegationResult(
          delegation.id,
          proposals,
          executorAgentId,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to process memory proposals for ${delegation.id}: ${String(err)}`,
        );
      }
    }

    return {
      accepted: true,
      delegationId: delegation.id,
      status: 'completed' as const,
      resultMessageId: resultMessage.id,
      memoryProposalsCount: proposals.length,
    };
  }

  private validateResult(result: AgentInboundDelegationResult) {
    if (!result || result.schemaVersion !== 1) {
      throw new BadRequestException('schemaVersion=1 is required');
    }
    if (!result.delegationId?.trim()) {
      throw new BadRequestException('delegationId is required');
    }
    if (result.status !== 'completed' && result.status !== 'failed') {
      throw new BadRequestException('status must be "completed" or "failed"');
    }
  }

  private getAgentLabel(agentId: EntryAgentId): string {
    return agentId === 'xiaoqin' ? '小勤' : '小晴';
  }
}
