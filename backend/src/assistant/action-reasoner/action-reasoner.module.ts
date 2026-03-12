import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActionModule } from '../../action/action.module';
import { ActionReasonerService } from './action-reasoner.service';

@Module({
  imports: [ConfigModule, ActionModule],
  providers: [ActionReasonerService],
  exports: [ActionReasonerService],
})
export class ActionReasonerModule {}
