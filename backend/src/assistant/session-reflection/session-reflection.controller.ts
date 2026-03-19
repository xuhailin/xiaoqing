import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { SessionReflectionService } from './session-reflection.service';
import type { RelationImpact } from './session-reflection.types';

@Controller('session-reflections')
export class SessionReflectionController {
  constructor(
    private readonly service: SessionReflectionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(
    @Query('conversationId') conversationId?: string,
    @Query('relationImpact') relationImpact?: string,
    @Query('sharedMomentOnly') sharedMomentOnly?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      conversationId: conversationId || undefined,
      relationImpact: relationImpact as RelationImpact | undefined,
      sharedMomentOnly: sharedMomentOnly === 'true',
      since: since ? new Date(since) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('shared-moments')
  async getSharedMomentCandidates(@Query('since') since?: string) {
    return this.service.getSharedMomentCandidates(
      since ? new Date(since) : undefined,
    );
  }

  /** 手动触发某会话的关系回顾（调试用） */
  @Post('reflect/:conversationId')
  async reflect(@Param('conversationId') conversationId: string) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { role: true, content: true },
    });

    if (messages.length === 0) {
      return { message: 'No messages found' };
    }

    const result = await this.service.reflect({
      conversationId,
      recentMessages: messages.reverse().map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return result ?? { message: 'Reflection skipped (too few messages or recently reflected)' };
  }
}
