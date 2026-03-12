import { Injectable } from '@nestjs/common';
import type { DevTaskResult } from './dev-agent.types';
import { DevSessionRepository } from './dev-session.repository';
import { DevRunRunnerService } from './dev-runner.service';
import { DevReminderService, type CreateDevReminderInput } from './dev-reminder.service';

/** DevAgent 薄入口：委派主流程给 orchestrator。 */
@Injectable()
export class DevAgentService {
  constructor(
    private readonly sessions: DevSessionRepository,
    private readonly runner: DevRunRunnerService,
    private readonly reminders: DevReminderService,
  ) {}

  async handleTask(conversationId: string, userInput: string): Promise<DevTaskResult> {
    const session = await this.sessions.getOrCreateSession(conversationId);
    const run = await this.sessions.createRun(session.id, userInput);

    this.runner.startRun(run.id, session.id);

    return {
      session: { id: session.id, status: session.status },
      run: {
        id: run.id,
        status: run.status,
        executor: run.executor ?? null,
        plan: null,
        result: run.result,
        error: null,
        artifactPath: null,
      },
      reply: `任务已接收（run: ${run.id}），正在后台执行。你可以轮询 /dev-agent/runs/${run.id} 查看进度。`,
    };
  }

  async listSessions() {
    return this.sessions.listSessions();
  }

  async getSession(sessionId: string) {
    return this.sessions.getSessionWithRuns(sessionId);
  }

  async getRun(runId: string) {
    return this.sessions.getRun(runId);
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

    const terminalStatuses = ['success', 'failed', 'canceled'];
    const alreadyTerminal =
      terminalStatuses.includes(run.status) && run.status !== 'canceled';

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
}
