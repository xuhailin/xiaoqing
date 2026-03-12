import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DevAgentService,
  DevRun,
  DevSession,
  DevTaskResult,
} from '../core/services/dev-agent.service';

@Component({
  selector: 'app-dev-agent',
  standalone: true,
  imports: [FormsModule, SlicePipe],
  template: `
    <div class="dev-agent">
      <header class="dev-header">
        <h2>DevAgent</h2>
        <span class="badge">{{ sessions().length }} sessions</span>
      </header>

      <!-- 输入区 -->
      <div class="input-area">
        <input
          type="text"
          [(ngModel)]="inputText"
          (keydown.enter)="send()"
          placeholder="输入开发任务（如：git status）"
          [disabled]="sending()"
        />
        <button (click)="send()" [disabled]="sending() || !inputText.trim()">
          {{ sending() ? '执行中...' : '执行' }}
        </button>
      </div>

      <!-- 最新执行结果 -->
      @if (lastResult()) {
        <div class="result-card" [class.error]="lastResult()!.run.status === 'failed'">
          <div class="result-header">
            <span class="status-dot" [class]="lastResult()!.run.status"></span>
            <span>{{ lastResult()!.run.status }}</span>
            @if (lastResult()!.run.executor) {
              <span class="executor-tag">{{ lastResult()!.run.executor }}</span>
            }
            <span class="result-actions-spacer"></span>
            @if (isRunCancellable(lastResult()!.run.status) && lastResult()!.run.id) {
              <button
                type="button"
                class="cancel-btn"
                (click)="cancelCurrentRun()"
                [disabled]="cancellingRunId() === lastResult()!.run.id"
              >
                {{ cancellingRunId() === lastResult()!.run.id ? '取消中...' : '取消任务' }}
              </button>
            }
          </div>
          <div class="reply">{{ lastResult()!.reply }}</div>
          @if (lastResult()!.run.plan) {
            <details class="plan-details">
              <summary>执行计划（{{ lastResult()!.run.plan!.steps.length }} 步）</summary>
              <ol>
                @for (step of lastResult()!.run.plan!.steps; track step.index) {
                  <li>
                    <span class="step-executor">[{{ step.executor }}]</span>
                    {{ step.description }}
                    <code>{{ step.command }}</code>
                  </li>
                }
              </ol>
            </details>
          }
          @if (buildResultSummary(lastResult()!.run.result); as summary) {
            <details class="summary-details">
              <summary>执行结果汇总（{{ summary.completedStepsText }}/{{ summary.totalStepsText }}）</summary>
              @if (summary.stopReason) {
                <div class="summary-stop-reason">{{ summary.stopReason }}</div>
              }
              @if (summary.steps.length) {
                <ol class="summary-step-list">
                  @for (step of summary.steps; track step.stepId + step.command) {
                    <li class="summary-step-item">
                      <div class="summary-step-head">
                        <span class="step-executor">[{{ step.executor }}]</span>
                        <code>{{ step.command }}</code>
                        <span
                          class="summary-step-status"
                          [class.success]="step.success"
                          [class.failed]="!step.success"
                        >
                          {{ step.success ? '成功' : '失败' }}
                        </span>
                      </div>
                      @if (step.output) {
                        <pre class="summary-output">{{ step.output }}</pre>
                      }
                      @if (step.error) {
                        <pre class="summary-error">{{ step.error }}</pre>
                      }
                    </li>
                  }
                </ol>
              } @else {
                <div class="summary-empty">本次执行无 step 明细。</div>
              }
            </details>
          }
          @if (lastResult()!.run.error) {
            <div class="error-msg">{{ lastResult()!.run.error }}</div>
          }
        </div>
      }

      <!-- Session 列表 -->
      <div class="session-list">
        @for (session of sessions(); track session.id) {
          <div
            class="session-card"
            [class.selected]="selectedSessionId() === session.id"
            (click)="toggleSession(session.id)"
          >
            <div class="session-header">
              <span class="status-dot" [class]="session.status"></span>
              <span class="session-title">{{ session.title || session.id.slice(0, 8) }}</span>
              <span class="session-meta">{{ session.runs.length }} runs</span>
            </div>
            @if (expandedSession() === session.id) {
              <div class="run-list">
                @for (run of session.runs; track run.id) {
                  <div
                    class="run-item"
                    [class.selected]="selectedRunId() === run.id"
                    (click)="openRun(run.id, $event)"
                  >
                    <div class="run-header">
                      <span class="status-dot small" [class]="run.status"></span>
                      <span class="run-input">{{ run.userInput | slice:0:60 }}</span>
                      <span class="run-executor">{{ run.executor || '-' }}</span>
                    </div>
                    @if (run.error) {
                      <div class="error-msg small">{{ run.error }}</div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
        @if (sessions().length === 0) {
          <div class="empty">暂无 DevAgent 会话</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .dev-agent {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      height: 100%;
      padding: var(--space-4);
      max-width: 800px;
      margin: 0 auto;
    }

    .dev-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .dev-header h2 {
      margin: 0;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
    }

    .badge {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      background: var(--color-sidebar);
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-pill);
    }

    .input-area {
      display: flex;
      gap: var(--space-2);
    }

    .input-area input {
      flex: 1;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      background: var(--color-surface);
      outline: none;
      transition: border-color var(--transition-fast);
    }

    .input-area input:focus {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(92, 103, 242, 0.15);
    }

    .input-area button {
      padding: var(--space-2) var(--space-4);
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition: background var(--transition-fast);
      white-space: nowrap;
    }

    .input-area button:hover:not(:disabled) {
      background: var(--color-primary-hover);
    }

    .input-area button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .result-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-3);
    }

    .result-card.error {
      border-color: #e74c3c;
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }

    .executor-tag {
      font-size: var(--font-size-xs);
      background: var(--color-sidebar);
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
      color: var(--color-text-secondary);
    }

    .result-actions-spacer {
      flex: 1;
    }

    .cancel-btn {
      border: 1px solid #e74c3c;
      background: rgba(231, 76, 60, 0.08);
      color: #c0392b;
      border-radius: var(--radius-sm);
      padding: 2px var(--space-2);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }

    .cancel-btn:hover:not(:disabled) {
      background: rgba(231, 76, 60, 0.16);
    }

    .cancel-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .reply {
      font-size: var(--font-size-sm);
      line-height: 1.6;
      white-space: pre-wrap;
      color: var(--color-text);
    }

    .plan-details {
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .plan-details summary {
      cursor: pointer;
      font-weight: var(--font-weight-medium);
    }

    .plan-details ol {
      margin: var(--space-2) 0 0;
      padding-left: var(--space-4);
    }

    .plan-details li {
      margin-bottom: var(--space-1);
    }

    .step-executor {
      color: var(--color-primary);
      font-weight: var(--font-weight-medium);
    }

    .plan-details code {
      display: block;
      margin-top: 2px;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      background: var(--color-bg);
      padding: 2px var(--space-1);
      border-radius: var(--radius-sm);
    }

    .summary-details {
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .summary-details summary {
      cursor: pointer;
      font-weight: var(--font-weight-medium);
    }

    .summary-stop-reason {
      margin-top: var(--space-2);
      color: var(--color-text);
      font-size: var(--font-size-xs);
      white-space: pre-wrap;
    }

    .summary-step-list {
      margin: var(--space-2) 0 0;
      padding-left: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .summary-step-item {
      margin: 0;
    }

    .summary-step-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .summary-step-head code {
      background: var(--color-bg);
      padding: 2px var(--space-1);
      border-radius: var(--radius-sm);
      color: var(--color-text);
      font-size: var(--font-size-xs);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .summary-step-status {
      font-size: var(--font-size-xs);
      padding: 1px var(--space-1);
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
    }

    .summary-step-status.success {
      border-color: #27ae60;
      color: #1f8a4d;
    }

    .summary-step-status.failed {
      border-color: #e74c3c;
      color: #c0392b;
    }

    .summary-output,
    .summary-error {
      margin: var(--space-1) 0 0;
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 260px;
      overflow: auto;
      color: var(--color-text);
      font-size: var(--font-size-xs);
      line-height: 1.5;
    }

    .summary-error {
      border: 1px solid rgba(231, 76, 60, 0.35);
      color: #c0392b;
    }

    .summary-empty {
      margin-top: var(--space-2);
      color: var(--color-text-secondary);
    }

    .error-msg {
      margin-top: var(--space-2);
      color: #e74c3c;
      font-size: var(--font-size-xs);
    }

    .error-msg.small {
      margin-top: var(--space-1);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.small {
      width: 6px;
      height: 6px;
    }

    .status-dot.active, .status-dot.running, .status-dot.pending, .status-dot.queued {
      background: #f39c12;
    }

    .status-dot.success, .status-dot.completed {
      background: #27ae60;
    }

    .status-dot.failed {
      background: #e74c3c;
    }

    .status-dot.canceled,
    .status-dot.cancelled {
      background: #7f8c8d;
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      flex: 1;
      overflow-y: auto;
    }

    .session-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      cursor: pointer;
      transition: border-color var(--transition-fast);
    }

    .session-card:hover {
      border-color: var(--color-primary);
    }

    .session-card.selected {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 1px rgba(92, 103, 242, 0.25);
    }

    .session-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .session-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      flex: 1;
    }

    .session-meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .run-list {
      margin-top: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .run-item {
      padding: var(--space-2);
      background: var(--color-bg);
      border-radius: var(--radius-sm);
    }

    .run-item.selected {
      outline: 1px solid var(--color-primary);
      background: rgba(92, 103, 242, 0.08);
    }

    .run-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
    }

    .run-input {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-executor {
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }

    .empty {
      text-align: center;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      padding: var(--space-6) 0;
    }
  `],
})
export class DevAgentComponent implements OnInit, OnDestroy {
  private static readonly TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
  private static readonly POLL_INTERVAL_MS = 1500;

