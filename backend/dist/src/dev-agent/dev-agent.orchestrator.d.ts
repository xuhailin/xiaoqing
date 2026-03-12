import { SkillRunner } from '../action/local-skills/skill-runner.service';
import type { DevTaskResult } from './dev-agent.types';
import { DevSessionRepository } from './dev-session.repository';
import { DevTaskPlanner } from './planning/dev-task-planner';
import { DevStepRunner } from './execution/dev-step-runner';
import { DevProgressEvaluator } from './execution/dev-progress-evaluator';
import { DevReplanPolicy } from './execution/dev-replan-policy';
import { DevTranscriptWriter } from './reporting/dev-transcript.writer';
import { DevFinalReportGenerator } from './reporting/dev-final-report.generator';
interface DevRunExecutionInput {
    conversationId: string | null;
    session: {
        id: string;
        status: string;
    };
    run: {
        id: string;
        userInput: string;
    };
}
export declare class DevAgentOrchestrator {
    private readonly sessions;
    private readonly localSkillRunner;
    private readonly planner;
    private readonly stepRunner;
    private readonly progressEvaluator;
    private readonly replanPolicy;
    private readonly transcriptWriter;
    private readonly finalReportGenerator;
    private readonly logger;
    constructor(sessions: DevSessionRepository, localSkillRunner: SkillRunner, planner: DevTaskPlanner, stepRunner: DevStepRunner, progressEvaluator: DevProgressEvaluator, replanPolicy: DevReplanPolicy, transcriptWriter: DevTranscriptWriter, finalReportGenerator: DevFinalReportGenerator);
    executeRun(input: DevRunExecutionInput): Promise<DevTaskResult>;
    private parseLocalSkillCommand;
    private buildProgressResult;
    private handleLocalSkillTask;
    private throwIfCanceled;
}
export {};
