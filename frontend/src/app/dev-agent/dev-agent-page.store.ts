import { Injectable, signal } from '@angular/core';
import {
  DevAgentService,
  DevRun,
  DevSession,
  DevTaskResult,
  DevWorkspaceMeta,
} from '../core/services/dev-agent.service';

@Injectable()
export class DevAgentPageStore {
  private static readonly TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
  private static readonly POLL_INTERVAL_MS = 1500;

  sessions = signal<DevSession[]>([]);
  sending = signal(false);
  lastResult = signal<DevTaskResult | null>(null);
  expandedSessionId = signal<string | null>(null);
  selectedSessionId = signal<string | null>(null);
  selectedRunId = signal<string | null>(null);
  cancellingRunId = signal<string | null>(null);
  workspaceRootInput = signal('');
  actionNotice = signal<string | null>(null);

  /** 默认使用固定 conversationId 走 dev 通道 */
  private devConversationId = '';
  private runPollTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly devAgent: DevAgentService) {}

  init() {
    this.loadSessions();
  }

  destroy() {
    this.clearRunPolling();
    this.clearNoticeTimer();
  }

  setWorkspaceRootInput(value: string) {
    this.workspaceRootInput.set(value);
  }

  send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || this.sending()) return;

    this.sending.set(true);
    const convId = this.devConversationId || 'dev-default';
    const workspaceRoot = this.resolveWorkspaceRootForSend();

    this.devAgent.sendDevMessage(convId, trimmed, { workspaceRoot }).subscribe({
      next: (result) => {
        this.lastResult.set({
          ...result,
          run: {
            ...result.run,
            userInput: result.run.userInput ?? trimmed,
          },
        });
        this.selectedSessionId.set(result.session.id);
        this.expandedSessionId.set(result.session.id);
        this.selectedRunId.set(result.run.id);
        this.workspaceRootInput.set(result.run.workspace?.workspaceRoot ?? workspaceRoot ?? '');
        this.pollRun(result.run.id, result.session.id);
        this.sending.set(false);
        this.loadSessions(result.session.id);
      },
      error: (err) => {
        this.lastResult.set({
          session: { id: '', status: 'failed', workspace: null },
          run: {
            id: '',
            userInput: trimmed,
            status: 'failed',
            executor: null,
            plan: null,
            result: null,
            error: err.message || '请求失败',
            artifactPath: null,
            workspace: null,
          },
          reply: '请求失败：' + (err.error?.message || err.message || '未知错误'),
        });
        this.sending.set(false);
      },
    });
  }

  rerunCurrentRun() {
    if (this.sending()) {
      this.notify('当前已有任务发送中，请稍后重试。');
      return;
    }
    const sourceRunId = this.lastResult()?.run.id;
    if (!sourceRunId) {
      this.notify('当前没有可重跑的 run。');
      return;
    }
    const fallbackUserInput = this.resolveCurrentRunInput();

    this.sending.set(true);
    this.devAgent.rerunRun(sourceRunId).subscribe({
      next: (result) => {
        this.lastResult.set({
          ...result,
          run: {
            ...result.run,
            userInput: result.run.userInput ?? fallbackUserInput,
          },
        });
        this.selectedSessionId.set(result.session.id);
        this.expandedSessionId.set(result.session.id);
        this.selectedRunId.set(result.run.id);
        this.workspaceRootInput.set(result.run.workspace?.workspaceRoot ?? this.workspaceRootInput());
        this.pollRun(result.run.id, result.session.id);
        this.sending.set(false);
        this.loadSessions(result.session.id);
        this.notify('已创建新 run 重跑任务。');
      },
      error: (err) => {
        this.sending.set(false);
        const msg = err?.error?.message || err?.message || '未知错误';
        this.notify(`重跑失败：${msg}`);
      },
    });
  }

  async copyText(text: string, label = '内容') {
    const value = text.trim();
    if (!value) {
      this.notify(`没有可复制的${label}。`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      this.notify(`${label}已复制。`);
    } catch {
      this.notify(`复制${label}失败，请检查浏览器权限。`);
    }
  }

  buildFailureSummary(): string {
    const result = this.lastResult();
    const summary = this.buildResultSummary(result?.run.result);
    const lines: string[] = [];
    if (summary?.stopReason) {
      lines.push(`stopReason: ${summary.stopReason}`);
    }
    for (const step of summary?.steps ?? []) {
      if (!step.success) {
        lines.push(`- ${step.stepId} ${step.command}`);
        if (step.error) {
          lines.push(`  error: ${step.error}`);
        }
      }
    }
    if (lines.length === 0 && result?.run.error) {
      lines.push(result.run.error);
    }
    return lines.join('\n');
  }

  loadSessions(preferredSessionId?: string) {
    this.devAgent.listSessions().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);

        const activeSession = this.pickActiveSession(sessions, preferredSessionId);
        if (!activeSession) {
          this.selectedSessionId.set(null);
          if (!this.devConversationId) {
            this.devConversationId = 'dev-default';
          }
          this.workspaceRootInput.set('');
          return;
        }

        this.selectedSessionId.set(activeSession.id);
        this.expandedSessionId.set(this.expandedSessionId() ?? activeSession.id);
        if (activeSession.conversationId) {
          this.devConversationId = activeSession.conversationId;
        } else if (!this.devConversationId) {
          this.devConversationId = 'dev-default';
        }
        this.workspaceRootInput.set(activeSession.workspaceRoot ?? '');
      },
    });
  }

  toggleSession(sessionId: string) {
    const next = this.expandedSessionId() === sessionId ? null : sessionId;
    this.expandedSessionId.set(next);
    this.selectedSessionId.set(sessionId);

    const session = this.sessions().find((s) => s.id === sessionId);
    if (session?.conversationId) {
      this.devConversationId = session.conversationId;
    }
    this.workspaceRootInput.set(session?.workspaceRoot ?? '');
    if (!next) {
      return;
    }

    this.devAgent.getSession(sessionId).subscribe({
      next: (fullSession) => {
        this.sessions.update((items) => {
          const index = items.findIndex((s) => s.id === fullSession.id);
          if (index < 0) {
            return [fullSession, ...items];
          }
          const nextItems = [...items];
          nextItems[index] = fullSession;
          return nextItems;
        });
      },
    });
  }

  openRun(runId: string) {
    this.selectedRunId.set(runId);

    this.devAgent.getRun(runId).subscribe({
      next: (run) => {
        if (!run) return;
        this.lastResult.set(this.mapRunToTaskResult(run));
        this.selectedSessionId.set(run.sessionId);
        this.workspaceRootInput.set(run.workspaceRoot ?? '');
        this.loadSessions(run.sessionId);
        if (!this.isTerminalStatus(run.status)) {
          this.pollRun(run.id, run.sessionId);
        }
      },
    });
  }

  cancelCurrentRun() {
    const current = this.lastResult();
    if (!current) return;

    const runId = current.run.id;
    if (!runId || !this.isRunCancellable(current.run.status)) return;
    if (this.cancellingRunId() === runId) return;

    this.cancellingRunId.set(runId);

    this.devAgent.cancelRun(runId, '用户主动取消任务').subscribe({
      next: (result) => {
        if (!result.ok) {
          this.cancellingRunId.set(null);
          return;
        }
        this.devAgent.getRun(runId).subscribe({
          next: (run) => {
            if (run) {
              this.lastResult.set(this.mapRunToTaskResult(run));
              this.selectedRunId.set(run.id);
              this.loadSessions(run.sessionId);
            }
            this.clearRunPolling();
            this.cancellingRunId.set(null);
          },
          error: () => {
            this.clearRunPolling();
            this.loadSessions(current.session.id || undefined);
            this.cancellingRunId.set(null);
          },
        });
      },
      error: () => {
        this.cancellingRunId.set(null);
      },
    });
  }

  formatWorkspace(workspace: DevWorkspaceMeta | null | undefined): string {
    if (!workspace?.workspaceRoot) {
      return '默认工作区（当前服务目录）';
    }
    return `${workspace.projectScope} · ${workspace.workspaceRoot}`;
  }

  buildResultSummary(result: unknown): {
    completedStepsText: string;
    totalStepsText: string;
    stopReason: string | null;
    steps: Array<{
      stepId: string;
      executor: string;
      command: string;
      success: boolean;
      output: string | null;
      error: string | null;
    }>;
  } | null {
    const resultObj = this.asRecord(result);
    const summary = this.asRecord(resultObj?.['summary']);
    if (!summary) return null;

    const completedSteps = this.readNumber(summary, 'completedSteps');
    const totalSteps = this.readNumber(summary, 'totalSteps');
    const stopReason = this.readString(summary, 'stopReason');
    const steps = this.parseSummarySteps(summary['steps']);

    return {
      completedStepsText: completedSteps === null ? '-' : String(completedSteps),
      totalStepsText: totalSteps === null ? '-' : String(totalSteps),
      stopReason,
      steps,
    };
  }

  isRunCancellable(status: string): boolean {
    return status === 'queued' || status === 'pending' || status === 'running';
  }

  private parseSummarySteps(value: unknown): Array<{
    stepId: string;
    executor: string;
    command: string;
    success: boolean;
    output: string | null;
    error: string | null;
  }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item, index) => {
        const step = this.asRecord(item);
        if (!step) return null;

        const stepId = this.readString(step, 'stepId') ?? `step-${index + 1}`;
        const executor = this.readString(step, 'executor') ?? 'unknown';
        const command = this.readString(step, 'command') ?? '(无命令)';
        const success = step['success'] === true;
        const output = this.readString(step, 'output');
        const error = this.readString(step, 'error');

        return {
          stepId,
          executor,
          command,
          success,
          output,
          error,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  private pollRun(runId: string, sessionId: string) {
    this.clearRunPolling();
    const pollOnce = () => {
      this.devAgent.getRun(runId).subscribe({
        next: (run) => {
          if (!run) {
            this.schedulePoll(pollOnce);
            return;
          }
          this.lastResult.set(this.mapRunToTaskResult(run));
          this.selectedRunId.set(run.id);
          this.loadSessions(sessionId);
          if (this.isTerminalStatus(run.status)) {
            this.clearRunPolling();
            return;
          }
          this.schedulePoll(pollOnce);
        },
        error: () => this.schedulePoll(pollOnce),
      });
    };
    pollOnce();
  }

  private clearRunPolling() {
    if (this.runPollTimer) {
      clearTimeout(this.runPollTimer);
      this.runPollTimer = null;
    }
  }

  private schedulePoll(task: () => void) {
    this.clearRunPolling();
    this.runPollTimer = setTimeout(task, DevAgentPageStore.POLL_INTERVAL_MS);
  }

  private isTerminalStatus(status: string): boolean {
    return DevAgentPageStore.TERMINAL_STATUSES.has(status);
  }

  private pickActiveSession(
    sessions: DevSession[],
    preferredSessionId?: string,
  ): DevSession | null {
    const candidate = preferredSessionId ?? this.selectedSessionId();
    if (candidate) {
      const matched = sessions.find((s) => s.id === candidate);
      if (matched) {
        return matched;
      }
    }
    const runningFirst = sessions.find((session) =>
      session.runs.some((run) =>
        run.status === 'queued' || run.status === 'pending' || run.status === 'running',
      ),
    );
    return runningFirst ?? sessions[0] ?? null;
  }

  private resolveWorkspaceRootForSend(): string | undefined {
    const typed = this.workspaceRootInput().trim();
    if (typed) {
      return typed;
    }
    const selectedSessionId = this.selectedSessionId();
    if (!selectedSessionId) {
      return undefined;
    }
    const selectedSession = this.sessions().find((item) => item.id === selectedSessionId);
    return selectedSession?.workspaceRoot ?? undefined;
  }

  private mapRunToTaskResult(run: DevRun): DevTaskResult {
    const plan = this.isPlan(run.plan) ? run.plan : null;
    const resultObj = this.asRecord(run.result);
    const summaryObj = this.asRecord(resultObj?.['summary']);
    const finalReply = this.readString(resultObj, 'finalReply');
    const lastEvent = this.readString(resultObj, 'lastEvent');
    const stopReason = this.readString(summaryObj, 'stopReason');

    const reply = this.resolveReply(run.status, {
      finalReply,
      lastEvent,
      runError: run.error,
      stopReason,
    });
    const workspace = this.normalizeWorkspace(run.workspace)
      ?? this.parseWorkspaceFromResult(run.result);

    return {
      session: { id: run.sessionId, status: 'active', workspace },
      run: {
        id: run.id,
        userInput: run.userInput,
        status: run.status,
        executor: run.executor,
        plan,
        result: run.result,
        error: run.error,
        artifactPath: run.artifactPath,
        workspace,
      },
      reply,
    };
  }

  private resolveReply(
    status: string,
    options: {
      finalReply: string | null;
      lastEvent: string | null;
      runError: string | null;
      stopReason: string | null;
    },
  ): string {
    if (options.finalReply) {
      return options.finalReply;
    }
    if (status === 'queued' || status === 'pending' || status === 'running') {
      return options.lastEvent ?? '任务执行中...';
    }
    if (status === 'success') {
      return options.stopReason ?? '任务执行完成。';
    }
    if (status === 'cancelled') {
      return options.runError ?? '任务已取消。';
    }
    return options.runError ?? options.stopReason ?? '任务执行失败。';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(
    record: Record<string, unknown> | null,
    key: string,
  ): string | null {
    const value = record?.[key];
    return typeof value === 'string' ? value : null;
  }

  private readNumber(
    record: Record<string, unknown> | null,
    key: string,
  ): number | null {
    const value = record?.[key];
    return typeof value === 'number' ? value : null;
  }

  private normalizeWorkspace(value: unknown): DevWorkspaceMeta | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const workspaceRoot = typeof record['workspaceRoot'] === 'string'
      ? record['workspaceRoot'].trim()
      : '';
    if (!workspaceRoot) {
      return null;
    }
    const projectScope = typeof record['projectScope'] === 'string' && record['projectScope'].trim()
      ? record['projectScope'].trim()
      : workspaceRoot;
    return { workspaceRoot, projectScope };
  }

  private parseWorkspaceFromResult(result: unknown): DevWorkspaceMeta | null {
    const record = this.asRecord(result);
    return this.normalizeWorkspace(record?.['workspace']);
  }

  private resolveCurrentRunInput(): string | null {
    const current = this.lastResult();
    const direct = current?.run.userInput?.trim();
    if (direct) return direct;

    const runId = current?.run.id;
    if (!runId) return null;
    for (const session of this.sessions()) {
      const matched = session.runs.find((run) => run.id === runId);
      if (matched?.userInput?.trim()) {
        return matched.userInput.trim();
      }
    }
    return null;
  }

  private notify(message: string) {
    this.actionNotice.set(message);
    this.clearNoticeTimer();
    this.noticeTimer = setTimeout(() => {
      this.actionNotice.set(null);
      this.noticeTimer = null;
    }, 2200);
  }

  private clearNoticeTimer() {
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
  }

  private isPlan(value: unknown): value is NonNullable<DevTaskResult['run']['plan']> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const plan = value as Record<string, unknown>;
    if (typeof plan['summary'] !== 'string') {
      return false;
    }
    const steps = plan['steps'];
    if (!Array.isArray(steps)) {
      return false;
    }
    return steps.every((step) => this.isPlanStep(step));
  }

  private isPlanStep(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const step = value as Record<string, unknown>;
    return typeof step['index'] === 'number'
      && typeof step['description'] === 'string'
      && typeof step['command'] === 'string'
      && (
        typeof step['strategy'] === 'string'
        || typeof step['executor'] === 'string'
      );
  }
}
