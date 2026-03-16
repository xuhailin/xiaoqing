import { Injectable } from '@nestjs/common';
import { readFile, stat } from 'fs/promises';
import { resolve } from 'path';
import { resolveQaRoot } from './regression.paths';

export type RegressionReportMode = 'gate' | 'replay';

@Injectable()
export class RegressionReportsService {
  private readonly latestDir = resolve(resolveQaRoot(process.cwd()), 'reports', 'latest');

  async readLatestReports() {
    const [gate, replay] = await Promise.all([
      this.readLatestReport('gate'),
      this.readLatestReport('replay'),
    ]);

    return { gate, replay };
  }

  async readLatestReport(mode: RegressionReportMode) {
    const filePath = resolve(this.latestDir, `${mode}.json`);

    try {
      const [raw, fileStat] = await Promise.all([
        readFile(filePath, 'utf8'),
        stat(filePath),
      ]);
      return {
        mode,
        filePath,
        updatedAt: fileStat.mtime.toISOString(),
        report: JSON.parse(raw) as unknown,
      };
    } catch {
      return {
        mode,
        filePath,
        updatedAt: null,
        report: null,
      };
    }
  }
}
