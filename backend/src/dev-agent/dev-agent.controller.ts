import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { DevAgentService } from './dev-agent.service';
import type { CreateDevReminderInput } from './dev-reminder.service';

@Controller('dev-agent')
export class DevAgentController {
  constructor(private readonly devAgent: DevAgentService) {}

  @Get('sessions')
  async listSessions() {
    return this.devAgent.listSessions();
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    return this.devAgent.getSession(id);
  }

  @Get('runs/:runId')
  async getRun(@Param('runId') runId: string) {
    return this.devAgent.getRun(runId);
  }

  @Post('runs/:runId/cancel')
  async cancelRun(
    @Param('runId') runId: string,
    @Body() body?: { reason?: string },
  ) {
    return this.devAgent.cancelRun(runId, body?.reason);
  }

  @Get('reminders')
  async listReminders(@Query('sessionId') sessionId?: string) {
    return this.devAgent.listReminders(sessionId);
  }

  @Post('reminders')
  async createReminder(@Body() body: CreateDevReminderInput) {
    return this.devAgent.createReminder(body);
  }

  @Post('reminders/:id/enable')
  async setReminderEnabled(
    @Param('id') id: string,
    @Body() body?: { enabled?: boolean },
  ) {
    return this.devAgent.setReminderEnabled(id, body?.enabled !== false);
  }

  @Post('reminders/:id/trigger')
  async triggerReminderNow(@Param('id') id: string) {
    return this.devAgent.triggerReminderNow(id);
  }

  @Delete('reminders/:id')
  async deleteReminder(@Param('id') id: string) {
    return this.devAgent.deleteReminder(id);
  }
}
