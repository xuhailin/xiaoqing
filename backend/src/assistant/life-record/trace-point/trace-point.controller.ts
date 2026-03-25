import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { TracePointService } from './trace-point.service';
import { TracePointExtractorService } from './trace-point-extractor.service';
import type { TracePointKind } from './trace-point.types';

@Controller('trace-points')
export class TracePointController {
  constructor(
    private readonly tracePointService: TracePointService,
    private readonly extractor: TracePointExtractorService,
  ) {}

  /** 全局查询（跨会话） */
  @Get()
  async query(
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tracePointService.query({
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      kind: kind as TracePointKind | undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** 统计 trace points 数量（跨会话） */
  @Get('count')
  async count(
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('kind') kind?: string,
    @Query('conversationId') conversationId?: string,
  ) {
    const total = await this.tracePointService.count({
      conversationId,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      kind: kind as TracePointKind | undefined,
    });
    return { total };
  }

  /** 按会话查询 */
  @Get('conversation/:conversationId')
  async queryByConversation(
    @Param('conversationId') conversationId: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tracePointService.query({
      conversationId,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      kind: kind as TracePointKind | undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** 统计某会话的 trace point 数量 */
  @Get('conversation/:conversationId/count')
  async countByConversation(@Param('conversationId') conversationId: string) {
    const count = await this.tracePointService.countByConversation(conversationId);
    return { count };
  }

  /** 按天分组查询 */
  @Get('by-day')
  async queryByDay(
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('conversationId') conversationId?: string,
  ) {
    return this.tracePointService.queryByDay({
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      conversationId: conversationId || undefined,
    });
  }

  /** 获取某天的所有 trace points */
  @Get('day/:dayKey')
  async getPointsForDay(@Param('dayKey') dayKey: string) {
    return this.tracePointService.getPointsForDay(dayKey);
  }

  /** 手动触发某会话的批量提取 */
  @Post('extract/:conversationId')
  async extractFromConversation(
    @Param('conversationId') conversationId: string,
    @Body() body?: { since?: string; until?: string },
  ) {
    const result = await this.extractor.extractFromConversation(conversationId, {
      since: body?.since ? new Date(body.since) : undefined,
      until: body?.until ? new Date(body.until) : undefined,
    });
    return result;
  }

  /** 手动触发回填 */
  @Post('backfill')
  async backfill(@Body() body?: { days?: number; conversationId?: string }) {
    const result = await this.extractor.backfill({
      days: body?.days,
      conversationId: body?.conversationId,
    });
    return result;
  }

  /** 对某天的碎片去重 */
  @Post('deduplicate/:dayKey')
  async deduplicateDay(@Param('dayKey') dayKey: string) {
    return this.tracePointService.deduplicateDay(dayKey);
  }

  /** 批量去重最近 N 天 */
  @Post('deduplicate-recent')
  async deduplicateRecent(@Body() body?: { days?: number }) {
    return this.tracePointService.deduplicateRecent(body?.days);
  }
}
