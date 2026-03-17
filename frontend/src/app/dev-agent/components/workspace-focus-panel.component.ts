import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DevSession } from '../../core/services/dev-agent.service';
import { ChatInputComponent } from './chat-input.component';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../../shared/ui/app-section-header.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-workspace-focus-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChatInputComponent,
    AppBadgeComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
    AppStateComponent,
  ],
  template: `
    <app-panel variant="workbench" padding="none" class="focus-panel">
      <header class="focus-header">
        <app-section-header
          eyebrow="Current Workspace"
          [title]="workspaceName()"
          description="默认操作上下文。你可以在这里直接新建 session，也能快速继续当前 workspace 下的会话。"
        >
          <div actions class="header-actions">
            <app-badge tone="neutral" appearance="outline">{{ sessions.length }} sessions</app-badge>
          </div>
        </app-section-header>

        <label class="workspace-field">
          <span class="field-label">Workspace Root</span>
          <input
            class="ui-input"
            type="text"
            [ngModel]="workspaceRoot"
            (ngModelChange)="workspaceRootChange.emit($event)"
            [attr.list]="workspaceListId"
            placeholder="/path/to/current-workspace"
          />
          <datalist [id]="workspaceListId">
            @for (option of workspaceOptions; track option) {
              <option [value]="option"></option>
            }
          </datalist>
        </label>
      </header>

      <section class="new-session">
        <div class="section-label">+ New Session</div>
        <app-chat-input
          [taskInput]="taskInput"
          [sending]="sending"
          placeholder="描述你想在当前 workspace 发起的新 session"
          hint="例如：排查回归失败 / 修复编译错误 / 帮我梳理 devagent workspace 结构"
          submitLabel="新建 Session"
          (taskInputChange)="taskInputChange.emit($event)"
          (submit)="submit.emit()"
        />
      </section>

      <section class="session-feed">
        <div class="section-head">
          <div>
            <div class="section-title">Current Workspace Sessions</div>
            <div class="section-description">
              默认只看当前 workspace，点任意 session 进入对话执行界面。
            </div>
          </div>
        </div>

        <div class="session-list ui-scrollbar">
          @if (!workspaceRoot.trim()) {
            <app-state
              [compact]="true"
              title="先指定一个 workspace"
              description="输入或选择 Workspace Root，然后就可以直接在这个上下文里新建 session。"
            />
          } @else if (!sortedSessions().length) {
            <app-state
              [compact]="true"
              title="这个 workspace 还没有 session"
              description="先从上面的 New Session 发起第一条任务。"
            />
          } @else {
            @for (session of sortedSessions(); track session.id) {
              <button
                type="button"
                class="session-card ui-list-card"
                [class.is-active]="session.id === activeSessionId"
                (click)="selectSession.emit(session.id)"
              >
                <div class="card-head">
                  <div class="card-title">{{ sessionTitle(session) }}</div>
                  <app-badge [tone]="statusTone(session)" [caps]="true">
                    {{ statusLabel(session) }}
                  </app-badge>
                </div>

                <div class="card-meta">
                  <span>{{ sessionTime(session) }}</span>
                  <span>{{ session.runs.length }} runs</span>
                </div>

                @if (latestTask(session)) {
                  <div class="card-task">{{ latestTask(session) }}</div>
                }
              </button>
            }
          }
        </div>
      </section>
    </app-panel>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .focus-panel {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .focus-header {
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
      background:
        linear-gradient(180deg, rgba(79, 109, 245, 0.08), rgba(255, 255, 255, 0));
    }

    .header-actions {
      display: flex;
      justify-content: flex-end;
    }

    .workspace-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .field-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .new-session {
      border-bottom: 1px solid var(--color-border-light);
    }

    .section-label {
      padding: var(--space-3) var(--space-4) 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .session-feed {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .section-head {
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
    }

    .section-title {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .section-description {
      margin-top: 4px;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.6;
    }

    .session-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .session-card {
      width: 100%;
      padding: var(--space-4);
      text-align: left;
      color: var(--color-text);
      cursor: pointer;
    }

    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .card-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      margin-top: var(--space-3);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .card-task {
      margin-top: var(--space-3);
      font-size: var(--font-size-sm);
      color: var(--color-workbench-muted);
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    @media (max-width: 1180px) {
      .workspace-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `],
})
export class WorkspaceFocusPanelComponent {
  @Input() workspaceRoot = '';
  @Input() workspaceOptions: string[] = [];
  @Input() sessions: DevSession[] = [];
  @Input() activeSessionId: string | null = null;
  @Input() taskInput = '';
  @Input() sending = false;

  @Output() workspaceRootChange = new EventEmitter<string>();
  @Output() taskInputChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();
  @Output() selectSession = new EventEmitter<string>();

  protected readonly workspaceListId = 'dev-agent-workspace-options';

  protected sortedSessions() {
    return [...this.sessions].sort(
      (left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt),
    );
  }

  protected sessionTitle(session: DevSession): string {
    if (session.title?.trim()) {
      return session.title.trim();
    }
    const latestRun = session.runs?.[session.runs.length - 1];
    if (latestRun?.userInput?.trim()) {
      const text = latestRun.userInput.trim();
      return text.length > 64 ? `${text.slice(0, 61)}...` : text;
    }
    return '新的开发会话';
  }

  protected latestTask(session: DevSession): string | null {
    const latestRun = [...(session.runs ?? [])]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    const task = latestRun?.userInput?.trim();
    return task ? task : null;
  }

  protected sessionTime(session: DevSession): string {
    const raw = session.updatedAt || session.createdAt;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected statusTone(session: DevSession): 'warning' | 'danger' | 'success' {
    const status = this.normalizeStatus(session);
    if (status === 'running') return 'warning';
    if (status === 'failed') return 'danger';
    return 'success';
  }

  protected statusLabel(session: DevSession): string {
    const status = this.normalizeStatus(session);
    if (status === 'running') return 'Running';
    if (status === 'failed') return 'Failed';
    return 'Success';
  }

  protected workspaceName(): string {
    const normalized = this.workspaceRoot.trim();
    if (!normalized) {
      return 'Choose Workspace';
    }
    const parts = normalized.split('/').filter(Boolean);
    return parts.at(-1) ?? normalized;
  }

  private normalizeStatus(session: DevSession): 'running' | 'failed' | 'success' {
    const hasRunning = session.runs?.some(
      (run) => run.status === 'queued' || run.status === 'pending' || run.status === 'running',
    );
    if (hasRunning) return 'running';
    const hasFailed = session.runs?.some((run) => run.status === 'failed');
    if (hasFailed) return 'failed';
    return 'success';
  }
}
