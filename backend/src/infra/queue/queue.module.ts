import { Module } from '@nestjs/common';
import { KeyedFifoQueueService } from './keyed-fifo-queue.service';

@Module({
  providers: [KeyedFifoQueueService],
  exports: [KeyedFifoQueueService],
})
export class QueueModule {}
