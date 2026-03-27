import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevAgentService } from './dev-agent.service';
import { isFeatureEnabled } from '../config/feature-flags';

@Controller('dev-agent')
export class DevAgentController {
  constructor(
    private readonly devAgent: DevAgentService,
    private readonly config: ConfigService,
  ) {}

  private assertEnabled() {
    if (!isFeatureEnabled(this.config, 'devAgent')) {
      throw new ForbiddenException('DevAgent is disabled');
    }
  }

  @Get('sessions')
  async listSessions() {
    this.assertEnabled();
    return this.devAgent.listSessions();
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    this.assertEnabled();
    return this.devAgent.getSession(id);
  }

  @Get('runs/:runId')
  async getRun(@Param('runId') runId: string) {
    this.assertEnabled();
    return this.devAgent.getRun(runId);
  }

  @Get('workspace-tree')
  async listWorkspaceTree(
    @Query('workspaceRoot') workspaceRoot: string,
    @Query('path') path?: string,
  ) {
    this.assertEnabled();
    return this.devAgent.listWorkspaceTree(workspaceRoot, path);
  }

  @Post('runs/:runId/cancel')
  async cancelRun(
    @Param('runId') runId: string,
    @Body() body?: { reason?: string },
  ) {
    this.assertEnabled();
    return this.devAgent.cancelRun(runId, body?.reason);
  }

  @Post('runs/:runId/rerun')
  async rerunRun(@Param('runId') runId: string) {
    this.assertEnabled();
    return this.devAgent.rerunRun(runId);
  }

  @Post('runs/:runId/resume')
  async resumeRun(
    @Param('runId') runId: string,
    @Body() body?: { userInput?: string },
  ) {
    this.assertEnabled();
    return this.devAgent.resumeRun(runId, body?.userInput);
  }

  @Get('sessions/:id/cost')
  async getSessionCost(@Param('id') id: string) {
    this.assertEnabled();
    return this.devAgent.getSessionCost(id);
  }

  @Patch('sessions/:id/budget')
  async setSessionBudget(
    @Param('id') id: string,
    @Body() body: { budgetUsd: number | null },
  ) {
    this.assertEnabled();
    return this.devAgent.setSessionBudget(id, body.budgetUsd);
  }

}
