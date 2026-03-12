import { Injectable, Logger } from '@nestjs/common';
import { resolve } from 'path';
import { SkillRunner } from '../action/local-skills/skill-runner.service';
import { createTaskContext, type DevTaskContext } from './dev-task-context';
import type { DevTaskResult } from './dev-agent.types';
import { DevSessionRepository } from './dev-session.repository';
import {
  DEV_AGENT_DATA_DIR,
  DEV_AGENT_SKILL_COMMAND_RE,
  MAX_AUTO_REPLAN,
  MAX_CONSECUTIVE_FAILURES,
  MAX_PLAN_ROUNDS,
  MAX_STEPS_PER_ROUND,
} from './dev-agent.constants';
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

class DevRunCanceledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevRunCanceledError';
  }
}

/** DevAgent 主流程编排：round/step/replan/report/transcript。 */
@Injectable()
export class DevAgentOrchestrator {
  private readonly logger = new Logger(DevAgentOrchestrator.name);

  constructor(
    private readonly sessions: DevSessionRepository,
    private readonly localSkillRunner: SkillRunner,
    private readonly planner: DevTaskPlanner,
    private readonly stepRunner: DevStepRunner,
    private readonly progressEvaluator: DevProgressEvaluator,
    private readonly replanPolicy: DevReplanPolicy,
    private readonly transcriptWriter: DevTranscriptWriter,
    private readonly finalReportGenerator: DevFinalReportGenerator,
  ) {}

  async executeRun(input: DevRunExecutionInput): Promise<DevTaskResult> {
    const runDir = resolve(DEV_AGENT_DATA_DIR, input.run.id);

    this.logger.log(`DevAgent run started: session=${input.session.id} run=${input.run.id}`);

    let taskContext: DevTaskContext | null = null;
    let lastPlan: DevTaskResult['run']['plan'] = null;

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

      taskContext = createTaskContext(input.run.id, input.run.userInput);
      await this.sessions.updateRunStatus(input.run.id, {
        result: this.buildProgressResult(taskContext, {
          currentRound: 0,
          currentStepId: null,
          lastEvent: '任务进入执行阶段',
        }),
      });

      let stopReason = '';
      let allSuccess = false;
      let pendingReplanReason: string | null = null;

      roundLoop:
      for (let round = 1; round <= MAX_PLAN_ROUNDS; round++) {
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
          plan: plan as any,
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

        const roundSteps = plan.steps.slice(0, MAX_STEPS_PER_ROUND);
        if (roundSteps.length === 0) {
          stopReason = '规划结果为空，无法继续执行。';
          break;
        }

        for (let i = 0; i < roundSteps.length; i++) {
          await this.throwIfCanceled(input.run.id);

          const step = roundSteps[i];
          const stepId = `${round}.${step.index}`;
          const { result, log } = await this.stepRunner.executeStep(
            input.run.id,
            input.session.id,
            taskContext,
            step,
            stepId,
          );
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

            if (
              this.replanPolicy.shouldAutoReplan(errorType) &&
              taskContext.replanCount < MAX_AUTO_REPLAN
            ) {
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
              taskContext.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
                ? '连续失败 2 次，已停止自动执行。'
                : result.error ?? '步骤执行失败';
            break roundLoop;
          }

          taskContext.consecutiveFailures = 0;
          const evaluation = await this.progressEvaluator.evaluateTaskProgress(
            input.run.userInput,
            taskContext,
            {
              hasRemainingRoundSteps: i < roundSteps.length - 1,
            },
          );
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
        stopReason = `达到最大规划轮次（${MAX_PLAN_ROUNDS}），任务未完全收敛。`;
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
        result: JSON.parse(
          JSON.stringify({
            phase: 'completed',
            finalReply: reply,
            summary: resultSummary,
            taskContext,
            updatedAt: new Date().toISOString(),
          }),
        ),
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
    } catch (err) {
      if (err instanceof DevRunCanceledError) {
        const canceledReason = err.message || '任务已取消';
        await this.sessions.updateRunStatus(input.run.id, {
          status: 'canceled',
          error: canceledReason,
          result: JSON.parse(
            JSON.stringify({
              phase: 'canceled',
              taskId: taskContext?.taskId ?? input.run.id,
              goal: taskContext?.goal ?? input.run.userInput,
              steps: taskContext?.stepResults ?? [],
              stepLogs: taskContext?.stepLogs ?? [],
              errors: taskContext?.errors ?? [],
              cancelReason: canceledReason,
              updatedAt: new Date().toISOString(),
            }),
          ),
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
        result: JSON.parse(
          JSON.stringify({
            phase: 'failed',
            taskId: taskContext?.taskId ?? input.run.id,
            goal: taskContext?.goal ?? input.run.userInput,
            steps: taskContext?.stepResults ?? [],
            stepLogs: taskContext?.stepLogs ?? [],
            errors: taskContext?.errors ?? [],
            updatedAt: new Date().toISOString(),
          }),
        ),
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

  private parseLocalSkillCommand(input: string): string | null {
    const matched = String(input ?? '').trim().match(DEV_AGENT_SKILL_COMMAND_RE);
    return matched?.[1] ?? null;
  }

  private buildProgressResult(
    taskContext: DevTaskContext,
    options: {
      currentRound: number;
      currentStepId: string | null;
      lastEvent: string;
    },
  ) {
    return JSON.parse(
      JSON.stringify({
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
      }),
    );
  }

  private async handleLocalSkillTask(params: {
    conversationId: string;
    session: { id: string; status: string };
    run: { id: string };
    runDir: string;
    userInput: string;
    skillName: string;
  }): Promise<DevTaskResult> {
    await this.throwIfCanceled(params.run.id);
    await this.sessions.updateRunStatus(params.run.id, {
      result: JSON.parse(
        JSON.stringify({
          phase: 'running',
          mode: 'local-skill',
          skill: params.skillName,
          currentStepId: null,
          lastEvent: `本地技能 ${params.skillName} 开始执行`,
          updatedAt: new Date().toISOString(),
        }),
      ),
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
      result: JSON.parse(
        JSON.stringify({
          phase: 'completed',
          mode: 'local-skill',
          finalReply: localSkillRun.summary,
          summary: localSkillRun,
          updatedAt: new Date().toISOString(),
        }),
      ),
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

  private async throwIfCanceled(runId: string): Promise<void> {
    const run = await this.sessions.getRun(runId);
    if (run?.status === 'canceled') {
      throw new DevRunCanceledError(run.error ?? '用户取消任务');
    }
  }
}
