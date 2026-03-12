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
var DevAgentOrchestrator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevAgentOrchestrator = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const skill_runner_service_1 = require("../action/local-skills/skill-runner.service");
const dev_task_context_1 = require("./dev-task-context");
const dev_session_repository_1 = require("./dev-session.repository");
const dev_agent_constants_1 = require("./dev-agent.constants");
const dev_task_planner_1 = require("./planning/dev-task-planner");
const dev_step_runner_1 = require("./execution/dev-step-runner");
const dev_progress_evaluator_1 = require("./execution/dev-progress-evaluator");
const dev_replan_policy_1 = require("./execution/dev-replan-policy");
const dev_transcript_writer_1 = require("./reporting/dev-transcript.writer");
const dev_final_report_generator_1 = require("./reporting/dev-final-report.generator");
class DevRunCanceledError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DevRunCanceledError';
    }
}
let DevAgentOrchestrator = DevAgentOrchestrator_1 = class DevAgentOrchestrator {
    sessions;
    localSkillRunner;
    planner;
    stepRunner;
    progressEvaluator;
    replanPolicy;
    transcriptWriter;
    finalReportGenerator;
    logger = new common_1.Logger(DevAgentOrchestrator_1.name);
    constructor(sessions, localSkillRunner, planner, stepRunner, progressEvaluator, replanPolicy, transcriptWriter, finalReportGenerator) {
        this.sessions = sessions;
        this.localSkillRunner = localSkillRunner;
        this.planner = planner;
        this.stepRunner = stepRunner;
        this.progressEvaluator = progressEvaluator;
        this.replanPolicy = replanPolicy;
        this.transcriptWriter = transcriptWriter;
        this.finalReportGenerator = finalReportGenerator;
    }
    async executeRun(input) {
        const runDir = (0, path_1.resolve)(dev_agent_constants_1.DEV_AGENT_DATA_DIR, input.run.id);
        this.logger.log(`DevAgent run started: session=${input.session.id} run=${input.run.id}`);
        let taskContext = null;
        let lastPlan = null;
        try {
            await this.sessions.updateRunStatus(input.run.id, {
                status: 'running',
                startedAt: new Date(),
            });
            await this.throwIfCanceled(input.run.id);
            const skillName = this.parseLocalSkillCommand(input.run.userInput);
            if (skillName) {
                return this.handleLocalSkillTask({
                    conversationId: input.conversationId ?? input.session.id,
                    session: input.session,
                    run: { id: input.run.id },
                    runDir,
                    userInput: input.run.userInput,
                    skillName,
                });
            }
            taskContext = (0, dev_task_context_1.createTaskContext)(input.run.id, input.run.userInput);
            await this.sessions.updateRunStatus(input.run.id, {
                result: this.buildProgressResult(taskContext, {
                    currentRound: 0,
                    currentStepId: null,
                    lastEvent: '任务进入执行阶段',
                }),
            });
            let stopReason = '';
            let allSuccess = false;
            let pendingReplanReason = null;
            roundLoop: for (let round = 1; round <= dev_agent_constants_1.MAX_PLAN_ROUNDS; round++) {
                await this.throwIfCanceled(input.run.id);
                const plan = await this.planner.planTask(input.run.userInput, taskContext, {
                    round,
                    replanReason: pendingReplanReason,
                });
                lastPlan = plan;
                pendingReplanReason = null;
                taskContext.plans.push({ round, plan });
                taskContext.steps = plan.steps;
                await this.sessions.updateRunStatus(input.run.id, {
                    plan: plan,
                    result: this.buildProgressResult(taskContext, {
                        currentRound: round,
                        currentStepId: null,
                        lastEvent: `第 ${round} 轮规划完成`,
                    }),
                });
                await this.transcriptWriter.write(runDir, {
                    phase: 'plan',
                    taskId: taskContext.taskId,
                    round,
                    replanCount: taskContext.replanCount,
                    plan,
                });
                const roundSteps = plan.steps.slice(0, dev_agent_constants_1.MAX_STEPS_PER_ROUND);
                if (roundSteps.length === 0) {
                    stopReason = '规划结果为空，无法继续执行。';
                    break;
                }
                for (let i = 0; i < roundSteps.length; i++) {
                    await this.throwIfCanceled(input.run.id);
                    const step = roundSteps[i];
                    const stepId = `${round}.${step.index}`;
                    const { result, log } = await this.stepRunner.executeStep(input.run.id, input.session.id, taskContext, step, stepId);
                    await this.throwIfCanceled(input.run.id);
                    taskContext.stepResults.push(result);
                    taskContext.stepLogs.push(log);
                    await this.transcriptWriter.write(runDir, {
                        phase: 'step',
                        taskId: taskContext.taskId,
                        ...result,
                    });
                    await this.transcriptWriter.write(runDir, { phase: 'step_log', ...log });
                    await this.sessions.updateRunStatus(input.run.id, {
                        result: this.buildProgressResult(taskContext, {
                            currentRound: round,
                            currentStepId: stepId,
                            lastEvent: result.success
                                ? `步骤 ${stepId} 执行成功`
                                : `步骤 ${stepId} 执行失败`,
                        }),
                    });
                    if (!result.success) {
                        const errorType = result.errorType ?? 'UNKNOWN';
                        taskContext.consecutiveFailures += 1;
                        taskContext.errors.push({
                            stepId,
                            errorType,
                            message: result.error ?? result.failureReason ?? '执行失败',
                            command: step.command,
                            createdAt: new Date().toISOString(),
                        });
                        if (this.replanPolicy.shouldAutoReplan(errorType) &&
                            taskContext.replanCount < dev_agent_constants_1.MAX_AUTO_REPLAN) {
                            taskContext.replanCount += 1;
                            pendingReplanReason = `step=${stepId}, type=${errorType}, detail=${result.failureReason ?? result.error ?? 'unknown'}`;
                            await this.transcriptWriter.write(runDir, {
                                phase: 'replan',
                                taskId: taskContext.taskId,
                                round,
                                reason: pendingReplanReason,
                            });
                            await this.sessions.updateRunStatus(input.run.id, {
                                result: this.buildProgressResult(taskContext, {
                                    currentRound: round,
                                    currentStepId: stepId,
                                    lastEvent: `步骤 ${stepId} 触发自动重规划`,
                                }),
                            });
                            continue roundLoop;
                        }
                        stopReason =
                            taskContext.consecutiveFailures >= dev_agent_constants_1.MAX_CONSECUTIVE_FAILURES
                                ? '连续失败 2 次，已停止自动执行。'
                                : result.error ?? '步骤执行失败';
                        break roundLoop;
                    }
                    taskContext.consecutiveFailures = 0;
                    const evaluation = await this.progressEvaluator.evaluateTaskProgress(input.run.userInput, taskContext, {
                        hasRemainingRoundSteps: i < roundSteps.length - 1,
                    });
                    await this.transcriptWriter.write(runDir, {
                        phase: 'step_eval',
                        taskId: taskContext.taskId,
                        round,
                        stepId,
                        ...evaluation,
                    });
                    if (evaluation.done) {
                        allSuccess = true;
                        stopReason = evaluation.reason || '任务已完成。';
                        break roundLoop;
                    }
                }
            }
            if (!allSuccess && !stopReason) {
                stopReason = `达到最大规划轮次（${dev_agent_constants_1.MAX_PLAN_ROUNDS}），任务未完全收敛。`;
            }
            const resultSummary = {
                taskId: taskContext.taskId,
                goal: taskContext.goal,
                allSuccess,
                stopReason,
                planRounds: taskContext.plans.length,
                replanCount: taskContext.replanCount,
                totalSteps: taskContext.stepResults.length,
                completedSteps: taskContext.stepResults.filter((s) => s.success).length,
                steps: taskContext.stepResults,
                errors: taskContext.errors,
                stepLogs: taskContext.stepLogs,
                suggestion: allSuccess ? null : this.replanPolicy.buildFailureSuggestion(taskContext),
            };
            const artifactPath = `dev-runs/${input.run.id}`;
            await this.transcriptWriter.write(runDir, {
                phase: 'report',
                taskId: taskContext.taskId,
                summary: resultSummary,
            });
            await this.throwIfCanceled(input.run.id);
            const reply = await this.finalReportGenerator.generateReport(input.run.userInput, {
                taskId: taskContext.taskId,
                allSuccess,
                stopReason,
                completedSteps: resultSummary.completedSteps,
                totalSteps: resultSummary.totalSteps,
                suggestion: resultSummary.suggestion,
            });
            const finalStatus = allSuccess ? 'success' : 'failed';
            const executors = [...new Set(taskContext.stepResults.map((s) => s.executor))].join(',');
            await this.throwIfCanceled(input.run.id);
            await this.sessions.updateRunStatus(input.run.id, {
                status: finalStatus,
                executor: executors,
                result: JSON.parse(JSON.stringify({
                    phase: 'completed',
                    finalReply: reply,
                    summary: resultSummary,
                    taskContext,
                    updatedAt: new Date().toISOString(),
                })),
                artifactPath,
                error: allSuccess ? undefined : stopReason,
                finishedAt: new Date(),
            });
            return {
                session: { id: input.session.id, status: input.session.status },
                run: {
                    id: input.run.id,
                    status: finalStatus,
                    executor: executors || null,
                    plan: lastPlan,
                    result: resultSummary,
                    error: allSuccess ? null : stopReason,
                    artifactPath,
                },
                reply,
            };
        }
        catch (err) {
            if (err instanceof DevRunCanceledError) {
                const canceledReason = err.message || '任务已取消';
                await this.sessions.updateRunStatus(input.run.id, {
                    status: 'canceled',
                    error: canceledReason,
                    result: JSON.parse(JSON.stringify({
                        phase: 'canceled',
                        taskId: taskContext?.taskId ?? input.run.id,
                        goal: taskContext?.goal ?? input.run.userInput,
                        steps: taskContext?.stepResults ?? [],
                        stepLogs: taskContext?.stepLogs ?? [],
                        errors: taskContext?.errors ?? [],
                        cancelReason: canceledReason,
                        updatedAt: new Date().toISOString(),
                    })),
                    finishedAt: new Date(),
                });
                return {
                    session: { id: input.session.id, status: input.session.status },
                    run: {
                        id: input.run.id,
                        status: 'canceled',
                        executor: null,
                        plan: lastPlan,
                        result: taskContext
                            ? {
                                taskId: taskContext.taskId,
                                goal: taskContext.goal,
                                steps: taskContext.stepResults,
                                stepLogs: taskContext.stepLogs,
                                errors: taskContext.errors,
                            }
                            : null,
                        error: canceledReason,
                        artifactPath: null,
                    },
                    reply: `任务已取消：${canceledReason}`,
                };
            }
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.logger.error(`DevAgent run failed: run=${input.run.id} err=${errorMsg}`);
            await this.sessions.updateRunStatus(input.run.id, {
                status: 'failed',
                error: errorMsg,
                result: JSON.parse(JSON.stringify({
                    phase: 'failed',
                    taskId: taskContext?.taskId ?? input.run.id,
                    goal: taskContext?.goal ?? input.run.userInput,
                    steps: taskContext?.stepResults ?? [],
                    stepLogs: taskContext?.stepLogs ?? [],
                    errors: taskContext?.errors ?? [],
                    updatedAt: new Date().toISOString(),
                })),
                finishedAt: new Date(),
            });
            return {
                session: { id: input.session.id, status: input.session.status },
                run: {
                    id: input.run.id,
                    status: 'failed',
                    executor: null,
                    plan: lastPlan,
                    result: taskContext
                        ? {
                            taskId: taskContext.taskId,
                            goal: taskContext.goal,
                            steps: taskContext.stepResults,
                            stepLogs: taskContext.stepLogs,
                            errors: taskContext.errors,
                        }
                        : null,
                    error: errorMsg,
                    artifactPath: null,
                },
                reply: `任务执行失败：${errorMsg}`,
            };
        }
    }
    parseLocalSkillCommand(input) {
        const matched = String(input ?? '').trim().match(dev_agent_constants_1.DEV_AGENT_SKILL_COMMAND_RE);
        return matched?.[1] ?? null;
    }
    buildProgressResult(taskContext, options) {
        return JSON.parse(JSON.stringify({
            phase: 'running',
            taskId: taskContext.taskId,
            goal: taskContext.goal,
            currentRound: options.currentRound,
            currentStepId: options.currentStepId,
            lastEvent: options.lastEvent,
            planRounds: taskContext.plans.length,
            replanCount: taskContext.replanCount,
            totalSteps: taskContext.stepResults.length,
            completedSteps: taskContext.stepResults.filter((s) => s.success).length,
            steps: taskContext.stepResults,
            stepLogs: taskContext.stepLogs,
            errors: taskContext.errors,
            updatedAt: new Date().toISOString(),
        }));
    }
    async handleLocalSkillTask(params) {
        await this.throwIfCanceled(params.run.id);
        await this.sessions.updateRunStatus(params.run.id, {
            result: JSON.parse(JSON.stringify({
                phase: 'running',
                mode: 'local-skill',
                skill: params.skillName,
                currentStepId: null,
                lastEvent: `本地技能 ${params.skillName} 开始执行`,
                updatedAt: new Date().toISOString(),
            })),
        });
        const localSkillRun = await this.localSkillRunner.run({
            skill: params.skillName,
            conversationId: params.conversationId,
            turnId: params.run.id,
            userInput: params.userInput,
        });
        await this.throwIfCanceled(params.run.id);
        await this.transcriptWriter.write(params.runDir, {
            phase: 'skill',
            localSkillRun,
        });
        const artifactPath = `dev-runs/${params.run.id}`;
        const runStatus = localSkillRun.success ? 'success' : 'failed';
        await this.sessions.updateRunStatus(params.run.id, {
            status: runStatus,
            executor: `local-skill:${localSkillRun.skill}`,
            result: JSON.parse(JSON.stringify({
                phase: 'completed',
                mode: 'local-skill',
                finalReply: localSkillRun.summary,
                summary: localSkillRun,
                updatedAt: new Date().toISOString(),
            })),
            error: localSkillRun.success ? undefined : localSkillRun.summary,
            artifactPath,
            finishedAt: new Date(),
        });
        return {
            session: params.session,
            run: {
                id: params.run.id,
                status: runStatus,
                executor: `local-skill:${localSkillRun.skill}`,
                plan: null,
                result: localSkillRun,
                error: localSkillRun.success ? null : localSkillRun.summary,
                artifactPath,
            },
            reply: localSkillRun.summary,
        };
    }
    async throwIfCanceled(runId) {
        const run = await this.sessions.getRun(runId);
        if (run?.status === 'canceled') {
            throw new DevRunCanceledError(run.error ?? '用户取消任务');
        }
    }
};
exports.DevAgentOrchestrator = DevAgentOrchestrator;
exports.DevAgentOrchestrator = DevAgentOrchestrator = DevAgentOrchestrator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dev_session_repository_1.DevSessionRepository,
        skill_runner_service_1.SkillRunner,
        dev_task_planner_1.DevTaskPlanner,
        dev_step_runner_1.DevStepRunner,
        dev_progress_evaluator_1.DevProgressEvaluator,
        dev_replan_policy_1.DevReplanPolicy,
        dev_transcript_writer_1.DevTranscriptWriter,
        dev_final_report_generator_1.DevFinalReportGenerator])
], DevAgentOrchestrator);
//# sourceMappingURL=dev-agent.orchestrator.js.map