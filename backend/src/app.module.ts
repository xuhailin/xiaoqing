import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
import { DesignAgentModule } from './design-agent/design-agent.module';
import { WechatWorkBotModule } from './channels/wechat-work-bot/wechat-work-bot.module';
import { RegressionReportsController } from './qa/regression-reports.controller';
import { RegressionReportsService } from './qa/regression-reports.service';
import { RegressionRunController } from './qa/regression-runner.controller';
import { RegressionRunService } from './qa/regression-runner.service';
import { AssetsController } from './assets.controller';
import { AgentBusModule } from './agent-bus/agent-bus.module';
import { PlanModule } from './plan/plan.module';
import { IdeaModule } from './idea/idea.module';
import { TodoModule } from './todo/todo.module';
import { UserIdMiddleware } from './infra/user-id.middleware';
import { VideoModule } from './video/video.module';
import { VideoAgentModule } from './video-agent/video-agent.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ConversationModule,
    GatewayModule,
    DevAgentModule,
    DesignAgentModule,
    MemoryModule,
    SummarizerModule,
    PersonaModule,
    IdentityAnchorModule,
    PetModule,
    ClaimEngineModule,
    AgentBusModule,
    PlanModule,
    IdeaModule,
    TodoModule,
    WechatWorkBotModule,
    VideoModule,
    VideoAgentModule,
  ],
  controllers: [AppController, AssetsController, RegressionReportsController, RegressionRunController],
  providers: [AppService, PrismaService, RegressionReportsService, RegressionRunService],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserIdMiddleware).forRoutes('*');
  }
}
