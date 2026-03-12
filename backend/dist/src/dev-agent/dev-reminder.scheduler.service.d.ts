import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevReminderService } from './dev-reminder.service';
export declare class DevReminderSchedulerService implements OnModuleInit {
    private readonly reminders;
    private readonly logger;
    private readonly enabled;
    constructor(reminders: DevReminderService, config: ConfigService);
    onModuleInit(): void;
    handleReminderPolling(): Promise<void>;
}
