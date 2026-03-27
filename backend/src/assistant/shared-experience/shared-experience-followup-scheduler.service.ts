import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../config/feature-flags';
import { SharedExperienceFollowupService } from './shared-experience-followup.service';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class SharedExperienceFollowupSchedulerService {
  private readonly enabled: boolean;
  private readonly logger = new Logger(SharedExperienceFollowupSchedulerService.name);

  constructor(
    private readonly followup: SharedExperienceFollowupService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'sharedExperienceFollowupScheduler');
  }

  // 每天上午 11:20 检查一次是否有值得轻轻追问后续的共同经历。
  @Cron('0 20 11 * * *')
  async handleDailyFollowupPlanning() {
    if (!this.enabled) return;

    try {
      const users = await this.prisma.sharedExperience.groupBy({ by: ['userId'] });
      for (const { userId } of users) {
        const result = await this.followup.generateFollowupPlans({ userId });
        if (result.created > 0) {
          this.logger.log(
            `Shared experience followups: user=${userId}, ${result.created} created, ${result.skipped} skipped`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Shared experience followup planning failed: ${String(err)}`);
    }
  }
}
