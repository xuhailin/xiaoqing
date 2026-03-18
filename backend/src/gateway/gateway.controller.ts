import { Body, Controller, Param, Post } from '@nestjs/common';
import { DispatcherService } from '../orchestrator/dispatcher.service';
import type { SendMessageBody } from './message-router.types';

@Controller('conversations')
export class GatewayController {
  constructor(private readonly dispatcher: DispatcherService) {}

  /**
   * 统一消息入口。
   * controller 只做 HTTP 解析 + 参数校验，调度逻辑全部委托 dispatcher。
   */
  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageBody,
  ) {
    if (!body?.content || typeof body.content !== 'string') {
      return { error: 'content is required' };
    }

    const result = await this.dispatcher.dispatch(
      id,
      body.content.trim(),
      body.mode,
      body.metadata,
      body.entryAgentId,
    );

    // 返回 agent 原始 payload，保持前端兼容
    return result.payload;
  }
}
