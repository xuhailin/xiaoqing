import { Module } from '@nestjs/common';
import { OpenClawRegistryService } from './openclaw-registry.service';
import { OpenClawService } from './openclaw.service';
import { TaskFormatterService } from './task-formatter.service';

@Module({
  providers: [OpenClawRegistryService, OpenClawService, TaskFormatterService],
  exports: [OpenClawRegistryService, OpenClawService, TaskFormatterService],
})
export class OpenClawModule {}
