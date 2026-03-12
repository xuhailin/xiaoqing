import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './infra/prisma.service';
import { ConversationModule } from './assistant/conversation/conversation.module';
import { MemoryModule } from './assistant/memory/memory.module';
import { SummarizerModule } from './assistant/summarizer/summarizer.module';
import { PersonaModule } from './assistant/persona/persona.module';
import { IdentityAnchorModule } from './assistant/identity-anchor/identity-anchor.module';
import { PetModule } from './assistant/pet/pet.module';
import { ClaimEngineModule } from './assistant/claim-engine/claim-engine.module';
import { GatewayModule } from './gateway/gateway.module';
import { DevAgentModule } from './dev-agent/dev-agent.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ConversationModule,
    GatewayModule,
    DevAgentModule,
    MemoryModule,
    SummarizerModule,
    PersonaModule,
    IdentityAnchorModule,
    PetModule,
    ClaimEngineModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
