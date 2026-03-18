import { Module } from '@nestjs/common';
import { ObservationService } from './observation/observation.service';
import { ObservationEmitterService } from './observation/observation-emitter.service';
import { ObservationController } from './observation/observation.controller';

@Module({
  controllers: [ObservationController],
  providers: [ObservationService, ObservationEmitterService],
  exports: [ObservationService, ObservationEmitterService],
})
export class CognitiveTraceModule {}
