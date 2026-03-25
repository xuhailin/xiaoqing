import { Module } from '@nestjs/common';
import { LlmModule } from '../infra/llm/llm.module';
import { PrismaService } from '../infra/prisma.service';
import { DesignAgentService } from './design-agent.service';
import { DesignAgentController } from './design-agent.controller';
import { DesignConversationService } from './design-conversation.service';
import { DesignOrchestratorService } from './design-orchestrator.service';
import { DesignIntentClassifier } from './design-intent-classifier.service';
import { DesignKnowledgeLoader } from './knowledge/design-knowledge-loader';
import { DesignAuditPromptBuilder } from './design-audit-prompt.builder';
import { PageScreenshotService } from './screenshot/page-screenshot.service';
import { VisualAuditService } from './visual-audit.service';
import { ClaudeCodeStreamService } from '../dev-agent/executors/claude-code-stream.service';
import { DevAgentModule } from '../dev-agent/dev-agent.module';

@Module({
  imports: [LlmModule, DevAgentModule],
  controllers: [DesignAgentController],
  providers: [
    PrismaService,
    DesignAgentService,
    DesignConversationService,
    DesignOrchestratorService,
    DesignIntentClassifier,
    DesignKnowledgeLoader,
    DesignAuditPromptBuilder,
    PageScreenshotService,
    VisualAuditService,
    ClaudeCodeStreamService,
  ],
  exports: [DesignAgentService, DesignConversationService, DesignOrchestratorService],
})
export class DesignAgentModule {}
