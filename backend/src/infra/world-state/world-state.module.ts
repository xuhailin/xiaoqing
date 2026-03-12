import { Module } from '@nestjs/common';
import { WorldStateService } from './world-state.service';

@Module({
  providers: [WorldStateService],
  exports: [WorldStateService],
})
export class WorldStateModule {}
