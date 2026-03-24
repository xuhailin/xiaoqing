import { Module } from '@nestjs/common';
import { PersonaController } from './persona.controller';
import { PersonaService } from './persona.service';
import { EvolutionSchedulerService } from './evolution-scheduler.service';
import { UserProfileService } from './user-profile.service';
import { PersonaRuleController } from './persona-rule.controller';
import { PersonaRuleService } from './persona-rule.service';
import { LlmModule } from '../../infra/llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [PersonaController, PersonaRuleController],
  providers: [
    PersonaService,
    PersonaRuleService,
    EvolutionSchedulerService,
    UserProfileService,
  ],
  exports: [
    PersonaService,
    PersonaRuleService,
    EvolutionSchedulerService,
    UserProfileService,
  ],
})
export class PersonaModule {}
