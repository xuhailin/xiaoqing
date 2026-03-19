import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../../config/feature-flags';
import { SocialCarePlannerService } from './social-care-planner.service';

@Injectable()
export class SocialCareSchedulerService {
  private readonly enabled: boolean;
  private readonly logger = new Logger(SocialCareSchedulerService.name);

  constructor(
    private readonly planner: SocialCarePlannerService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'socialCareScheduler');
  }

  // 每天上午 11:10 扫描一次主动关怀机会，生成一次性 notify 计划。
  @Cron('0 10 11 * * *')
  async handleDailyCarePlanning() {
    if (!this.enabled) return;

    try {
      const result = await this.planner.generateCarePlans();
      if (result.created > 0) {
        this.logger.log(`Social care plans generated: ${result.created} created, ${result.skipped} skipped`);
      } else {
        this.logger.log('Social care planning skipped: no suitable declining relation detected');
      }
    } catch (err) {
      this.logger.warn(`Social care planning failed: ${String(err)}`);
    }
  }
}
