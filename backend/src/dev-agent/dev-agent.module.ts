import { Module, type OnModuleInit } from '@nestjs/common';
import { DevAgentService } from './dev-agent.service';
import { DevAgentController } from './dev-agent.controller';
import { DevSessionRepository } from './dev-session.repository';
import { DevCostService } from './dev-cost.service';
import { ShellExecutor } from './executors/shell.executor';
import { OpenClawExecutor } from './executors/openclaw.executor';
import { ClaudeCodeExecutor } from './executors/claude-code.executor';
import { ClaudeCodeStreamService } from './executors/claude-code-stream.service';
import { ClaudeCodeAgentExecutor } from './executors/claude-code-agent.executor';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { ActionModule } from '../action/action.module';
import { ReflectionModule } from '../assistant/reflection/reflection.module';
import { LlmModule } from '../infra/llm/llm.module';
import { QueueModule } from '../infra/queue';
import { CapabilityRegistry } from '../action/capability-registry.service';
import { DevAgentOrchestrator } from './dev-agent.orchestrator';
import { DevTaskPlanner } from './planning/dev-task-planner';
import { DevPlannerPromptFactory } from './planning/dev-planner-prompt.factory';
import { DevPlanParser } from './planning/dev-plan-parser';
import { DevPlanNormalizer } from './planning/dev-plan-normalizer';
import { DevStepRunner } from './execution/dev-step-runner';
import { DevExecutorResolver } from './execution/dev-executor-resolver';
import { DevAgentExecutorResolver } from './execution/dev-agent-executor-resolver';
import { DevStepRoutingService } from './execution/dev-step-routing.service';
import { DevProgressEvaluator } from './execution/dev-progress-evaluator';
import { DevReplanPolicy } from './execution/dev-replan-policy';
import { DevFinalReportGenerator } from './reporting/dev-final-report.generator';
import { DevTranscriptWriter } from './reporting/dev-transcript.writer';
import { DevRunRunnerService } from './dev-runner.service';
import { WorkspaceManager } from './workspace/workspace-manager.service';
import { DevReminderService } from './dev-reminder.service';
import { DevReminderSchedulerService } from './dev-reminder.scheduler.service';
import { ReminderMessageService } from '../action/skills/reminder/reminder-message.service';
import { SystemSelfModule } from '../system-self/system-self.module';
import { StrategyReasoner } from '../reasoning/strategy-reasoner.service';

@Module({
  imports: [OpenClawModule, ActionModule, ReflectionModule, LlmModule, QueueModule, SystemSelfModule],
  controllers: [DevAgentController],
  providers: [
    DevAgentService,
    DevAgentOrchestrator,
    DevSessionRepository,
    DevCostService,
    ShellExecutor,
    OpenClawExecutor,
    WorkspaceManager,
    ClaudeCodeStreamService,
    ClaudeCodeExecutor,
    ClaudeCodeAgentExecutor,
    DevTaskPlanner,
    DevPlannerPromptFactory,
    DevPlanParser,
    DevPlanNormalizer,
    DevStepRunner,
    DevStepRoutingService,
    DevExecutorResolver,
    DevAgentExecutorResolver,
    DevProgressEvaluator,
    DevReplanPolicy,
    DevFinalReportGenerator,
    DevTranscriptWriter,
    DevRunRunnerService,
    DevReminderService,
    DevReminderSchedulerService,
    StrategyReasoner,
  ],
  exports: [DevAgentService, DevStepRoutingService, StrategyReasoner],
})
export class DevAgentModule implements OnModuleInit {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly shell: ShellExecutor,
    private readonly openclaw: OpenClawExecutor,
    private readonly claudeCode: ClaudeCodeExecutor,
    private readonly claudeCodeAgent: ClaudeCodeAgentExecutor,
    private readonly agentExecutorResolver: DevAgentExecutorResolver,
    private readonly devReminder: DevReminderService,
    private readonly reminderMessage: ReminderMessageService,
  ) {}

  onModuleInit() {
    // 注册 step-level 执行器到统一 capability registry
    this.registry.register(this.shell);
    this.registry.register(this.openclaw);
    this.registry.register(this.claudeCode);

    // 注册 run-level agent executor
    this.agentExecutorResolver.register(this.claudeCodeAgent);

    // 延迟注入：将 ReminderMessageService 注入到 DevReminderService，用于 chat-scope 提醒推送
    this.devReminder.setReminderMessageService(this.reminderMessage);
  }
}
