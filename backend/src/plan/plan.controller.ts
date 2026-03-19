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
import { PlanService } from './plan.service';
import { TaskOccurrenceService } from './task-occurrence.service';
import type { CreatePlanInput, UpdatePlanInput, PlanLifecycleAction, OccurrenceExceptionInput } from './plan.types';

@Controller('plans')
export class PlanController {
  constructor(
    private readonly planService: PlanService,
    private readonly occurrenceService: TaskOccurrenceService,
  ) {}

  // ─── Plan CRUD ─────────────────────────────────────────

  @Post()
  create(@Body() body: CreatePlanInput) {
    return this.planService.createPlan(body);
  }

  @Get()
  list(
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('sessionId') sessionId?: string,
    @Query('conversationId') conversationId?: string,
  ) {
    return this.planService.listPlans({
      scope: scope as any,
      status: status as any,
      sessionId,
      conversationId,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.planService.getPlan(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePlanInput) {
    return this.planService.updatePlan(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.planService.deletePlan(id);
  }

  // ─── 生命周期 ──────────────────────────────────────────

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.planService.lifecycle(id, 'pause');
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.planService.lifecycle(id, 'resume');
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.planService.lifecycle(id, 'archive');
  }

  // ─── Occurrences ───────────────────────────────────────

  @Get(':id/occurrences')
  listOccurrences(
    @Param('id') planId: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.occurrenceService.listByPlan(planId, {
      limit: limit ? Number(limit) : undefined,
      status: status as any,
    });
  }

  @Post(':id/occurrences/skip')
  skipOccurrence(
    @Param('id') planId: string,
    @Body() body: { scheduledAt: string; reason?: string },
  ) {
    return this.occurrenceService.applyException({
      planId,
      scheduledAt: new Date(body.scheduledAt),
      action: 'skip',
      reason: body.reason,
    });
  }

  @Post(':id/occurrences/reschedule')
  rescheduleOccurrence(
    @Param('id') planId: string,
    @Body() body: { scheduledAt: string; rescheduledTo: string; reason?: string },
  ) {
    return this.occurrenceService.applyException({
      planId,
      scheduledAt: new Date(body.scheduledAt),
      action: 'reschedule',
      rescheduledTo: new Date(body.rescheduledTo),
      reason: body.reason,
    });
  }
}
