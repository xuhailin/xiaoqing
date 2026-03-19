import { Module } from '@nestjs/common';
import { SystemSelfService } from './system-self.service';
import { ActionModule } from '../action/action.module';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { SystemSelfController } from './system-self.controller';

@Module({
  imports: [ActionModule, OpenClawModule],
  controllers: [SystemSelfController],
  providers: [SystemSelfService],
  exports: [SystemSelfService],
})
export class SystemSelfModule {}
