import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ConversationService } from './conversation.service';
import type { WorldStateUpdate } from '../../infra/world-state/world-state.types';
import { DEFAULT_ENTRY_AGENT_ID, type EntryAgentId } from '../../gateway/message-router.types';
import { ConversationWorkService } from '../../conversation-work/conversation-work.service';
import { UserId } from '../../infra/user-id.decorator';

@Controller('conversations')
export class ConversationController {
  constructor(
    private conversation: ConversationService,
    private readonly conversationWork: ConversationWorkService,
  ) {}

  @Get()
  async list(@UserId() userId: string) {
    return this.conversation.list(userId);
  }

  @Get('collaboration-threads')
  async listCollaborationThreads(
    @Query('requesterAgentId') requesterAgentId?: EntryAgentId,
  ) {
    return this.conversation.listCollaborationThreads(requesterAgentId);
  }

  @Post()
  async create(
    @Body() body?: { entryAgentId?: EntryAgentId },
    @UserId() userId?: string,
  ) {
    return this.conversation.create(userId ?? 'default-user', body?.entryAgentId ?? DEFAULT_ENTRY_AGENT_ID);
  }

  @Get('current')
  async getOrCreateCurrent(
    @Query('entryAgentId') entryAgentId?: EntryAgentId,
    @UserId() userId?: string,
  ) {
    return this.conversation.getOrCreateCurrent(userId ?? 'default-user', entryAgentId ?? DEFAULT_ENTRY_AGENT_ID);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @UserId() userId: string) {
    return this.conversation.getMessages(id, userId);
  }

  @Get(':id/work-items')
  async getWorkItems(@Param('id') id: string, @UserId() userId: string) {
    return this.conversation.listWorkItems(id, userId);
  }

  @Sse(':id/work-items/stream')
  workItemStream(@Param('id') id: string): Observable<MessageEvent> {
    return this.conversationWork.streamByConversation(id).pipe(
      map((item) => ({
        data: item,
      }) as MessageEvent),
    );
  }

  @Get(':id/work-items/:workItemId')
  async getWorkItem(
    @Param('id') id: string,
    @Param('workItemId') workItemId: string,
    @UserId() userId: string,
  ) {
    return this.conversation.getWorkItem(id, workItemId, userId);
  }

  @Get(':id/daily-moments')
  async listDailyMoments(@Param('id') id: string, @UserId() userId: string) {
    return this.conversation.listDailyMoments(id, userId);
  }

  // POST :id/messages 已迁移至 GatewayController（统一入口 + 路由）

  /** 获取该会话的默认世界状态（地点/时区/语言等），用于展示或意图补全 */
  @Get(':id/world-state')
  async getWorldState(@Param('id') id: string, @UserId() userId: string) {
    return this.conversation.getWorldState(id, userId);
  }

  /** 更新该会话的默认世界状态（覆盖指定字段），可由设置页或用户声明后同步 */
  @Patch(':id/world-state')
  async updateWorldState(
    @Param('id') id: string,
    @Body() body: WorldStateUpdate,
    @UserId() userId: string,
  ) {
    return this.conversation.updateWorldState(id, body ?? {}, userId);
  }

  /** D1: 获取该会话的 token 用量统计 */
  @Get(':id/token-stats')
  async getTokenStats(@Param('id') id: string, @UserId() userId: string) {
    return this.conversation.getTokenStats(id, userId);
  }

  @Post(':id/daily-moments/:recordId/feedback')
  async saveDailyMomentFeedback(
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() body: { feedback: 'like' | 'neutral' | 'awkward' | 'ignored' },
    @UserId() userId: string,
  ) {
    if (!body?.feedback) {
      return { error: 'feedback is required' };
    }
    return this.conversation.saveDailyMomentFeedback(id, recordId, body.feedback, userId);
  }

  /** 切换会话时兜底总结：未总结消息 >= 5 条则异步触发 */
  @Post(':id/flush-summarize')
  async flushSummarize(@Param('id') id: string, @UserId() userId: string) {
    return this.conversation.flushSummarize(id, userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @UserId() userId: string) {
    return this.conversation.delete(id, userId);
  }
}
