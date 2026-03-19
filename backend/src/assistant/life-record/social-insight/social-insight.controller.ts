import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SocialInsightService } from './social-insight.service';
import type { SocialInsightScope } from './social-insight.types';

@Controller('social-insights')
export class SocialInsightController {
  constructor(private readonly service: SocialInsightService) {}

  @Get()
  async list(
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
    @Query('minConfidence') minConfidence?: string,
  ) {
    return this.service.list({
      scope: scope as SocialInsightScope | undefined,
      limit: limit ? Number(limit) : undefined,
      minConfidence: minConfidence ? Number(minConfidence) : undefined,
    });
  }

  @Get('relevant')
  async relevant(
    @Query('context') context?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findRelevant(context ?? '', limit ? Number(limit) : undefined);
  }

  @Post('generate')
  async generate(@Body() body?: { scope?: SocialInsightScope }) {
    return this.service.generate(body?.scope ?? 'weekly');
  }
}
