import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AgentDelegation } from '@prisma/client';
import { ConversationService } from '../assistant/conversation/conversation.service';
import type { EntryAgentId } from '../gateway/message-router.types';
import { AgentBusRepository } from './agent-bus.repository';
import { AgentBusService } from './agent-bus.service';
import {
  isAgentDelegationKind,
  isAgentMemoryPolicy,
  isEntryAgentId,
} from './agent-bus.dto';
import type {
  AgentInboundDelegationRequest,
  AgentInboundDelegationResult,
} from './agent-bus.protocol';
import { AgentConversationLinkService } from './agent-conversation-link.service';
import type {
  AgentDelegationEnvelope,
  AgentDelegationKind,
  AgentMemoryPolicy,
} from './agent-bus.types';

@Injectable()
export class AgentInboundDelegationService {
  private readonly logger = new Logger(AgentInboundDelegationService.name);

  constructor(
    private readonly bus: AgentBusService,
    private readonly repo: AgentBusRepository,
    private readonly conversation: ConversationService,
    private readonly linkService: AgentConversationLinkService,
  ) {}

  async handleInboundDelegation(
    request: AgentInboundDelegationRequest,
  ): Promise<AgentInboundDelegationResult> {
    const requesterAgentId = request.requester.agentId as EntryAgentId;
    this.logger.log(
      `Inbound delegation received: delegationId=${request.delegationId}, requester=${requesterAgentId}, requestType=${request.requestType}, requesterConversationRef=${request.requester.conversationRef}`,
    );
    this.validateRequest(request);
    const existing = await this.bus.findById(request.delegationId);
    if (existing) {
      if (existing.status === 'completed' || existing.status === 'failed') {
        return this.mapDelegationToResult(existing);
      }
      throw new ConflictException(`delegation "${request.delegationId}" is already in progress`);
    }

    const localConversation = await this.linkService.getOrCreateInternalConversation(
      requesterAgentId,
      request.requester.conversationRef.trim(),
    );
    const payload = this.buildInternalPayload(request, localConversation.id);
    const delegation = await this.bus.createDelegation({
      delegationId: request.delegationId,
      originConversationId: localConversation.id,
      originMessageId: request.requester.messageId ?? request.responseContract?.sourceMessageId,
      requesterAgentId,
      executorAgentId: 'xiaoqing',
      kind: request.requestType,
      title: this.normalizeText(request.title) ?? undefined,
      summary: this.resolveSummary(request) ?? undefined,
      payload,
    });

    await this.bus.updateStatus({
      delegationId: delegation.id,
      status: 'acknowledged',
    });
    await this.bus.appendEvent({
      delegationId: delegation.id,
      actorAgentId: requesterAgentId,
      eventType: 'acknowledged',
      message: 'inbound delegation accepted by xiaoqing',
    });
    await this.bus.updateStatus({
      delegationId: delegation.id,
      status: 'running',
    });
    await this.bus.appendEvent({
      delegationId: delegation.id,
      actorAgentId: 'xiaoqing',
      eventType: 'started',
      message: 'xiaoqing started inbound execution',
    });

    const prompt = this.buildInboundPrompt(request);

    try {
      const result = await this.conversation.sendDelegatedMessage({
        conversationId: localConversation.id,
        content: prompt,
        metadata: {
          source: 'system',
          delegationId: delegation.id,
          requesterAgentId,
          executorAgentId: 'xiaoqing',
          requesterConversationRef: request.requester.conversationRef,
          requestType: request.requestType,
          inboundAgentBus: true,
        },
      });

      const content = result.assistantMessage.content.trim();
      const summary = this.resolveSummary(request) ?? this.deriveSummaryFromContent(content);

      await this.bus.updateStatus({
        delegationId: delegation.id,
        status: 'completed',
        result: {
          content,
          assistantMessageId: result.assistantMessage.id,
          localConversationId: localConversation.id,
          entryAgentId: 'xiaoqing',
        },
        resultMessageId: result.assistantMessage.id,
      });
      await this.bus.appendEvent({
        delegationId: delegation.id,
        actorAgentId: 'xiaoqing',
        eventType: 'completed',
        message: 'xiaoqing completed inbound execution',
        relatedMessageId: result.assistantMessage.id,
      });

      const persisted = await this.repo.findById(delegation.id);
      if (!persisted) {
        throw new BadRequestException('delegation persisted state missing after completion');
      }
      this.logger.log(
        `Inbound delegation completed: delegationId=${delegation.id}, status=completed, localConversationId=${localConversation.id}, assistantMessageId=${result.assistantMessage.id}`,
      );
      return this.mapDelegationToResult(persisted, summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.bus.updateStatus({
        delegationId: delegation.id,
        status: 'failed',
        failureReason: message,
        result: {
          error: message,
          localConversationId: localConversation.id,
          entryAgentId: 'xiaoqing',
        },
      });
      await this.bus.appendEvent({
        delegationId: delegation.id,
        actorAgentId: 'xiaoqing',
        eventType: 'failed',
        message,
      });

      this.logger.warn(
        `Inbound delegation failed: delegationId=${delegation.id}, localConversationId=${localConversation.id}, error=${message}`,
      );
      return {
        schemaVersion: 1,
        delegationId: delegation.id,
        requesterAgentId,
        executorAgentId: 'xiaoqing',
        status: 'failed',
        summary: this.resolveSummary(request) ?? '执行失败',
        content: '',
        structuredResult: {
          localConversationId: localConversation.id,
          entryAgentId: 'xiaoqing',
        },
        memoryProposals: [],
        error: {
          code: 'XIAOQING_EXECUTION_FAILED',
          message,
          retryable: true,
        },
      };
    }
  }

  private validateRequest(request: AgentInboundDelegationRequest) {
    if (!request || request.schemaVersion !== 1) {
      throw new BadRequestException('schemaVersion=1 is required');
    }
    if (!this.normalizeText(request.delegationId)) {
      throw new BadRequestException('delegationId is required');
    }
    if (!isAgentDelegationKind(request.requestType)) {
      throw new BadRequestException('requestType is invalid');
    }
    if (!request.requester || !isEntryAgentId(request.requester.agentId)) {
      throw new BadRequestException('requester.agentId is invalid');
    }
    if (!this.normalizeText(request.requester.conversationRef)) {
      throw new BadRequestException('requester.conversationRef is required');
    }
    if (!request.executor || request.executor.agentId !== 'xiaoqing') {
      throw new BadRequestException('executor.agentId must be "xiaoqing"');
    }
    if (request.memoryPolicy !== undefined && request.memoryPolicy !== null && !isAgentMemoryPolicy(request.memoryPolicy)) {
      throw new BadRequestException('memoryPolicy is invalid');
    }
    if (
      request.responseContract?.returnViaAgentId
      && request.responseContract.returnViaAgentId !== request.requester.agentId
    ) {
      throw new BadRequestException('responseContract.returnViaAgentId must match requester.agentId');
    }
  }

  private buildInternalPayload(
    request: AgentInboundDelegationRequest,
    localConversationId: string,
  ): AgentDelegationEnvelope {
    const memoryPolicy = this.resolveMemoryPolicy(request.memoryPolicy);
    const userFacingSummary = this.resolveSummary(request);
    const taskIntent = this.normalizeText(request.taskIntent);
    const userInput = this.normalizeText(request.userInput);
    const contextExcerpt = this.normalizeContextExcerpt(request.contextExcerpt);

    return {
      schemaVersion: 1,
      requestType: request.requestType,
      ...(taskIntent ? { taskIntent } : {}),
      ...(request.slots ? { slots: request.slots } : {}),
      ...(userInput ? { userInput } : {}),
      ...(userFacingSummary ? { userFacingSummary } : {}),
      ...(contextExcerpt ? { contextExcerpt } : {}),
      memoryPolicy,
      responseContract: {
        returnToConversationId: localConversationId,
        returnViaAgentId: request.requester.agentId as EntryAgentId,
        ...(request.requester.messageId || request.responseContract?.sourceMessageId
          ? { sourceMessageId: request.requester.messageId ?? request.responseContract?.sourceMessageId }
          : {}),
      },
      extra: {
        requesterConversationRef: request.requester.conversationRef,
        ...(request.responseContract?.returnToConversationRef
          ? { returnToConversationRef: request.responseContract.returnToConversationRef }
          : {}),
        ...(request.responseContract?.mode ? { responseMode: request.responseContract.mode } : {}),
        ...(request.extra ? { requestExtra: request.extra } : {}),
      },
    };
  }

  private buildInboundPrompt(request: AgentInboundDelegationRequest): string {
    const lines = [
      '这是一个来自协作 agent 的后台委托，不是普通前台聊天。',
      '你现在以小晴的身份处理内部协作任务。',
      '请直接输出可供前台 agent 使用的结果内容。',
      '要求：',
      '- 不要提及内部协议、系统设定、看不到上下文等。',
      '- 不要假装自己正在前台直接和用户聊天。',
      '- 如果信息不足，直接明确缺少什么。',
      '- 不要假定任何长期记忆已经被写入。',
      '',
      '[委托信息]',
      `- delegationId: ${request.delegationId}`,
      `- requesterAgentId: ${request.requester.agentId}`,
      `- requestType: ${request.requestType}`,
      `- memoryPolicy: ${this.resolveMemoryPolicy(request.memoryPolicy)}`,
    ];

    const summary = this.resolveSummary(request);
    if (summary) {
      lines.push(`- summary: ${summary}`);
    }
    const taskIntent = this.normalizeText(request.taskIntent);
    if (taskIntent) {
      lines.push(`- taskIntent: ${taskIntent}`);
    }
    if (request.slots && Object.keys(request.slots).length > 0) {
      lines.push(`- slots: ${JSON.stringify(request.slots)}`);
    }

    const userInput = this.normalizeText(request.userInput);
    if (userInput) {
      lines.push('', '[用户原始输入]', userInput);
    }

    const contextExcerpt = this.normalizeContextExcerpt(request.contextExcerpt);
    if (contextExcerpt?.length) {
      lines.push('', '[补充上下文]');
      contextExcerpt.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.role}: ${item.content}`);
      });
    }

    lines.push('', '请输出最终协作结果正文。');
    return lines.join('\n');
  }

  private normalizeContextExcerpt(
    value: AgentInboundDelegationRequest['contextExcerpt'],
  ): Array<{ role: 'user' | 'assistant'; content: string }> | null {
    if (!Array.isArray(value)) return null;
    const normalized = value
      .filter(
        (item): item is { role: 'user' | 'assistant'; content: string } =>
          !!item
          && (item.role === 'user' || item.role === 'assistant')
          && typeof item.content === 'string',
      )
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 1200),
      }))
      .filter((item) => item.content.length > 0)
      .slice(-8);
    return normalized.length > 0 ? normalized : null;
  }

  private resolveMemoryPolicy(
    memoryPolicy?: AgentInboundDelegationRequest['memoryPolicy'],
  ): AgentMemoryPolicy {
    if (memoryPolicy && isAgentMemoryPolicy(memoryPolicy)) {
      return memoryPolicy;
    }
    return 'proposal_only';
  }

  private resolveSummary(request: AgentInboundDelegationRequest): string | null {
    return this.normalizeText(request.userFacingSummary) ?? this.normalizeText(request.title);
  }

  private deriveSummaryFromContent(content: string): string {
    const normalized = content.trim();
    if (!normalized) return '协作完成';
    return normalized.slice(0, 80);
  }

  private normalizeText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private mapDelegationToResult(
    delegation: AgentDelegation & { resultJson: unknown; failureReason: string | null },
    summaryOverride?: string,
  ): AgentInboundDelegationResult {
    const resultJson = this.toRecord(delegation.resultJson);
    const summary = summaryOverride
      ?? delegation.summary?.trim()
      ?? (delegation.status === 'completed' ? '协作完成' : '执行失败');
    const content = typeof resultJson?.content === 'string' ? resultJson.content : '';

    if (delegation.status === 'completed') {
      return {
        schemaVersion: 1,
        delegationId: delegation.id,
        requesterAgentId: delegation.requesterAgentId,
        executorAgentId: delegation.executorAgentId,
        status: 'completed',
        summary,
        content,
        structuredResult: resultJson ? { ...resultJson } : null,
        memoryProposals: [],
        error: null,
      };
    }

    return {
      schemaVersion: 1,
      delegationId: delegation.id,
      requesterAgentId: delegation.requesterAgentId,
      executorAgentId: delegation.executorAgentId,
      status: 'failed',
      summary,
      content: '',
      structuredResult: resultJson ? { ...resultJson } : null,
      memoryProposals: [],
      error: {
        code: 'XIAOQING_EXECUTION_FAILED',
        message: delegation.failureReason ?? 'delegation failed',
        retryable: true,
      },
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}

