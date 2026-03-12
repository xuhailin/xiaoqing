import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DevAgentOrchestrator } from './dev-agent.orchestrator';
import { DevSessionRepository } from './dev-session.repository';

@Injectable()
export class DevRunRunnerService implements OnModuleInit {
  private readonly logger = new Logger(DevRunRunnerService.name);
  private readonly inFlightRuns = new Set<string>();
  private readonly sessionQueues = new Map<string, string[]>();
  private readonly activeSessionWorkers = new Set<string>();
  private readonly recoverRunningStrategy =
    process.env.DEV_RUN_RECOVER_RUNNING_STRATEGY?.toLowerCase() === 'retry'
      ? 'retry'
      : 'fail';

  constructor(
    private readonly sessions: DevSessionRepository,
    private readonly orchestrator: DevAgentOrchestrator,
  ) {}

  onModuleInit(): void {
    void this.recoverInterruptedRuns();
  }

  startRun(runId: string, sessionId?: string): void {
    if (this.inFlightRuns.has(runId)) {
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
    const queue = this.sessionQueues.get(sessionId) ?? [];
    if (!this.sessionQueues.has(sessionId)) {
      this.sessionQueues.set(sessionId, queue);
    }

    if (queue.includes(runId) || this.inFlightRuns.has(runId)) {
      this.logger.debug(`Skip duplicated queue entry: session=${sessionId} run=${runId}`);
      return;
    }

    queue.push(runId);
    this.logger.debug(`Run queued: session=${sessionId} run=${runId} queueSize=${queue.length}`);

    if (this.activeSessionWorkers.has(sessionId)) {
      return;
    }

    this.activeSessionWorkers.add(sessionId);
    setImmediate(() => void this.drainSessionQueue(sessionId));
  }

  private async drainSessionQueue(sessionId: string): Promise<void> {
    try {
      while (true) {
        const queue = this.sessionQueues.get(sessionId);
        const runId = queue?.shift();
        if (!runId) {
          break;
        }

        this.inFlightRuns.add(runId);
        try {
          await this.execute(runId);
        } finally {
          this.inFlightRuns.delete(runId);
        }
      }
    } catch (err) {
      this.logger.error(`Session queue worker crashed: session=${sessionId} err=${String(err)}`);
    } finally {
      this.activeSessionWorkers.delete(sessionId);
      const queue = this.sessionQueues.get(sessionId);
      if (!queue || queue.length === 0) {
        this.sessionQueues.delete(sessionId);
        return;
      }
      // worker 收尾时如果又有新任务，立即重启 drain，避免遗漏
      if (!this.activeSessionWorkers.has(sessionId)) {
        this.activeSessionWorkers.add(sessionId);
        setImmediate(() => void this.drainSessionQueue(sessionId));
      }
    }
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

      await this.orchestrator.executeRun({
        conversationId: claimedRun.session.conversationId ?? null,
        session: {
          id: claimedRun.session.id,
          status: claimedRun.session.status,
        },
        run: {
          id: claimedRun.id,
          userInput: claimedRun.userInput,
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Background run execution failed: run=${runId} ${errorMsg}`);

      await this.sessions
        .updateRunStatus(runId, {
          status: 'failed',
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
        'queued',
        'pending',
        'running',
      ]);

      if (recoverableRuns.length === 0) {
        return;
      }

      this.logger.warn(
        `Recovering interrupted runs: count=${recoverableRuns.length}, runningStrategy=${this.recoverRunningStrategy}`,
      );

      for (const run of recoverableRuns) {
        if (run.status === 'running') {
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
