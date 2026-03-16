import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { RegressionRunService } from './regression-runner.service';
import type { RegressionReportMode } from './regression-reports.service';

@Controller('qa/runs')
export class RegressionRunController {
  constructor(private readonly runs: RegressionRunService) {}

  @Get()
  getAllStatuses() {
    return this.runs.getAllStatuses();
  }

  @Get(':mode')
  async getStatus(@Param('mode') mode: string) {
    return this.runs.getStatus(assertMode(mode));
  }

  @Post(':mode')
  async startRun(
    @Param('mode') mode: string,
    @Body() _body: Record<string, unknown>,
  ) {
    return this.runs.start(assertMode(mode));
  }
}

function assertMode(mode: string): RegressionReportMode {
  if (mode === 'gate' || mode === 'replay') {
    return mode;
  }
  throw new NotFoundException(`Unsupported regression mode: ${mode}`);
}
