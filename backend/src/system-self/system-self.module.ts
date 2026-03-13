import { Module } from '@nestjs/common';
import { SystemSelfService } from './system-self.service';
import { ActionModule } from '../action/action.module';

@Module({
  imports: [ActionModule],
  providers: [SystemSelfService],
  exports: [SystemSelfService],
})
export class SystemSelfModule {}