  sessions = signal<DevSession[]>([]);
  sending = signal(false);
  lastResult = signal<DevTaskResult | null>(null);
  expandedSession = signal<string | null>(null);
  selectedSessionId = signal<string | null>(null);
  selectedRunId = signal<string | null>(null);
  cancellingRunId = signal<string | null>(null);
  inputText = '';

  /** 默认使用一个固定的 conversationId 做 dev 通道 */
  private devConversationId = '';
  private runPollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private devAgent: DevAgentService) {}

  ngOnInit() {
    this.loadSessions();
  }

  ngOnDestroy() {
    this.clearRunPolling();
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
          return;
        }

        this.selectedSessionId.set(activeSession.id);
        this.expandedSession.set(this.expandedSession() ?? activeSession.id);
        if (activeSession.conversationId) {
          this.devConversationId = activeSession.conversationId;
        } else if (!this.devConversationId) {
          this.devConversationId = 'dev-default';
        }
      },
    });
  }

  send() {
    const content = this.inputText.trim();
    if (!content || this.sending()) return;

    this.sending.set(true);
    const convId = this.devConversationId || 'dev-default';

    this.devAgent.sendDevMessage(convId, content).subscribe({
      next: (result) => {
        this.lastResult.set(result);
        this.selectedSessionId.set(result.session.id);
        this.expandedSession.set(result.session.id);
        this.selectedRunId.set(result.run.id);
        this.pollRun(result.run.id, result.session.id);
        this.inputText = '';
        this.sending.set(false);
        this.loadSessions(result.session.id);
      },
      error: (err) => {
        this.lastResult.set({
          session: { id: '', status: 'failed' },
          run: {
            id: '',
            status: 'failed',
            executor: null,
            plan: null,
            result: null,
            error: err.message || '请求失败',
            artifactPath: null,
          },
          reply: '请求失败：' + (err.error?.message || err.message || '未知错误'),
        });
        this.sending.set(false);
      },
    });
  }

  toggleSession(sessionId: string) {
    const next = this.expandedSession() === sessionId ? null : sessionId;
    this.expandedSession.set(next);
    this.selectedSessionId.set(sessionId);

    const session = this.sessions().find((s) => s.id === sessionId);
    if (session?.conversationId) {
      this.devConversationId = session.conversationId;
    }
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

  openRun(runId: string, event: Event) {
    event.stopPropagation();
    this.selectedRunId.set(runId);

    this.devAgent.getRun(runId).subscribe({
      next: (run) => {
        if (!run) return;
        this.lastResult.set(this.mapRunToTaskResult(run));
        this.selectedSessionId.set(run.sessionId);
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
    this.runPollTimer = setTimeout(task, DevAgentComponent.POLL_INTERVAL_MS);
  }

  private isTerminalStatus(status: string): boolean {
    return DevAgentComponent.TERMINAL_STATUSES.has(status);
  }

  isRunCancellable(status: string): boolean {
    return status === 'queued' || status === 'pending' || status === 'running';
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
    return sessions[0] ?? null;
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

    return {
      session: { id: run.sessionId, status: 'active' },
      run: {
        id: run.id,
        status: run.status,
        executor: run.executor,
        plan,
        result: run.result,
        error: run.error,
        artifactPath: run.artifactPath,
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
    const executor = step['executor'];
    return typeof step['index'] === 'number'
      && typeof step['description'] === 'string'
      && (executor === 'shell' || executor === 'openclaw' || executor === 'claude-code')
      && typeof step['command'] === 'string';
  }
}
