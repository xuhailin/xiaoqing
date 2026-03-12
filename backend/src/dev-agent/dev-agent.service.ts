import { BadRequestException, Injectable } from '@nestjs/common';
import { type Prisma, DevSessionStatus } from '@prisma/client';
import { DevRunStatus } from '@prisma/client';
import type { DevTaskResult } from './dev-agent.types';
import { DevSessionRepository } from './dev-session.repository';
import { DevRunRunnerService } from './dev-runner.service';
import { DevReminderService, type CreateDevReminderInput } from './dev-reminder.service';
import type { SendMessageMetadata } from '../gateway/message-router.types';
import {
  normalizeWorkspaceInput,
  parseWorkspaceMetaFromRunResult,
  type DevWorkspaceMeta,
  withWorkspaceMeta,
} from './workspace/workspace-meta';
import { WorkspaceManager } from './workspace/workspace-manager.service';

/** DevAgent 薄入口：委派主流程给 orchestrator。 */
@Injectable()
export class DevAgentService {
  constructor(
    private readonly sessions: DevSessionRepository,
    private readonly runner: DevRunRunnerService,
    private readonly reminders: DevReminderService,
    private readonly workspaceManager: WorkspaceManager,
  ) {}

  async handleTask(
    conversationId: string,
    userInput: string,
    metadata?: SendMessageMetadata,
  ): Promise<DevTaskResult> {
    const requestedWorkspace = normalizeWorkspaceInput(metadata);
    const session = await this.resolveSession(conversationId, requestedWorkspace);

    let workspace = await this.resolveSessionWorkspace(session.id);
    if (requestedWorkspace) {
      try {
        workspace = await this.workspaceManager.bindSessionWorkspace(
          session.id,
          requestedWorkspace,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(`workspaceRoot 不可用：${message}`);
      }
    }

    const run = await this.sessions.createRun(
      session.id,
      userInput,
      this.buildQueuedResult(workspace),
    );

    this.runner.startRun(run.id, session.id);

    return {
      session: {
        id: session.id,
        status: session.status,
        workspace,
      },
      run: {
        id: run.id,
        status: run.status,
        executor: run.executor ?? null,
        plan: null,
        result: run.result,
        error: null,
        artifactPath: null,
        workspace,
      },
      reply: `任务已接收（run: ${run.id}），正在后台执行。你可以轮询 /dev-agent/runs/${run.id} 查看进度。`,
    };
  }

  async listSessions() {
    const sessions = await this.sessions.listSessions();
    return sessions.map((session) => this.decorateSession(session));
  }

  async getSession(sessionId: string) {
    const session = await this.sessions.getSessionWithRuns(sessionId);
    if (!session) return null;
    return this.decorateSession(session);
  }

  async getRun(runId: string) {
    const run = await this.sessions.getRun(runId);
    if (!run) return null;
    return this.decorateRun(run);
  }

  async cancelRun(runId: string, reason?: string) {
    const normalizedReason = reason?.trim() || '任务已取消';
    const run = await this.sessions.cancelRun(runId, normalizedReason);

    if (!run) {
      return {
        ok: false,
        error: 'run not found',
      };
    }

    const terminalStatuses: string[] = [DevRunStatus.success, DevRunStatus.failed, DevRunStatus.cancelled];
    const alreadyTerminal =
      terminalStatuses.includes(run.status) && run.status !== DevRunStatus.cancelled;

    if (alreadyTerminal) {
      return {
        ok: false,
        error: `run already ${run.status}`,
        run: {
          id: run.id,
          status: run.status,
          error: run.error,
          finishedAt: run.finishedAt,
        },
      };
    }

    return {
      ok: true,
      run: {
        id: run.id,
        status: run.status,
        error: run.error,
        finishedAt: run.finishedAt,
      },
    };
  }

  async createReminder(input: CreateDevReminderInput) {
    return this.reminders.createReminder(input);
  }

  async listReminders(sessionId?: string) {
    return this.reminders.listReminders(sessionId);
  }

  async setReminderEnabled(id: string, enabled: boolean) {
    return this.reminders.setReminderEnabled(id, enabled);
  }

  async triggerReminderNow(id: string) {
    return this.reminders.triggerReminderNow(id);
  }

  async deleteReminder(id: string) {
    return this.reminders.deleteReminder(id);
  }

  private async resolveSession(
    conversationId: string,
    requestedWorkspace: DevWorkspaceMeta | null,
  ) {
    if (!requestedWorkspace) {
      return this.sessions.getOrCreateSession(conversationId);
    }

    const activeSessions = await this.sessions.listActiveSessionsByConversation(conversationId);
    const matched = activeSessions.find((candidate) => {
      const latestRun = candidate.runs[0];
      const existingWorkspace = parseWorkspaceMetaFromRunResult(latestRun?.result);
      return existingWorkspace?.workspaceRoot === requestedWorkspace.workspaceRoot;
    });
    if (matched) {
      return matched;
    }

    return this.sessions.createSession(conversationId);
  }

  private async resolveSessionWorkspace(sessionId: string): Promise<DevWorkspaceMeta | null> {
    const bound = this.workspaceManager.getSessionWorkspace(sessionId);
    if (bound) {
      return bound;
    }

    const latestRun = await this.sessions.getLatestRun(sessionId);
    const fromLatestRun = parseWorkspaceMetaFromRunResult(latestRun?.result);
    if (!fromLatestRun) {
      return null;
    }

    try {
      return await this.workspaceManager.bindSessionWorkspace(sessionId, fromLatestRun);
    } catch {
      return null;
    }
  }

  private buildQueuedResult(workspace: DevWorkspaceMeta | null): Prisma.InputJsonValue {
    return withWorkspaceMeta({
      phase: 'queued',
      currentStepId: null,
      planRounds: 0,
      completedSteps: 0,
      totalSteps: 0,
      stepLogs: [],
      events: [
        {
          type: 'queued',
          message: '任务已入队，等待执行',
          at: new Date().toISOString(),
        },
      ],
    }, workspace) as Prisma.InputJsonValue;
  }

  private decorateSession(session: any) {
    const runs = Array.isArray(session.runs)
      ? session.runs.map((run: any) => this.decorateRun(run))
      : [];
    const sessionWorkspace = this.resolveWorkspaceFromRuns(runs)
      ?? this.workspaceManager.getSessionWorkspace(session.id);
    return {
      ...session,
      status: session.status ?? DevSessionStatus.active,
      runs,
      workspace: sessionWorkspace,
      workspaceRoot: sessionWorkspace?.workspaceRoot ?? null,
      projectScope: sessionWorkspace?.projectScope ?? null,
    };
  }

  private decorateRun(run: any) {
    const workspace = parseWorkspaceMetaFromRunResult(run?.result)
      ?? this.workspaceManager.getSessionWorkspace(run?.sessionId ?? '');
    return {
      ...run,
      workspace,
      workspaceRoot: workspace?.workspaceRoot ?? null,
      projectScope: workspace?.projectScope ?? null,
    };
  }

  private resolveWorkspaceFromRuns(
    runs: Array<{ workspace?: DevWorkspaceMeta | null; createdAt?: string | Date }>,
  ): DevWorkspaceMeta | null {
    let latestWorkspace: DevWorkspaceMeta | null = null;
    let latestTs = Number.NEGATIVE_INFINITY;
    for (const run of runs) {
      if (run.workspace) {
        const rawTs = run.createdAt instanceof Date
          ? run.createdAt.getTime()
          : Date.parse(String(run.createdAt ?? ''));
        const ts = Number.isFinite(rawTs) ? rawTs : latestTs + 1;
        if (ts >= latestTs) {
          latestWorkspace = run.workspace;
          latestTs = ts;
        }
      }
    }
    return latestWorkspace;
  }
}
