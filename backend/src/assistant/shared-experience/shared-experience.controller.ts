import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SharedExperienceFollowupService } from './shared-experience-followup.service';
import { SharedExperienceService } from './shared-experience.service';
import type { SharedExperienceCategory } from './shared-experience.types';

@Controller('shared-experiences')
export class SharedExperienceController {
  constructor(
    private readonly service: SharedExperienceService,
    private readonly followup: SharedExperienceFollowupService,
  ) {}

  @Get()
  async list(
    @Query('category') category?: string,
    @Query('minSignificance') minSignificance?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      category: category as SharedExperienceCategory | undefined,
      minSignificance: minSignificance ? Number(minSignificance) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('relevant')
  async findRelevant(
    @Query('context') context?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findRelevant(context ?? '', limit ? Number(limit) : undefined);
  }

  @Post('promote')
  async promote(@Body() body?: { since?: string }) {
    return this.service.promoteFromReflections(
      body?.since ? new Date(body.since) : undefined,
    );
  }

  @Post('merge')
  async merge(@Body() body: { sourceId: string; targetId: string }) {
    return this.service.merge(body.sourceId, body.targetId);
  }

  @Post('followups/generate')
  async generateFollowups(@Body() body?: { dryRun?: boolean; limit?: number }) {
    return this.followup.generateFollowupPlans({
      dryRun: body?.dryRun,
      limit: body?.limit,
    });
  }
}
