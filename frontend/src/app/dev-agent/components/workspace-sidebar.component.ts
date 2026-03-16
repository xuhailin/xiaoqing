import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DevSession } from '../../core/services/dev-agent.service';

@Component({
  selector: 'app-workspace-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="workspace-sidebar">
      <header class="sidebar-header">
        <div>
          <div class="eyebrow">Workspace</div>
          <h2>{{ workspaceName() }}</h2>
        </div>
        @if (workspaceOptions.length > 1) {
          <select
            [ngModel]="workspaceRoot"
            (ngModelChange)="workspaceRootSelect.emit($event)"
          >
            @for (option of workspaceOptions; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        }
      </header>

      <div class="sidebar-path">{{ workspaceRoot || '等待任务绑定 workspace' }}</div>

      <div class="session-list">
        @if (!sessions.length) {
          <div class="empty">
            发送第一条开发任务后，这里会显示当前 workspace 的会话列表。
          </div>
        } @else {
          @for (session of sessions; track session.id) {
            <button
              type="button"
              class="session-item"
              [class.active]="session.id === activeSessionId"
              (click)="selectSession.emit(session.id)"
            >
              <div class="session-title">{{ sessionTitle(session) }}</div>
              <div class="session-meta">
                <span class="session-dot" [class]="normalizeStatus(session)"></span>
                <span>{{ sessionTime(session) }}</span>
                @if (session.runs?.length) {
                  <span class="run-count">{{ session.runs.length }} run</span>
                }
              </div>
            </button>
          }
        }
      </div>
    </aside>
  `,
  styles: [`
    .workspace-sidebar {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-border);
      border-radius: 18px;
      background:
        radial-gradient(circle at top left, rgba(218, 119, 79, 0.08), transparent 24%),
        linear-gradient(180deg, rgba(255, 253, 249, 0.98), #f8f5ef);
      overflow: hidden;
    }

    .sidebar-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
      flex-shrink: 0;
    }

    .eyebrow {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--color-text-muted);
      margin-bottom: 4px;
    }

    .sidebar-header h2 {
      margin: 0;
      font-size: 1rem;
      color: var(--color-text);
    }

    .sidebar-header select {
      max-width: 160px;
      border: 1px solid var(--color-border);
      background: rgba(255, 255, 255, 0.92);
      border-radius: var(--radius-md);
      padding: 8px 10px;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      font-family: var(--font-family);
    }

    .sidebar-path {
      padding: 0 var(--space-4) var(--space-3);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      border-bottom: 1px solid var(--color-border-light);
      word-break: break-all;
      flex-shrink: 0;
    }

    .session-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-2);
      scrollbar-width: thin;
      scrollbar-color: var(--color-border) transparent;
    }

    .session-item {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border: none;
      background: transparent;
      border-radius: 12px;
      cursor: pointer;
      text-align: left;
      font-family: var(--font-family);
      color: var(--color-text);
      transition: background 0.15s;
    }

    .session-item:hover {
      background: rgba(255, 255, 255, 0.72);
    }

    .session-item.active {
      background: rgba(255, 255, 255, 0.92);
      box-shadow: var(--shadow-sm);
    }

    .session-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--color-text-muted);
    }

    .session-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .session-dot.running { background: #e8a033; }
    .session-dot.success { background: var(--color-success); }
    .session-dot.failed { background: var(--color-error); }

    .run-count {
      background: rgba(44, 40, 32, 0.06);
      border-radius: 999px;
      padding: 1px 6px;
      font-size: 10px;
    }

    .empty {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      background: rgba(255, 255, 255, 0.65);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      margin: var(--space-2);
    }
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
