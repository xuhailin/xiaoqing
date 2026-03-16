import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../infra/prisma.service';
import { ConversationModule } from '../assistant/conversation/conversation.module';
import { MemoryModule } from '../assistant/memory/memory.module';
import { SummarizerModule } from '../assistant/summarizer/summarizer.module';
import { PersonaModule } from '../assistant/persona/persona.module';
import { IdentityAnchorModule } from '../assistant/identity-anchor/identity-anchor.module';
import { PetModule } from '../assistant/pet/pet.module';
import { ClaimEngineModule } from '../assistant/claim-engine/claim-engine.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ConversationModule,
    OrchestratorModule,
    MemoryModule,
    SummarizerModule,
    PersonaModule,
    IdentityAnchorModule,
    PetModule,
    ClaimEngineModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class QaRuntimeModule {}
