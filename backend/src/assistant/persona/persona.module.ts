import { Module } from '@nestjs/common';
import { PersonaController } from './persona.controller';
import { PersonaService } from './persona.service';
import { EvolutionSchedulerService } from './evolution-scheduler.service';
import { UserProfileService } from './user-profile.service';
import { LlmModule } from '../../infra/llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [PersonaController],
  providers: [PersonaService, EvolutionSchedulerService, UserProfileService],
  exports: [PersonaService, EvolutionSchedulerService, UserProfileService],
})
export class PersonaModule {}
