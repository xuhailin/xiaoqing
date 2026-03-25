import { Component, computed, OnDestroy, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConversationService } from '../core/services/conversation.service';
import { DevAgentService } from '../core/services/dev-agent.service';
import {
  RegressionReportService,
  type RegressionLatestReportsResponse,
  type RegressionReportEnvelope,
  type RegressionReportMode,
  type RegressionRunState,
  type RegressionRunStatesResponse,
  type RegressionScenarioResult,
} from '../core/services/regression-report.service';

@Component({
  selector: 'app-regression-reports',
  standalone: true,
  imports: [DatePipe, DecimalPipe, NgClass],
  template: `
    <div class="regression-page">
      <section class="hero ui-workbench-surface ui-workbench-surface--soft ui-workbench-surface--compact">
        <div>
          <p class="eyebrow">QA / Replay</p>
          <h1>回归日志</h1>
          <p class="hero-copy">
            读取核心门禁（小晴基本能力）、代理门禁（DevAgent 等，更耗 token）与真实回放报告，查看通过率、失败点与逐轮日志。
          </p>
        </div>
        <button class="refresh-btn" (click)="load()">刷新报告</button>
      </section>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <section class="mode-grid">
        @for (card of reportCards(); track card.mode) {
          <div
            class="mode-card ui-workbench-card"
            [class.active]="selectedMode() === card.mode"
            [class.empty]="!card.report"
            (click)="selectedMode.set(card.mode)"
          >
            <div class="mode-head">
              <span class="mode-title">{{ modeCardTitle(card.mode) }}</span>
              <span class="mode-updated">
                @if (card.updatedAt) {
                  {{ card.updatedAt | date:'MM-dd HH:mm:ss' }}
                } @else {
                  暂无报告
                }
              </span>
            </div>
            @if (card.mode === 'gate-agents') {
              <p class="mode-hint">耗时与 token 较高，建议按需手动运行。</p>
            }

            <div class="mode-actions">
              @if (card.runState; as runState) {
                <span class="run-badge" [ngClass]="runStatusClass(runState.status)">
                  {{ runStatusLabel(runState.status) }}
                </span>
              }
              <button
                class="run-btn"
                [disabled]="isRunActive(card.runState) || actionLoading() === card.mode"
                (click)="startRun(card.mode, $event)"
              >
                @if (actionLoading() === card.mode) {
                  启动中...
                } @else if (isRunActive(card.runState)) {
                  运行中
                } @else {
                  {{ modeRunButtonLabel(card.mode) }}
                }
              </button>
            </div>

            @if (card.report; as report) {
              <div class="mode-stats">
                <div><strong>{{ report.summary.total }}</strong><span>总数</span></div>
                <div><strong>{{ report.summary.passed }}</strong><span>通过</span></div>
                <div><strong>{{ report.summary.failed }}</strong><span>失败</span></div>
                <div><strong>{{ report.summary.errored }}</strong><span>错误</span></div>
              </div>
            } @else {
              <p class="mode-empty">还没有生成这类最新报告。</p>
            }
          </div>
        }
      </section>

      <section class="console-panel">
        <div class="console-head">
          <div>
            <p class="console-title">{{ consolePanelTitle() }}</p>
            <p class="console-subtitle">
              @if (currentRunState(); as runState) {
                状态：{{ runStatusLabel(runState.status) }}
                @if (runState.startedAt) {
                  · 开始于 {{ runState.startedAt | date:'MM-dd HH:mm:ss' }}
                }
                @if (runState.finishedAt) {
                  · 结束于 {{ runState.finishedAt | date:'MM-dd HH:mm:ss' }}
                }
              } @else {
                当前没有运行状态
              }
            </p>
          </div>
          @if (currentRunState(); as runState) {
            <div class="console-meta">
              <span>PID {{ runState.pid || '-' }}</span>
              <span>Exit {{ runState.exitCode ?? '-' }}</span>
            </div>
          }
        </div>
        <pre class="console-output">{{ consoleText() }}</pre>
      </section>

      @if (currentEnvelope()?.report; as report) {
        <section class="summary-strip">
          <div class="summary-card ui-workbench-card">
            <span class="summary-label">Run ID</span>
            <span class="summary-value mono">{{ report.runId }}</span>
          </div>
          <div class="summary-card ui-workbench-card">
            <span class="summary-label">生成时间</span>
            <span class="summary-value">{{ report.generatedAt | date:'yyyy-MM-dd HH:mm:ss' }}</span>
          </div>
          <div class="summary-card ui-workbench-card">
            <span class="summary-label">硬失败</span>
            <span class="summary-value">{{ report.summary.hardFailed }}</span>
          </div>
          <div class="summary-card ui-workbench-card">
            <span class="summary-label">软失败</span>
            <span class="summary-value">{{ report.summary.softFailed }}</span>
          </div>
        </section>

        <section class="results-list">
          @for (result of report.results; track result.scenario.id) {
            <details class="result-card ui-workbench-surface" [attr.open]="result.status !== 'passed' ? true : null">
              <summary>
                <div class="summary-main">
                  <span class="status-badge" [ngClass]="statusClass(result.status)">{{ statusLabel(result.status) }}</span>
                  <div class="scenario-meta">
                    <strong>{{ result.scenario.name }}</strong>
                    <span>{{ result.scenario.id }}</span>
                  </div>
                </div>
                <div class="summary-side">
                  <span>{{ severityLabel(result.scenario.severity) }}</span>
                  @if (result.evidence) {
                    <span>{{ result.evidence.durationMs | number }} ms</span>
                  }
                </div>
              </summary>

              <div class="result-body">
                @if (result.errorMessage) {
                  <div class="error-box">{{ result.errorMessage }}</div>
                }

                @if (canDiagnose(result)) {
                  <div class="result-actions">
                    <button
                      class="diagnose-btn"
                      [disabled]="isDiagnosing(result)"
                      (click)="diagnose(result, $event)"
                    >
                      @if (isDiagnosing(result)) {
                        诊断启动中...
                      } @else {
                        诊断
                      }
                    </button>
                    <span class="result-path mono">{{ result.scenario.filePath }}</span>
                  </div>
                }

                @if (failedHardChecks(result).length > 0) {
                  <div class="signal-block">
                    <h3>硬失败</h3>
                    @for (check of failedHardChecks(result); track check.ruleType + check.detail) {
                      <div class="signal-row fail">
                        <span class="signal-name">{{ check.ruleType }}</span>
                        <span class="signal-detail">{{ check.detail }}</span>
                      </div>
                    }
                  </div>
                }

                @if (failedSoftScores(result).length > 0) {
                  <div class="signal-block">
                    <h3>软失败</h3>
                    @for (score of failedSoftScores(result); track score.dimension) {
                      <div class="signal-row warn">
                        <span class="signal-name">{{ score.dimension }}</span>
                        <span class="signal-detail">{{ score.score }}/{{ score.minScore }} · {{ score.rationale }}</span>
                      </div>
                    }
                  </div>
                }

                @if (result.evidence) {
                  <div class="meta-grid">
                    <div class="meta-card ui-workbench-card">
                      <span class="meta-label">最终路由</span>
                      <span class="meta-value">{{ result.evidence.finalRoute || '-' }}</span>
                    </div>
                    <div class="meta-card ui-workbench-card">
                      <span class="meta-label">能力命中</span>
                      <span class="meta-value">{{ joinValues(result.evidence.usedCapabilities) }}</span>
                    </div>
                    <div class="meta-card ui-workbench-card">
                      <span class="meta-label">提醒副作用</span>
                      <span class="meta-value">{{ result.evidence.createdChatReminders.length }}</span>
                    </div>
                    <div class="meta-card ui-workbench-card">
                      <span class="meta-label">清理结果</span>
                      <span class="meta-value">{{ result.evidence.cleanup.deletedConversation ? '已清理' : '未清理' }}</span>
                    </div>
                  </div>

                  <div class="final-reply">
                    <h3>最终回复</h3>
                    <pre>{{ result.evidence.finalReply }}</pre>
                  </div>

                  <div class="turn-log">
                    <h3>逐轮日志</h3>
                    @for (turn of result.evidence.turns; track turn.index) {
                      <div class="turn-card ui-workbench-card">
                        <div class="turn-head">
                          <span>Turn {{ turn.index + 1 }}</span>
                          <span>{{ turn.route }}</span>
                          <span>{{ turn.capabilityUsed || 'no-capability' }}</span>
                        </div>
                        <div class="turn-line">
                          <label>User</label>
                          <p>{{ turn.userInput }}</p>
                        </div>
                        <div class="turn-line">
                          <label>Assistant</label>
                          <p>{{ turn.finalReply }}</p>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </details>
          }
        </section>
      } @else if (!loading()) {
        <div class="empty-state">还没有可展示的最新报告，先运行 qa:gate、qa:gate-agents 或 qa:replay 即可生成。</div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .regression-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-section-gap);
      min-height: 100%;
      background: transparent;
      color: var(--color-text);
    }

    .hero {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
    }

    .eyebrow {
      margin: 0 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 12px;
      color: var(--color-text-muted);
    }

    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1;
      letter-spacing: -0.04em;
      color: var(--color-text);
    }

    .hero-copy {
      margin: 10px 0 0;
      max-width: 720px;
      color: var(--color-text-secondary);
      line-height: 1.6;
    }

    .refresh-btn {
      border: none;
      border-radius: 999px;
      background: var(--color-button-primary-bg);
      color: var(--color-button-primary-text);
      padding: 10px 16px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: var(--color-button-primary-shadow);
    }

    .error-banner,
    .empty-state {
      padding: var(--workbench-card-padding);
      border-radius: var(--workbench-card-radius);
      background: var(--color-error-bg);
      border: 1px solid var(--color-error-border);
      color: var(--color-error);
    }

    .mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--workbench-stack-gap);
    }

    .mode-card {
      text-align: left;
      padding: var(--workbench-card-padding);
      cursor: pointer;
      transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
    }

    .mode-card:hover,
    .mode-card.active {
      transform: translateY(-2px);
      border-color: var(--color-workbench-accent-strong);
      box-shadow: var(--shadow-md);
    }

    .mode-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .mode-title {
      font-weight: 700;
    }

    .mode-hint {
      margin: 8px 0 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      line-height: 1.45;
    }

    .mode-actions {
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .mode-updated {
      font-size: 12px;
      color: var(--color-text-muted);
    }

    .run-btn {
      border: none;
      border-radius: 999px;
      padding: 10px 14px;
      background: var(--color-button-primary-bg);
      color: var(--color-button-primary-text);
      font-size: 13px;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
    }

    .run-btn:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .run-badge {
      display: inline-flex;
      align-items: center;
      padding: 7px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .run-idle {
      background: var(--regression-run-idle-bg);
      color: var(--regression-run-idle-text);
    }

    .run-running {
      background: var(--color-warning-bg);
      color: var(--color-warning);
    }

    .run-success {
      background: var(--color-success-bg);
      color: var(--color-success);
    }

    .run-failed {
      background: var(--color-error-bg);
      color: var(--color-error);
    }

    .mode-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 12px;
    }

    .mode-stats div {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      border-radius: 14px;
      background: var(--color-surface-highlight);
      border: 1px solid var(--color-surface-highlight-border);
    }

    .mode-stats strong {
      font-size: 24px;
      color: var(--color-text);
    }

    .mode-stats span,
    .mode-empty {
      color: var(--color-text-secondary);
      font-size: 12px;
    }

    .console-panel {
      border-radius: var(--workbench-panel-radius);
      background: var(--regression-console-bg);
      color: var(--regression-console-text);
      padding: 16px 18px 18px;
      box-shadow: var(--workbench-surface-shadow);
      border: 1px solid var(--color-workbench-border);
      backdrop-filter: blur(20px);
    }

    .console-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .console-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--regression-console-title);
    }

    .console-subtitle {
      margin: 6px 0 0;
      font-size: 12px;
      color: var(--regression-console-muted);
    }

    .console-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      color: var(--regression-console-meta);
      font-size: 12px;
      font-family: "SFMono-Regular", "JetBrains Mono", monospace;
    }

    .console-output {
      margin: 0;
      padding: 16px;
      min-height: 180px;
      max-height: 360px;
      overflow: auto;
      border-radius: 18px;
      background: var(--regression-console-output-bg);
      border: 1px solid var(--regression-console-output-border);
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.55;
      font-family: "SFMono-Regular", "JetBrains Mono", monospace;
      color: var(--regression-console-text);
    }

    .summary-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--workbench-stack-gap);
    }

    .summary-card,
    .meta-card {
      padding: var(--workbench-card-padding);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .meta-card {
      background: var(--color-surface-highlight);
      border-color: var(--color-surface-highlight-border);
      box-shadow: var(--color-surface-highlight-shadow);
    }

    .summary-label,
    .meta-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
    }

    .summary-value,
    .meta-value {
      font-size: 1rem;
      color: var(--color-text);
      font-weight: 600;
    }

    .mono {
      font-family: "SFMono-Regular", "JetBrains Mono", monospace;
      word-break: break-all;
    }

    .results-list {
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
    }

    .result-card {
      overflow: hidden;
    }

    summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: var(--workbench-card-padding);
    }

    summary::-webkit-details-marker {
      display: none;
    }

    .summary-main,
    .summary-side {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .summary-side {
      color: var(--color-text-secondary);
      font-size: 12px;
      flex-wrap: wrap;
    }

    .scenario-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .scenario-meta strong {
      font-size: 16px;
    }

    .scenario-meta span {
      font-size: 12px;
      color: var(--color-text-muted);
      font-family: "SFMono-Regular", "JetBrains Mono", monospace;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 66px;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .status-passed {
      background: var(--color-success-bg);
      color: var(--color-success);
    }

    .status-failed {
      background: var(--color-warning-bg);
      color: var(--color-warning);
    }

    .status-error {
      background: var(--color-error-bg);
      color: var(--color-error);
    }

    .result-body {
      padding: 0 1rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .signal-block {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.875rem;
      border-radius: var(--workbench-card-radius);
      background: var(--color-panel-subtle-bg);
      border: 1px solid var(--color-workbench-border);
    }

    .error-box {
      padding: 0.75rem 0.875rem;
      border-radius: var(--workbench-card-radius);
      background: var(--color-error-bg);
      color: var(--color-error);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .result-actions {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 0.625rem 0.75rem;
      border-radius: var(--workbench-card-radius);
      background: var(--regression-result-action-bg);
      border: 1px solid var(--color-workbench-border);
    }

    .diagnose-btn {
      border: none;
      border-radius: 999px;
      padding: 8px 12px;
      background: var(--color-button-primary-bg);
      color: var(--color-button-primary-text);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: var(--color-button-primary-shadow);
    }

    .diagnose-btn:disabled {
      opacity: 0.65;
      cursor: wait;
    }

    .result-path {
      color: var(--color-text-secondary);
      font-size: 12px;
    }

    .signal-block h3,
    .final-reply h3,
    .turn-log h3 {
      margin: 0 0 8px;
      font-size: 13px;
      color: var(--color-workbench-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .signal-row {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 14px;
      border: 1px solid transparent;
    }

    .signal-row.fail {
      background: var(--color-error-bg);
      border-color: var(--color-error-border);
    }

    .signal-row.warn {
      background: var(--color-warning-bg);
      border-color: var(--color-warning-border);
    }

    .signal-name {
      font-family: "SFMono-Regular", "JetBrains Mono", monospace;
      font-size: 12px;
      color: var(--color-workbench-muted);
    }

    .signal-detail {
      font-size: 13px;
      color: var(--color-text);
      line-height: 1.5;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--workbench-stack-gap);
    }

    .final-reply pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 0.875rem;
      border-radius: var(--workbench-card-radius);
      background: var(--regression-final-reply-bg);
      border: 1px solid var(--color-workbench-border);
      line-height: 1.65;
      color: var(--color-text);
    }

    .turn-log {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .turn-card {
      padding: 0.75rem 0.875rem;
      background: var(--color-surface-muted);
      border: 1px solid var(--color-workbench-border);
      box-shadow: none;
    }

    .turn-head {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
      color: var(--color-text-secondary);
      font-size: 12px;
      font-family: "SFMono-Regular", "JetBrains Mono", monospace;
      flex-wrap: wrap;
    }

    .turn-line {
      display: grid;
      grid-template-columns: 70px 1fr;
      gap: 12px;
      align-items: start;
      margin-bottom: 8px;
    }

    .turn-line:last-child {
      margin-bottom: 0;
    }

    .turn-line label {
      color: var(--color-text-muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .turn-line p {
      margin: 0;
      white-space: pre-wrap;
      line-height: 1.6;
      color: var(--color-text);
      padding: 0.625rem 0.75rem;
      border-radius: var(--radius-md);
      background: var(--color-panel-subtle-bg);
    }

    @media (max-width: 900px) {
      .regression-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .hero {
        flex-direction: column;
      }

      .console-head,
      .mode-actions {
        flex-direction: column;
        align-items: flex-start;
      }

      summary,
      .summary-main,
      .summary-side {
        align-items: flex-start;
      }

      summary {
        flex-direction: column;
      }

      .signal-row,
      .turn-line {
        grid-template-columns: 1fr;
      }

      .result-actions {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `],
})
export class RegressionReportsComponent implements OnDestroy {
  protected readonly loading = signal(false);
  protected readonly actionLoading = signal<RegressionReportMode | null>(null);
  protected readonly diagnosingScenarioId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedMode = signal<RegressionReportMode>('gate');
  protected readonly reports = signal<RegressionLatestReportsResponse | null>(null);
  protected readonly runStates = signal<RegressionRunStatesResponse | null>(null);
  protected readonly currentEnvelope = computed(() => {
    const reports = this.reports();
    if (!reports) return null;
    const mode = this.selectedMode();
    if (mode === 'gate') return reports.gate;
    if (mode === 'gate-agents') return reports.gateAgents;
    return reports.replay;
  });
  protected readonly currentRunState = computed(() => {
    const states = this.runStates();
    if (!states) return null;
    const mode = this.selectedMode();
    if (mode === 'gate') return states.gate;
    if (mode === 'gate-agents') return states.gateAgents;
    return states.replay;
  });
  protected readonly reportCards = computed(() => {
    const reports = this.reports();
    const states = this.runStates();
    return [
      buildCard('gate', reports?.gate ?? null, states?.gate ?? null),
      buildCard('gate-agents', reports?.gateAgents ?? null, states?.gateAgents ?? null),
      buildCard('replay', reports?.replay ?? null, states?.replay ?? null),
    ];
  });
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly regressionReports: RegressionReportService,
    private readonly conversationService: ConversationService,
    private readonly devAgent: DevAgentService,
    private readonly router: Router,
  ) {
    void this.load();
    this.startPolling();
  }

  ngOnDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  protected async load() {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [reports, runStates] = await Promise.all([
        firstValueFrom(this.regressionReports.getLatestReports()),
        firstValueFrom(this.regressionReports.getRunStates()),
      ]);
      this.reports.set(reports);
      this.runStates.set(runStates);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(`加载回归报告失败：${message}`);
    } finally {
      this.loading.set(false);
    }
  }

  protected failedHardChecks(result: RegressionScenarioResult) {
    return result.hardChecks.filter((check) => !check.passed);
  }

  protected failedSoftScores(result: RegressionScenarioResult) {
    return result.softScores.filter((score) => !score.passed);
  }

  protected canDiagnose(result: RegressionScenarioResult) {
    return result.status !== 'passed';
  }

  protected isDiagnosing(result: RegressionScenarioResult) {
    return this.diagnosingScenarioId() === result.scenario.id;
  }

  protected statusClass(status: RegressionScenarioResult['status']) {
    return {
      'status-passed': status === 'passed',
      'status-failed': status === 'failed',
      'status-error': status === 'error',
    };
  }

  protected statusLabel(status: RegressionScenarioResult['status']) {
    switch (status) {
      case 'passed':
        return 'Passed';
      case 'failed':
        return 'Failed';
      default:
        return 'Error';
    }
  }

  protected severityLabel(severity: RegressionScenarioResult['scenario']['severity']) {
    switch (severity) {
      case 'critical':
        return 'Critical';
      case 'high':
        return 'High';
      case 'medium':
        return 'Medium';
      default:
        return 'Low';
    }
  }

  protected joinValues(values: string[]) {
    return values.length > 0 ? values.join(', ') : '-';
  }

  protected modeCardTitle(mode: RegressionReportMode): string {
    switch (mode) {
      case 'gate':
        return '小晴基本能力';
      case 'gate-agents':
        return '代理能力（DevAgent）';
      case 'replay':
        return '真实回放';
    }
  }

  protected modeRunButtonLabel(mode: RegressionReportMode): string {
    switch (mode) {
      case 'gate':
        return '运行基本能力门禁';
      case 'gate-agents':
        return '运行代理能力门禁';
      case 'replay':
        return '运行真实回放';
    }
  }

  protected consolePanelTitle(): string {
    switch (this.selectedMode()) {
      case 'gate':
        return '基本能力门禁 · 运行台';
      case 'gate-agents':
        return '代理能力门禁 · 运行台';
      case 'replay':
        return '真实回放 · 运行台';
    }
  }

  protected runStatusLabel(status: RegressionRunState['status']) {
    switch (status) {
      case 'starting':
        return '启动中';
      case 'running':
        return '运行中';
      case 'succeeded':
        return '成功';
      case 'failed':
        return '失败';
      default:
        return '空闲';
    }
  }

  protected runStatusClass(status: RegressionRunState['status']) {
    return {
      'run-idle': status === 'idle',
      'run-running': status === 'starting' || status === 'running',
      'run-success': status === 'succeeded',
      'run-failed': status === 'failed',
    };
  }

  protected isRunActive(state: RegressionRunState | null | undefined) {
    return !!state && (state.status === 'starting' || state.status === 'running');
  }

  protected async startRun(mode: RegressionReportMode, event?: Event) {
    event?.stopPropagation();
    this.actionLoading.set(mode);
    this.error.set(null);

    try {
      const state = await firstValueFrom(this.regressionReports.startRun(mode));
      const current = this.runStates();
      this.runStates.set({
        gate: mode === 'gate' ? state : (current?.gate ?? createEmptyRunState('gate')),
        gateAgents: mode === 'gate-agents' ? state : (current?.gateAgents ?? createEmptyRunState('gate-agents')),
        replay: mode === 'replay' ? state : (current?.replay ?? createEmptyRunState('replay')),
      });
      this.selectedMode.set(mode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(`启动回归失败：${message}`);
    } finally {
      this.actionLoading.set(null);
    }
  }

  protected consoleText() {
    const logs = this.currentRunState()?.logs ?? [];
    return logs.length > 0 ? logs.join('\n') : '还没有运行日志。';
  }

  protected async diagnose(result: RegressionScenarioResult, event?: Event) {
    event?.stopPropagation();
    const workspaceRoot = deriveWorkspaceRoot(result);
    if (!workspaceRoot) {
      this.error.set(`无法为 ${result.scenario.id} 推断项目根目录，诊断未启动。`);
      return;
    }

    const scenarioId = result.scenario.id;
    this.diagnosingScenarioId.set(scenarioId);
    this.error.set(null);

    try {
      const conversation = await firstValueFrom(this.conversationService.create());
      const task = buildDiagnosisPrompt(this.selectedMode(), result, workspaceRoot);
      const response = await firstValueFrom(
        this.devAgent.sendDevMessage(conversation.id, task, { workspaceRoot, devRunMode: 'agent' }),
      );

      await this.router.navigate(['/workspace/dev-agent'], {
        queryParams: {
          sessionId: response.session.id,
          runId: response.run.id,
          workspaceRoot,
        },
        state: {
          notice: `已为 ${result.scenario.name} 发起诊断任务，正在交给 DevAgent 排查。`,
        },
      });
    } catch (err) {
      this.error.set(`启动诊断失败：${readErrorMessage(err)}`);
    } finally {
      this.diagnosingScenarioId.set(null);
    }
  }

  private startPolling() {
    this.pollTimer = setInterval(() => {
      void this.refreshRunStates();
    }, 2500);
  }

  private async refreshRunStates() {
    try {
      const runStates = await firstValueFrom(this.regressionReports.getRunStates());
      const previous = this.runStates();
      this.runStates.set(runStates);

      const previousActive = previous
        ? Object.values(previous).some((state) => this.isRunActive(state))
        : false;
      const currentActive = Object.values(runStates).some((state) => this.isRunActive(state));
      const justFinished = previousActive && !currentActive;

      if (justFinished || currentActive) {
        const reports = await firstValueFrom(this.regressionReports.getLatestReports());
        this.reports.set(reports);
      }
    } catch {
      // keep previous state
    }
  }
}

