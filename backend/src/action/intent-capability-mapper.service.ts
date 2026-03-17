import { Injectable, Logger } from '@nestjs/common';
import type { DialogueTaskIntent } from '../assistant/intent/intent.types';
import type { MessageChannel } from '../gateway/message-router.types';

@Injectable()
export class IntentCapabilityMapper {
  private readonly logger = new Logger(IntentCapabilityMapper.name);
  private readonly mappings = new Map<string, string[]>();

  constructor() {
    this.register('weather_query', 'chat', 'weather');
    this.register('book_download', 'chat', 'book-download');
    this.register('timesheet', 'chat', 'timesheet');
    this.register('set_reminder', 'chat', 'reminder');
    this.register('checkin', 'chat', 'checkin');
    this.register('general_tool', 'chat', 'general-action');
  }

  findCapabilities(taskIntent: DialogueTaskIntent, channel: MessageChannel): string[] {
    return this.mappings.get(`${taskIntent}@${channel}`) || [];
  }

  register(taskIntent: DialogueTaskIntent, channel: MessageChannel, capabilityName: string): void {
    const key = `${taskIntent}@${channel}`;
    const existing = this.mappings.get(key) || [];
    existing.push(capabilityName);
    this.mappings.set(key, existing);
    this.logger.log(`Mapped: ${taskIntent}@${channel} -> ${capabilityName}`);
  }
}
