import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../../config/feature-flags';
import { SocialEntityClassifierService } from './social-entity-classifier.service';
import { PrismaService } from '../../../infra/prisma.service';

@Injectable()
export class SocialEntityClassifierSchedulerService {
  private readonly enabled: boolean;
  private readonly logger = new Logger(SocialEntityClassifierSchedulerService.name);

  constructor(
    private readonly classifier: SocialEntityClassifierService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'socialEntityClassifierScheduler');
  }

  // 每天凌晨 4:10 补偿分类一次，处理积压或漏掉的人物实体。
  @Cron('0 10 4 * * *')
  async handleDailyClassification() {
    if (!this.enabled) return;

    try {
      const users = await this.prisma.socialEntity.groupBy({ by: ['userId'] });
      for (const { userId } of users) {
        const result = await this.classifier.classifyPending({ userId, limit: 8 });
        if (result.classified > 0) {
          this.logger.log(
            `Social entity classification: user=${userId}, ${result.classified} classified, ${result.merged} merged`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Social entity classification failed: ${String(err)}`);
    }
  }
}
