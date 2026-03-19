import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../../config/feature-flags';
import { SocialInsightService } from './social-insight.service';

@Injectable()
export class SocialInsightSchedulerService {
  private readonly enabled: boolean;
  private readonly logger = new Logger(SocialInsightSchedulerService.name);

  constructor(
    private readonly socialInsight: SocialInsightService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'socialInsightScheduler');
  }

  // 每周一凌晨 4:20 生成周级社会洞察
  @Cron('0 20 4 * * 1')
  async handleWeeklyInsight() {
    if (!this.enabled) return;

    try {
      const result = await this.socialInsight.generate('weekly');
      if (result.record) {
        this.logger.log(
          `Weekly social insight generated: ${result.record.periodKey} (${result.record.confidence.toFixed(2)})`,
        );
      } else {
        this.logger.log('Weekly social insight skipped: no strong pattern detected');
      }
    } catch (err) {
      this.logger.warn(`Weekly social insight failed: ${String(err)}`);
    }
  }

  // 每月 1 日凌晨 4:25 生成月级社会洞察
  @Cron('0 25 4 1 * *')
  async handleMonthlyInsight() {
    if (!this.enabled) return;

    try {
      const result = await this.socialInsight.generate('monthly');
      if (result.record) {
        this.logger.log(
          `Monthly social insight generated: ${result.record.periodKey} (${result.record.confidence.toFixed(2)})`,
        );
      } else {
        this.logger.log('Monthly social insight skipped: no strong pattern detected');
      }
    } catch (err) {
      this.logger.warn(`Monthly social insight failed: ${String(err)}`);
    }
  }
}
