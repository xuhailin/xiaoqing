import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DevReminderService } from './dev-reminder.service';

@Injectable()
export class DevReminderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(DevReminderSchedulerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly reminders: DevReminderService,
    config: ConfigService,
  ) {
    this.enabled = config.get('FEATURE_DEV_REMINDER') !== 'false';
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    void this.reminders.dispatchDueReminders().catch((err) => {
      this.logger.error(`Initial reminder dispatch failed: ${String(err)}`);
    });
  }

  // 每 15 秒扫描到期提醒并入队 DevRun
  @Cron('*/15 * * * * *')
  async handleReminderPolling() {
    if (!this.enabled) return;

    try {
      const result = await this.reminders.dispatchDueReminders();
      if (result.triggered > 0) {
        this.logger.log(
          `Reminder polling triggered runs: scanned=${result.scanned} triggered=${result.triggered}`,
        );
      }
    } catch (err) {
      this.logger.error(`Reminder polling failed: ${String(err)}`);
    }
  }
}
