import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DevAgentService } from './dev-agent.service';

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

  @Get('workspace-tree')
  async listWorkspaceTree(
    @Query('workspaceRoot') workspaceRoot: string,
    @Query('path') path?: string,
  ) {
    return this.devAgent.listWorkspaceTree(workspaceRoot, path);
  }

  @Post('runs/:runId/cancel')
  async cancelRun(
    @Param('runId') runId: string,
    @Body() body?: { reason?: string },
  ) {
    return this.devAgent.cancelRun(runId, body?.reason);
  }

  @Post('runs/:runId/rerun')
  async rerunRun(@Param('runId') runId: string) {
    return this.devAgent.rerunRun(runId);
  }

  @Post('runs/:runId/resume')
  async resumeRun(
    @Param('runId') runId: string,
    @Body() body?: { userInput?: string },
  ) {
    return this.devAgent.resumeRun(runId, body?.userInput);
  }

  @Get('sessions/:id/cost')
  async getSessionCost(@Param('id') id: string) {
    return this.devAgent.getSessionCost(id);
  }

  @Patch('sessions/:id/budget')
  async setSessionBudget(
    @Param('id') id: string,
    @Body() body: { budgetUsd: number | null },
  ) {
    return this.devAgent.setSessionBudget(id, body.budgetUsd);
  }

}
