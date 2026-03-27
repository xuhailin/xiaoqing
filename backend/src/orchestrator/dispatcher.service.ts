import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageRouterService } from '../gateway/message-router.service';
import { PrismaService } from '../infra/prisma.service';
import { ConversationLockService } from './conversation-lock.service';
import { ConversationWorkService } from '../conversation-work/conversation-work.service';
import type { IAgent, AgentRequest, AgentResult } from './agent.interface';
import { AGENT_TOKEN } from './agent.interface';
import { isFeatureEnabled } from '../config/feature-flags';
import { getAppUserMode } from '../infra/user-mode.config';
import {
  DEFAULT_ENTRY_AGENT_ID,
  type EntryAgentId,
  type MessageChannel,
  type SendMessageMetadata,
} from '../gateway/message-router.types';

// ──────────────────────────────────────────────
// DispatcherService
// 位于 gateway.controller 与各 agent 之间的调度层。
// 职责：路由判定 → 获取会话锁 → 委托 agent 执行。
//
// gateway.controller 只做 HTTP 解析，
// dispatcher 承担全部调度逻辑。
// ──────────────────────────────────────────────

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private readonly agentMap: Map<MessageChannel, IAgent>;
  private readonly appUserMode: string;

  constructor(
    private readonly router: MessageRouterService,
    private readonly lock: ConversationLockService,
    private readonly prisma: PrismaService,
    private readonly conversationWork: ConversationWorkService,
    private readonly config: ConfigService,
    @Inject(AGENT_TOKEN) agents: IAgent[],
  ) {
    // 构建 channel → agent 映射
    this.agentMap = new Map(agents.map((a) => [a.channel, a]));
    this.logger.log(
      `Dispatcher initialized with agents: [${[...this.agentMap.keys()].join(', ')}]`,
    );
    this.appUserMode = getAppUserMode(config);
  }

  /**
   * 统一调度入口。
   * 1. 路由判定（router.route）
   * 2. 获取 per-conversation 锁
   * 3. 委托对应 agent 处理
   */
  async dispatch(
    conversationId: string,
    content: string,
    mode?: MessageChannel,
    metadata?: SendMessageMetadata,
    entryAgentId?: EntryAgentId,
    userId: string = 'default-user',
  ): Promise<AgentResult> {
    const resumeTarget = await this.conversationWork.findLatestWaitingInputByConversation(conversationId);
    const shouldResumeDevWork = !mode
      && resumeTarget?.executorType === 'dev_run';
    const decision = shouldResumeDevWork
      ? {
        channel: 'dev' as const,
        content,
        reason: `resume waiting work item ${resumeTarget.id}`,
      }
      : await this.router.route(content, mode);
    this.logger.log(
      `Dispatch: conv=${conversationId} channel=${decision.channel} reason="${decision.reason}"`,
    );

    if (decision.channel === 'dev') {
      if (this.appUserMode === 'multi') {
        throw new HttpException('DevAgent is not available in multi-user mode', HttpStatus.FORBIDDEN);
      }
      if (!isFeatureEnabled(this.config, 'devAgent')) {
        throw new HttpException('DevAgent is disabled', HttpStatus.FORBIDDEN);
      }
    }

    // 2. 查找 agent
    const agent = this.agentMap.get(decision.channel);
    if (!agent) {
      throw new Error(
        `No agent registered for channel "${decision.channel}"`,
      );
    }

    // 3. 获取会话锁 → 执行
    const release = await this.lock.acquire(conversationId);
    try {
      const resolvedEntryAgentId = await this.resolveEntryAgentId(conversationId, entryAgentId);
      const req: AgentRequest = {
        conversationId,
        content: decision.content,
        userId,
        mode: decision.channel,
        entryAgentId: resolvedEntryAgentId,
        metadata: shouldResumeDevWork && resumeTarget
          ? {
            ...(metadata ?? {}),
            resumeWorkItemId: resumeTarget.id,
          }
          : metadata,
      };
      return await agent.handle(req);
    } finally {
      release();
    }
  }

  private async resolveEntryAgentId(
    conversationId: string,
    entryAgentId?: EntryAgentId,
  ): Promise<EntryAgentId> {
    if (entryAgentId) {
      return entryAgentId;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { entryAgentId: true },
    });

    return (conversation?.entryAgentId as EntryAgentId | undefined) ?? DEFAULT_ENTRY_AGENT_ID;
  }
}