function buildCard(
  mode: RegressionReportMode,
  envelope: RegressionReportEnvelope | null,
  state: RegressionRunState | null,
) {
  return {
    mode,
    updatedAt: envelope?.updatedAt ?? null,
    report: envelope?.report ?? null,
    runState: state,
  };
}

function createEmptyRunState(mode: RegressionReportMode): RegressionRunState {
  return {
    mode,
    status: 'idle',
    command: [],
    pid: null,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    logs: [],
    error: null,
    runReportGeneratedAt: null,
    latestReportUpdatedAt: null,
    latestReportGeneratedAt: null,
    latestReportSummary: null,
  };
}

function deriveWorkspaceRoot(result: RegressionScenarioResult): string | null {
  const sourcePath = result.evidence?.sourcePath?.trim() || result.scenario.filePath?.trim();
  if (!sourcePath) {
    return null;
  }
  const marker = '/qa/';
  const markerIndex = sourcePath.indexOf(marker);
  if (markerIndex > 0) {
    return sourcePath.slice(0, markerIndex);
  }
  return null;
}

function buildDiagnosisPrompt(
  mode: RegressionReportMode,
  result: RegressionScenarioResult,
  workspaceRoot: string,
): string {
  const hardFailures = result.hardChecks
    .filter((check) => !check.passed)
    .map((check) => `- ${check.ruleType}: ${check.detail}`)
    .join('\n') || '- 无';
  const softFailures = result.softScores
    .filter((score) => !score.passed)
    .map((score) => `- ${score.dimension}: ${score.score}/${score.minScore} (${score.rationale})`)
    .join('\n') || '- 无';
  const turns = (result.evidence?.turns ?? [])
    .map((turn) => [
      `Turn ${turn.index + 1}`,
      `User: ${turn.userInput}`,
      `Assistant: ${turn.finalReply}`,
      `Route: ${turn.route}`,
      `Capability: ${turn.capabilityUsed || 'none'}`,
    ].join('\n'))
    .join('\n\n');

  return [
    '请对这个对话回归失败做原因排查，先不要改代码。',
    '',
    `项目根目录: ${workspaceRoot}`,
    `回归模式: ${mode}`,
    `场景 ID: ${result.scenario.id}`,
    `场景名称: ${result.scenario.name}`,
    `严重级别: ${result.scenario.severity}`,
    `场景文件: ${result.scenario.filePath}`,
    `结果状态: ${result.status}`,
    '',
    '硬失败:',
    hardFailures,
    '',
    '软失败:',
    softFailures,
    '',
    '最终回复:',
    result.evidence?.finalReply || result.errorMessage || '无',
    '',
    '逐轮对话:',
    turns || '无',
    '',
    '请完成以下事情：',
    '1. 查看相关代码与架构，定位最可能的根因。',
    '2. 指出具体涉及的模块、类、函数或 prompt 组织位置。',
    '3. 解释为什么当前实现会触发这条回归失败。',
    '4. 给出修复建议，但先不要直接动代码。',
    '5. 回复时优先给 root cause 和证据链，不要泛泛而谈。',
  ].join('\n');
}

function readErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const nested = record['error'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedMessage = (nested as Record<string, unknown>)['message'];
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage.trim();
      }
    }
    const message = record['message'];
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}
