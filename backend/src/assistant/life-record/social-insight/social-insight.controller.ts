import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SocialInsightService } from './social-insight.service';
import type { SocialInsightScope } from './social-insight.types';
import { UserId } from '../../../infra/user-id.decorator';

@Controller('social-insights')
export class SocialInsightController {
  constructor(private readonly service: SocialInsightService) {}

  @Get()
  async list(
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
    @Query('minConfidence') minConfidence?: string,
    @UserId() userId?: string,
  ) {
    return this.service.list(userId ?? 'default-user', {
      scope: scope as SocialInsightScope | undefined,
      limit: limit ? Number(limit) : undefined,
      minConfidence: minConfidence ? Number(minConfidence) : undefined,
    });
  }

  @Get('relevant')
  async relevant(
    @Query('context') context?: string,
    @Query('limit') limit?: string,
    @UserId() userId?: string,
  ) {
    return this.service.findRelevant(userId ?? 'default-user', context ?? '', limit ? Number(limit) : undefined);
  }

  @Post('generate')
  async generate(@Body() body?: { scope?: SocialInsightScope }, @UserId() userId?: string) {
    return this.service.generate(userId ?? 'default-user', body?.scope ?? 'weekly');
  }
}
