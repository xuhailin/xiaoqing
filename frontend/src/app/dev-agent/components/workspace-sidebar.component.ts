import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DevSession } from '../../core/services/dev-agent.service';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../../shared/ui/app-section-header.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-workspace-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppBadgeComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
    AppStateComponent,
  ],
  template: `
    <app-panel variant="workbench" padding="none" class="workspace-sidebar">
      <header class="sidebar-header">
        <app-section-header
          eyebrow="Workspace"
          [title]="workspaceName()"
          [description]="workspaceRoot || '等待任务绑定 workspace'"
        >
          @if (workspaceOptions.length > 1) {
            <div actions>
              <select
                class="ui-select workspace-select"
                [ngModel]="workspaceRoot"
                (ngModelChange)="workspaceRootSelect.emit($event)"
              >
                @for (option of workspaceOptions; track option) {
                  <option [value]="option">{{ option }}</option>
                }
              </select>
            </div>
          }
        </app-section-header>
      </header>

      <div class="session-list ui-scrollbar">
        @if (!sessions.length) {
          <app-state
            [compact]="true"
            title="还没有 workspace 会话"
            description="发送第一条开发任务后，这里会显示当前 workspace 的会话列表。"
          />
        } @else {
          @for (session of sessions; track session.id) {
            <button
              type="button"
              class="session-item ui-list-card"
              [class.is-active]="session.id === activeSessionId"
              (click)="selectSession.emit(session.id)"
            >
              <div class="session-title">{{ sessionTitle(session) }}</div>
              <div class="session-meta">
                <span class="session-dot" [class]="normalizeStatus(session)"></span>
                <span>{{ sessionTime(session) }}</span>
                @if (session.runs.length) {
                  <app-badge tone="neutral" size="sm">{{ session.runs.length }} run</app-badge>
                }
              </div>
            </button>
          }
        }
      </div>
    </app-panel>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .workspace-sidebar {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
      flex-shrink: 0;
    }

    .workspace-select {
      max-width: 172px;
      font-size: var(--font-size-xs);
    }

    .session-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .session-item {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3);
      border: 1px solid var(--color-border-light);
      cursor: pointer;
      text-align: left;
      font-family: var(--font-family);
      color: var(--color-text);
    }

    .session-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-1);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .session-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .session-dot.running { background: var(--color-warning); }
    .session-dot.success { background: var(--color-success); }
    .session-dot.failed { background: var(--color-error); }
  `],
})
export class WorkspaceSidebarComponent {
  @Input() workspaceRoot = '';
  @Input() workspaceOptions: string[] = [];
  @Input() sessions: DevSession[] = [];
  @Input() activeSessionId: string | null = null;

  @Output() workspaceRootSelect = new EventEmitter<string>();
  @Output() selectSession = new EventEmitter<string>();

  sessionTitle(session: DevSession): string {
    if (session.title?.trim()) {
      return session.title.trim();
    }
    const latestRun = session.runs?.[session.runs.length - 1];
    if (latestRun?.userInput?.trim()) {
      const text = latestRun.userInput.trim();
      return text.length > 60 ? text.slice(0, 57) + '...' : text;
    }
    return '新的开发会话';
  }

  sessionTime(session: DevSession): string {
    const raw = session.updatedAt || session.createdAt;
    if (!raw) return '';
    const date = new Date(raw);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  normalizeStatus(session: DevSession): string {
    const hasRunning = session.runs?.some(
      (r) => r.status === 'running' || r.status === 'pending' || r.status === 'queued',
    );
    if (hasRunning) return 'running';
    const hasFailed = session.runs?.some((r) => r.status === 'failed');
    if (hasFailed) return 'failed';
    return 'success';
  }

  workspaceName(): string {
    const normalized = this.workspaceRoot.trim();
    if (!normalized) return 'Workspace';
    const parts = normalized.split('/').filter(Boolean);
    return parts.at(-1) ?? normalized;
  }
}
