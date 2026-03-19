import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SocialCarePlannerService } from './social-care-planner.service';
import { SocialRelationEdgeService } from './social-relation-edge.service';
import type { SocialRelationTrend } from './social-relation-edge.types';

@Controller('social-relation-edges')
export class SocialRelationEdgeController {
  constructor(
    private readonly service: SocialRelationEdgeService,
    private readonly carePlanner: SocialCarePlannerService,
  ) {}

  @Get()
  async list(
    @Query('toEntityId') toEntityId?: string,
    @Query('trend') trend?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      toEntityId,
      trend: trend as SocialRelationTrend | undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('sync')
  async sync(@Body() body?: { since?: string }) {
    return this.service.syncFromTracePoints(
      body?.since ? new Date(body.since) : undefined,
    );
  }

  @Post('care-plans/generate')
  async generateCarePlans(@Body() body?: { dryRun?: boolean; limit?: number }) {
    return this.carePlanner.generateCarePlans({
      dryRun: body?.dryRun,
      limit: body?.limit,
    });
  }
}
