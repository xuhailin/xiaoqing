import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../../config/feature-flags';
import { SocialInsightService } from './social-insight.service';
import { PrismaService } from '../../../infra/prisma.service';

@Injectable()
export class SocialInsightSchedulerService {
  private readonly enabled: boolean;
  private readonly logger = new Logger(SocialInsightSchedulerService.name);

  constructor(
    private readonly socialInsight: SocialInsightService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'socialInsightScheduler');
  }

  // 每周一凌晨 4:20 生成周级社会洞察
  @Cron('0 20 4 * * 1')
  async handleWeeklyInsight() {
    if (!this.enabled) return;

    try {
      const users = await this.prisma.socialEntity.groupBy({ by: ['userId'] });
      for (const { userId } of users) {
        const result = await this.socialInsight.generate(userId, 'weekly');
        if (result.record) {
          this.logger.log(
            `Weekly social insight generated: user=${userId}, ${result.record.periodKey} (${result.record.confidence.toFixed(2)})`,
          );
        }
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
      const users = await this.prisma.socialEntity.groupBy({ by: ['userId'] });
      for (const { userId } of users) {
        const result = await this.socialInsight.generate(userId, 'monthly');
        if (result.record) {
          this.logger.log(
            `Monthly social insight generated: user=${userId}, ${result.record.periodKey} (${result.record.confidence.toFixed(2)})`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Monthly social insight failed: ${String(err)}`);
    }
  }
}
