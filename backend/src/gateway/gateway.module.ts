import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Module({
  imports: [OrchestratorModule],
  controllers: [GatewayController],
})
export class GatewayModule {}
