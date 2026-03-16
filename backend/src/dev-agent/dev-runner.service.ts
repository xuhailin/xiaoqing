import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DevRunStatus } from '@prisma/client';
import { KeyedFifoQueueService } from '../infra/queue';
import { DevAgentOrchestrator } from './dev-agent.orchestrator';
import { DevSessionRepository } from './dev-session.repository';
import { WorkspaceManager } from './workspace/workspace-manager.service';
import { parseWorkspaceMetaFromRunResult, withWorkspaceMeta } from './workspace/workspace-meta';

@Injectable()
export class DevRunRunnerService implements OnModuleInit {
  private readonly logger = new Logger(DevRunRunnerService.name);
  private readonly recoverRunningStrategy =
    process.env.DEV_RUN_RECOVER_RUNNING_STRATEGY?.toLowerCase() === 'retry'
      ? 'retry'
      : 'fail';
  private readonly disableRecovery =
    process.env.DEV_RUN_DISABLE_RECOVERY?.toLowerCase() === 'true';

  constructor(
    private readonly sessions: DevSessionRepository,
    private readonly orchestrator: DevAgentOrchestrator,
    private readonly workspaceManager: WorkspaceManager,
    private readonly queue: KeyedFifoQueueService,
  ) {}

  onModuleInit(): void {
    if (this.disableRecovery) {
      this.logger.log('Dev run recovery disabled by env flag');
      return;
    }
    void this.recoverInterruptedRuns();
  }

  startRun(runId: string, sessionId?: string): void {
    if (this.queue.isInFlight(runId)) {
      this.logger.debug(`Skip duplicated startRun request (already running): run=${runId}`);
      return;
    }

    if (sessionId) {
      this.enqueueForSession(sessionId, runId);
      return;
    }

    setImmediate(() => void this.enqueueByRunId(runId));
  }

  private async enqueueByRunId(runId: string): Promise<void> {
    try {
      const run = await this.sessions.getRunWithSession(runId);
      if (!run?.sessionId) {
        this.logger.warn(`Skip enqueue: run not found or session missing: run=${runId}`);
        return;
      }
      this.enqueueForSession(run.sessionId, runId);
    } catch (err) {
      this.logger.error(`Failed to enqueue run=${runId}: ${String(err)}`);
    }
  }

  private enqueueForSession(sessionId: string, runId: string): void {
    this.queue.enqueue(
      sessionId,
      runId,
      (id) => this.execute(id),
      (key) => {
        this.workspaceManager.release(key).catch((err) => {
          this.logger.warn(`Failed to release workspace: session=${key} err=${String(err)}`);
        });
      },
    );
  }

  private async execute(runId: string): Promise<void> {
    try {
      const claimedRun = await this.sessions.claimRunForExecution(runId);
      if (!claimedRun) {
        this.logger.warn(
          `Run is not claimable (already running or finished): run=${runId}`,
        );
        return;
      }

      const requestedWorkspace = parseWorkspaceMetaFromRunResult(claimedRun.result);
      if (requestedWorkspace) {
        try {
          await this.workspaceManager.bindSessionWorkspace(
            claimedRun.session.id,
            requestedWorkspace,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.sessions.updateRunStatus(runId, {
            status: DevRunStatus.failed,
            error: `工作区不可用：${message}`,
            result: withWorkspaceMeta({
              phase: 'failed',
              taskId: runId,
              goal: claimedRun.userInput,
              errors: [
                {
                  stepId: 'workspace',
                  errorType: 'FILE_NOT_FOUND',
                  message: `工作区不可用：${message}`,
                  command: requestedWorkspace.workspaceRoot,
                  createdAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            }, requestedWorkspace) as any,
            finishedAt: new Date(),
          });
          return;
        }
      }

      const effectiveWorkspace = this.workspaceManager.getSessionWorkspace(claimedRun.session.id)
        ?? requestedWorkspace
        ?? null;

      // 从 run result 中读取 mode（由 DevAgentService 在创建时写入）
      const runResult = claimedRun.result as Record<string, unknown> | null;
      const mode = (runResult?.mode === 'agent' ? 'agent' : 'orchestrated') as import('./dev-agent.types').DevRunMode;

      await this.orchestrator.executeRun({
        conversationId: claimedRun.session.conversationId ?? null,
        session: {
          id: claimedRun.session.id,
          status: claimedRun.session.status,
          workspace: effectiveWorkspace,
        },
        run: {
          id: claimedRun.id,
          userInput: claimedRun.userInput,
        },
        mode,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Background run execution failed: run=${runId} ${errorMsg}`);

      await this.sessions
        .updateRunStatus(runId, {
          status: DevRunStatus.failed,
          error: `后台执行异常：${errorMsg}`,
          finishedAt: new Date(),
        })
        .catch((updateErr) => {
          this.logger.error(`Failed to persist run failure: ${String(updateErr)}`);
        });
    }
  }

  private async recoverInterruptedRuns(): Promise<void> {
    try {
      const recoverableRuns = await this.sessions.listRunsByStatuses([
        DevRunStatus.queued,
        DevRunStatus.pending,
        DevRunStatus.running,
      ]);

      if (recoverableRuns.length === 0) {
        return;
      }

      this.logger.warn(
        `Recovering interrupted runs: count=${recoverableRuns.length}, runningStrategy=${this.recoverRunningStrategy}`,
      );

      for (const run of recoverableRuns) {
        if (run.status === DevRunStatus.running) {
          if (this.recoverRunningStrategy === 'retry') {
            const requeued = await this.sessions.requeueRunningRun(
              run.id,
              '服务重启后自动恢复：重新入队执行',
            );
            if (requeued.count > 0) {
              this.startRun(run.id, run.sessionId);
            }
            continue;
          }

          await this.sessions.markRunFailedForRecovery(
            run.id,
            '服务重启导致任务中断，已标记失败，请重新发起任务。',
          );
          continue;
        }

        this.startRun(run.id, run.sessionId);
      }
    } catch (err) {
      this.logger.error(`Failed to recover interrupted runs: ${String(err)}`);
    }
  }
}
