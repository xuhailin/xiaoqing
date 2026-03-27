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
import { UserId } from '../infra/user-id.decorator';

@Controller('plans')
export class PlanController {
  constructor(
    private readonly planService: PlanService,
    private readonly occurrenceService: TaskOccurrenceService,
  ) {}

  // ─── Plan CRUD ─────────────────────────────────────────

  @Post()
  create(@Body() body: CreatePlanInput, @UserId() userId: string) {
    return this.planService.createPlan(body, userId);
  }

  @Get()
  list(
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('sessionId') sessionId?: string,
    @Query('conversationId') conversationId?: string,
    @UserId() userId?: string,
  ) {
    return this.planService.listPlans(userId ?? 'default-user', {
      scope: scope as any,
      status: status as any,
      sessionId,
      conversationId,
    });
  }

  @Get('occurrences')
  listAllOccurrences(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('planId') planId?: string,
    @Query('status') status?: string,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
  ) {
    const now = new Date();
    const fromDate = this.parseDateOrDefault(from, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const toDate = this.parseDateOrDefault(to, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    return this.occurrenceService.listByTimeRange(fromDate, toDate, {
      planId,
      status: status as any,
      conversationId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string, @UserId() userId: string) {
    return this.planService.getPlan(id, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePlanInput, @UserId() userId: string) {
    return this.planService.updatePlan(id, body, userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @UserId() userId: string) {
    return this.planService.deletePlan(id, userId);
  }

  // ─── 生命周期 ──────────────────────────────────────────

  @Post(':id/pause')
  pause(@Param('id') id: string, @UserId() userId: string) {
    return this.planService.lifecycle(id, 'pause', userId);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @UserId() userId: string) {
    return this.planService.lifecycle(id, 'resume', userId);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @UserId() userId: string) {
    return this.planService.lifecycle(id, 'archive', userId);
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

  private parseDateOrDefault(value: string | undefined, fallback: Date): Date {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return fallback;
    }
    return date;
  }
}
