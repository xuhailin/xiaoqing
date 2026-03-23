import { Module } from '@nestjs/common';
import { LlmModule } from '../infra/llm/llm.module';
import { DesignAgentService } from './design-agent.service';
import { DesignAgentController } from './design-agent.controller';
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
    DesignAgentService,
    DesignKnowledgeLoader,
    DesignAuditPromptBuilder,
    PageScreenshotService,
    VisualAuditService,
    ClaudeCodeStreamService,
  ],
  exports: [DesignAgentService],
})
export class DesignAgentModule {}
