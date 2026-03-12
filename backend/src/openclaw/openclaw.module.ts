import { Module } from '@nestjs/common';
import { OpenClawService } from './openclaw.service';
import { TaskFormatterService } from './task-formatter.service';

@Module({
  providers: [OpenClawService, TaskFormatterService],
  exports: [OpenClawService, TaskFormatterService],
})
export class OpenClawModule {}
