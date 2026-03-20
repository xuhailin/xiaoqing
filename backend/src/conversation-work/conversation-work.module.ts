import { Module } from '@nestjs/common';
import { ConversationWorkService } from './conversation-work.service';

@Module({
  providers: [ConversationWorkService],
  exports: [ConversationWorkService],
})
export class ConversationWorkModule {}
