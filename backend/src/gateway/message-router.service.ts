import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../infra/llm/llm.service';
import { IntentService } from '../assistant/intent/intent.service';
import type { MessageChannel, RouteDecision } from './message-router.types';

@Injectable()
export class MessageRouterService {
  private readonly logger = new Logger(MessageRouterService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly intentService: IntentService,
  ) {}

  /**
   * 消息路由判定，优先级：显式 mode > 前缀命令 > LLM 意图分类。
   */
  async route(content: string, mode?: MessageChannel): Promise<RouteDecision> {
    // 1. 显式模式优先
    if (mode === 'dev') {
      return { channel: 'dev', content, reason: 'explicit mode=dev' };
    }

    // 2. 隐式路由：/dev 或 /task 前缀
    if (content.startsWith('/dev ')) {
      return { channel: 'dev', content: content.slice(5), reason: 'prefix /dev' };
    }
    if (content.startsWith('/task ')) {
      return { channel: 'dev', content: content.slice(6), reason: 'prefix /task' };
    }

    // 3. LLM 意图路由（仅在未显式指定时启用）
    if (mode === undefined) {
      const intentChannel = await this.classifyIntent(content);
      if (intentChannel) {
        return { channel: intentChannel, content, reason: 'llm intent classification' };
      }
    }

    return { channel: 'chat', content, reason: 'default chat' };
  }

  /**
   * LLM 意图分类：判断消息是否属于 dev 任务。
   * 保守策略：只在高置信度时返回 dev，否则返回 null 让 chat 兜底。
   */
  private async classifyIntent(content: string): Promise<MessageChannel | null> {
    try {
      const intentState = await this.intentService.recognize([], content);

      if (intentState.taskIntent === 'dev_task' && intentState.confidence > 0.7) {
        this.logger.log(`Intent routing: dev_task (confidence=${intentState.confidence}) for "${content.slice(0, 50)}"`);
        return 'dev';
      }

      return null;
    } catch (err) {
      this.logger.warn(`Intent recognition failed, fallback to simple classification: ${err}`);
      return this.fallbackClassifyIntent(content);
    }
  }

  private async fallbackClassifyIntent(content: string): Promise<MessageChannel | null> {
    try {
      const response = await this.llm.generate([
        {
          role: 'system',
          content: `你是一个消息意图分类器。判断用户消息是"聊天"还是"开发任务"。

开发任务的特征：
- 明确要求执行 shell 命令、代码操作、文件管理
- 要求查看 git 状态、运行测试、构建项目等
- 要求部署、安装依赖、数据库操作等

聊天的特征：
- 日常对话、闲聊、情感交流
- 提问、讨论、请教建议
- 没有明确的技术执行指令

只回复一个单词：chat 或 dev。如果不确定，回复 chat。`,
        },
        { role: 'user', content },
      ], { scenario: 'reasoning' });

      const trimmed = response.trim().toLowerCase();
      if (trimmed === 'dev') {
        this.logger.log(`Fallback LLM intent: dev for "${content.slice(0, 50)}"`);
        return 'dev';
      }
      return null;
    } catch (err) {
      this.logger.warn(`Fallback classification failed: ${err}`);
      return null;
    }
  }
}
