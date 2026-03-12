import { Module } from '@nestjs/common';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MemoryDecayService } from './memory-decay.service';
import { MemoryWriteGuardService } from './memory-write-guard.service';
import { MemorySchedulerService } from './memory-scheduler.service';

@Module({
  controllers: [MemoryController],
  providers: [MemoryService, MemoryDecayService, MemoryWriteGuardService, MemorySchedulerService],
  exports: [MemoryService, MemoryDecayService, MemoryWriteGuardService, MemorySchedulerService],
})
export class MemoryModule {}
