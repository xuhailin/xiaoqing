import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { RegressionReportsService, type RegressionReportMode } from './regression-reports.service';

@Controller('qa/reports')
export class RegressionReportsController {
  constructor(private readonly reports: RegressionReportsService) {}

  @Get('latest')
  getLatestReports() {
    return this.reports.readLatestReports();
  }

  @Get('latest/:mode')
  async getLatestReport(@Param('mode') mode: string) {
    if (mode !== 'gate' && mode !== 'gate-agents' && mode !== 'replay') {
      throw new NotFoundException(`Unsupported regression mode: ${mode}`);
    }

    const result = await this.reports.readLatestReport(mode as RegressionReportMode);
    if (!result.report) {
      throw new NotFoundException(`Latest regression report not found: ${mode}`);
    }
    return result;
  }
}
