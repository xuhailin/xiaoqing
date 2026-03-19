import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../config/feature-flags';
import { SharedExperienceFollowupService } from './shared-experience-followup.service';

@Injectable()
export class SharedExperienceFollowupSchedulerService {
  private readonly enabled: boolean;
  private readonly logger = new Logger(SharedExperienceFollowupSchedulerService.name);

  constructor(
    private readonly followup: SharedExperienceFollowupService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'sharedExperienceFollowupScheduler');
  }

  // 每天上午 11:20 检查一次是否有值得轻轻追问后续的共同经历。
  @Cron('0 20 11 * * *')
  async handleDailyFollowupPlanning() {
    if (!this.enabled) return;

    try {
      const result = await this.followup.generateFollowupPlans();
      if (result.created > 0) {
        this.logger.log(`Shared experience followups: ${result.created} created, ${result.skipped} skipped`);
      }
    } catch (err) {
      this.logger.warn(`Shared experience followup planning failed: ${String(err)}`);
    }
  }
}
