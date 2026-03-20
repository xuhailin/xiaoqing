import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import type { WorldStateUpdate } from '../../infra/world-state/world-state.types';
import { DEFAULT_ENTRY_AGENT_ID, type EntryAgentId } from '../../gateway/message-router.types';

@Controller('conversations')
export class ConversationController {
  constructor(private conversation: ConversationService) {}

  @Get()
  async list() {
    return this.conversation.list();
  }

  @Post()
  async create(
    @Body() body?: { entryAgentId?: EntryAgentId },
  ) {
    return this.conversation.create(body?.entryAgentId ?? DEFAULT_ENTRY_AGENT_ID);
  }

  @Get('current')
  async getOrCreateCurrent(
    @Query('entryAgentId') entryAgentId?: EntryAgentId,
  ) {
    return this.conversation.getOrCreateCurrent(entryAgentId ?? DEFAULT_ENTRY_AGENT_ID);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string) {
    return this.conversation.getMessages(id);
  }

  @Get(':id/work-items')
  async getWorkItems(@Param('id') id: string) {
    return this.conversation.listWorkItems(id);
  }

  @Get(':id/work-items/:workItemId')
  async getWorkItem(
    @Param('id') id: string,
    @Param('workItemId') workItemId: string,
  ) {
    return this.conversation.getWorkItem(id, workItemId);
  }

  @Get(':id/daily-moments')
  async listDailyMoments(@Param('id') id: string) {
    return this.conversation.listDailyMoments(id);
  }

  // POST :id/messages 已迁移至 GatewayController（统一入口 + 路由）

  /** 获取该会话的默认世界状态（地点/时区/语言等），用于展示或意图补全 */
  @Get(':id/world-state')
  async getWorldState(@Param('id') id: string) {
    return this.conversation.getWorldState(id);
  }

  /** 更新该会话的默认世界状态（覆盖指定字段），可由设置页或用户声明后同步 */
  @Patch(':id/world-state')
  async updateWorldState(
    @Param('id') id: string,
    @Body() body: WorldStateUpdate,
  ) {
    return this.conversation.updateWorldState(id, body ?? {});
  }

  /** D1: 获取该会话的 token 用量统计 */
  @Get(':id/token-stats')
  async getTokenStats(@Param('id') id: string) {
    return this.conversation.getTokenStats(id);
  }

  @Post(':id/daily-moments/:recordId/feedback')
  async saveDailyMomentFeedback(
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() body: { feedback: 'like' | 'neutral' | 'awkward' | 'ignored' },
  ) {
    if (!body?.feedback) {
      return { error: 'feedback is required' };
    }
    return this.conversation.saveDailyMomentFeedback(id, recordId, body.feedback);
  }

  /** 切换会话时兜底总结：未总结消息 >= 5 条则异步触发 */
  @Post(':id/flush-summarize')
  async flushSummarize(@Param('id') id: string) {
    return this.conversation.flushSummarize(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.conversation.delete(id);
  }
}
