import { Controller, Get, Patch, Post, Param, Query, Body } from '@nestjs/common';
import { SocialEntityClassifierService } from './social-entity-classifier.service';
import { SocialEntityService } from './social-entity.service';
import type { SocialRelation } from './social-entity.types';
import { UserId } from '../../../infra/user-id.decorator';

@Controller('social-entities')
export class SocialEntityController {
  constructor(
    private readonly service: SocialEntityService,
    private readonly classifier: SocialEntityClassifierService,
  ) {}

  @Get()
  async list(
    @Query('relation') relation?: string,
    @Query('sortBy') sortBy?: string,
    @Query('limit') limit?: string,
    @UserId() userId?: string,
  ) {
    return this.service.list(userId ?? 'default-user', {
      relation: relation as SocialRelation | undefined,
      sortBy: sortBy as 'mentionCount' | 'lastSeenAt' | 'name' | undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { relation?: SocialRelation; description?: string; aliases?: string[]; tags?: string[] },
  ) {
    return this.service.update(id, body);
  }

  @Post('merge')
  async merge(@Body() body: { sourceId: string; targetId: string }) {
    return this.service.merge(body.sourceId, body.targetId);
  }

  @Post('sync')
  async sync(@Body() body?: { since?: string }, @UserId() userId?: string) {
    const since = body?.since ? new Date(body.since) : undefined;
    return this.service.syncFromTracePoints(userId ?? 'default-user', since);
  }

  @Post('classify')
  async classify(
    @Body() body?: { id?: string; limit?: number; force?: boolean; entityIds?: string[] },
    @UserId() userId?: string,
  ) {
    if (body?.id) {
      return this.classifier.classifyEntity(body.id, { force: body.force });
    }

    return this.classifier.classifyPending({
      userId: userId ?? 'default-user',
      entityIds: body?.entityIds,
      limit: body?.limit,
      force: body?.force,
    });
  }
}
