import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { DailySummaryService } from './daily-summary.service';
import { UserId } from '../../../infra/user-id.decorator';

@Controller('daily-summaries')
export class DailySummaryController {
  constructor(private readonly dailySummaryService: DailySummaryService) {}

  /** 列出日摘要 */
  @Get()
  async list(
    @UserId() userId: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    return this.dailySummaryService.list(userId, {
      limit: limit ? Number(limit) : undefined,
      since: since || undefined,
      until: until || undefined,
    });
  }

  /** 获取某天的日摘要（含关联 TracePoints） */
  @Get(':dayKey')
  async getForDay(@UserId() userId: string, @Param('dayKey') dayKey: string) {
    const result = await this.dailySummaryService.getForDay(userId, dayKey);
    if (!result) return { error: 'not_found', dayKey };
    return result;
  }

  /** 为指定日期生成/重新生成日摘要 */
  @Post('generate/:dayKey')
  async generateForDay(@UserId() userId: string, @Param('dayKey') dayKey: string) {
    return this.dailySummaryService.generateForDay(userId, dayKey);
  }

  /** 批量为最近 N 天生成日摘要 */
  @Post('generate-recent')
  async generateRecent(@UserId() userId: string, @Body() body?: { days?: number }) {
    return this.dailySummaryService.generateRecent(userId, body?.days);
  }
}
