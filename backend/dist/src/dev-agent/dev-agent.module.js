"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevAgentModule = void 0;
const common_1 = require("@nestjs/common");
const dev_agent_service_1 = require("./dev-agent.service");
const dev_agent_controller_1 = require("./dev-agent.controller");
const dev_session_repository_1 = require("./dev-session.repository");
const shell_executor_1 = require("./executors/shell.executor");
const openclaw_executor_1 = require("./executors/openclaw.executor");
const claude_code_executor_1 = require("./executors/claude-code.executor");
const claude_code_stream_service_1 = require("./executors/claude-code-stream.service");
const openclaw_module_1 = require("../openclaw/openclaw.module");
const action_module_1 = require("../action/action.module");
const llm_module_1 = require("../infra/llm/llm.module");
const capability_registry_service_1 = require("../action/capability-registry.service");
const dev_agent_orchestrator_1 = require("./dev-agent.orchestrator");
const dev_task_planner_1 = require("./planning/dev-task-planner");
const dev_planner_prompt_factory_1 = require("./planning/dev-planner-prompt.factory");
const dev_plan_parser_1 = require("./planning/dev-plan-parser");
const dev_plan_normalizer_1 = require("./planning/dev-plan-normalizer");
const dev_step_runner_1 = require("./execution/dev-step-runner");
const dev_executor_resolver_1 = require("./execution/dev-executor-resolver");
const dev_progress_evaluator_1 = require("./execution/dev-progress-evaluator");
const dev_replan_policy_1 = require("./execution/dev-replan-policy");
const dev_final_report_generator_1 = require("./reporting/dev-final-report.generator");
const dev_transcript_writer_1 = require("./reporting/dev-transcript.writer");
const dev_runner_service_1 = require("./dev-runner.service");
const workspace_manager_service_1 = require("./workspace/workspace-manager.service");
const dev_reminder_service_1 = require("./dev-reminder.service");
const dev_reminder_scheduler_service_1 = require("./dev-reminder.scheduler.service");
let DevAgentModule = class DevAgentModule {
    registry;
    shell;
    openclaw;
    claudeCode;
    constructor(registry, shell, openclaw, claudeCode) {
        this.registry = registry;
        this.shell = shell;
        this.openclaw = openclaw;
        this.claudeCode = claudeCode;
    }
    onModuleInit() {
        this.registry.register(this.shell);
        this.registry.register(this.openclaw);
        this.registry.register(this.claudeCode);
    }
};
exports.DevAgentModule = DevAgentModule;
exports.DevAgentModule = DevAgentModule = __decorate([
    (0, common_1.Module)({
        imports: [openclaw_module_1.OpenClawModule, action_module_1.ActionModule, llm_module_1.LlmModule],
        controllers: [dev_agent_controller_1.DevAgentController],
        providers: [
            dev_agent_service_1.DevAgentService,
            dev_agent_orchestrator_1.DevAgentOrchestrator,
            dev_session_repository_1.DevSessionRepository,
            shell_executor_1.ShellExecutor,
            openclaw_executor_1.OpenClawExecutor,
            workspace_manager_service_1.WorkspaceManager,
            claude_code_stream_service_1.ClaudeCodeStreamService,
            claude_code_executor_1.ClaudeCodeExecutor,
            dev_task_planner_1.DevTaskPlanner,
            dev_planner_prompt_factory_1.DevPlannerPromptFactory,
            dev_plan_parser_1.DevPlanParser,
            dev_plan_normalizer_1.DevPlanNormalizer,
            dev_step_runner_1.DevStepRunner,
            dev_executor_resolver_1.DevExecutorResolver,
            dev_progress_evaluator_1.DevProgressEvaluator,
            dev_replan_policy_1.DevReplanPolicy,
            dev_final_report_generator_1.DevFinalReportGenerator,
            dev_transcript_writer_1.DevTranscriptWriter,
            dev_runner_service_1.DevRunRunnerService,
            dev_reminder_service_1.DevReminderService,
            dev_reminder_scheduler_service_1.DevReminderSchedulerService,
        ],
        exports: [dev_agent_service_1.DevAgentService],
    }),
    __metadata("design:paramtypes", [capability_registry_service_1.CapabilityRegistry,
        shell_executor_1.ShellExecutor,
        openclaw_executor_1.OpenClawExecutor,
        claude_code_executor_1.ClaudeCodeExecutor])
], DevAgentModule);
//# sourceMappingURL=dev-agent.module.js.map