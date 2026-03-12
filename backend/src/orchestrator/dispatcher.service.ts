import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessageRouterService } from '../gateway/message-router.service';
import { ConversationLockService } from './conversation-lock.service';
import type { IAgent, AgentRequest, AgentResult } from './agent.interface';
import { AGENT_TOKEN } from './agent.interface';
import type { MessageChannel } from '../gateway/message-router.types';

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

  constructor(
    private readonly router: MessageRouterService,
    private readonly lock: ConversationLockService,
    @Inject(AGENT_TOKEN) agents: IAgent[],
  ) {
    // 构建 channel → agent 映射
    this.agentMap = new Map(agents.map((a) => [a.channel, a]));
    this.logger.log(
      `Dispatcher initialized with agents: [${[...this.agentMap.keys()].join(', ')}]`,
    );
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
  ): Promise<AgentResult> {
    // 1. 路由
    const decision = await this.router.route(content, mode);
    this.logger.log(
      `Dispatch: conv=${conversationId} channel=${decision.channel} reason="${decision.reason}"`,
    );

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
      const req: AgentRequest = {
        conversationId,
        content: decision.content,
        mode: decision.channel,
      };
      return await agent.handle(req);
    } finally {
      release();
    }
  }
}
