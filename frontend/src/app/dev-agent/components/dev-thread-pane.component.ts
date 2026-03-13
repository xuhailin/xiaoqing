import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DevSession } from '../../core/services/dev-agent.service';

type ThreadStatusFilter = 'all' | 'running' | 'failed' | 'success';

interface WorkspaceGroup {
  key: string;
  root: string | null;
  label: string;
  sessions: DevSession[];
}

@Component({
  selector: 'app-dev-thread-pane',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="thread-pane">
      <header class="thread-header">
        <h3>线程任务</h3>
        <span class="count">{{ sessions.length }}</span>
      </header>

      <section class="workspace-tree">
        <div class="workspace-head">
          <span>工作区</span>
          <button
            type="button"
            class="workspace-add"
            (click)="openWorkspaceCreator()"
            title="新增工作区路径"
          >
            +
          </button>
        </div>

        @if (creatingWorkspace()) {
          <div class="workspace-create">
            <input
              type="text"
              [ngModel]="newWorkspaceRoot()"
              (ngModelChange)="newWorkspaceRoot.set($event)"
              placeholder="输入绝对路径（例如 /Users/.../backend）"
            />
            <div class="workspace-create-actions">
              <button type="button" class="subtle" (click)="pickDirectoryName()">选目录</button>
              <button type="button" class="subtle" (click)="confirmWorkspace()">添加</button>
              <button type="button" class="subtle" (click)="cancelWorkspaceCreator()">取消</button>
            </div>
            @if (pickerHint()) {
              <div class="hint">{{ pickerHint() }}</div>
            }
          </div>
        }

        <div class="workspace-list">
          @for (group of workspaceGroups(); track group.key) {
            <article class="workspace-group" [class.active]="isWorkspaceActive(group.root)">
              <button
                type="button"
                class="workspace-node"
                (click)="selectWorkspace(group.root)"
              >
                <span class="node-label">{{ group.label }}</span>
                <span class="node-path">{{ workspacePathText(group.root) }}</span>
                <span class="node-count">{{ group.sessions.length }}</span>
              </button>

              <div class="session-list">
                @for (session of sortedSessions(group.sessions); track session.id) {
                  <article
                    class="session-card"
                    [class.selected]="selectedSessionId === session.id"
                    (click)="sessionToggle.emit(session.id)"
                  >
                    <div class="session-head-row">
                      <span class="status-dot" [class]="latestRunStatus(session)"></span>
                      <span class="title">{{ session.title || session.id.slice(0, 8) }}</span>
                      <span class="meta">{{ session.runs.length }} runs</span>
                    </div>
                    <div class="badges">
                      @if (latestRunGroup(session) === 'running') {
                        <span class="badge running">RUNNING</span>
                      }
                      @if (failedCount(session) > 0) {
                        <span class="badge failed">{{ failedCount(session) }} failed</span>
                      }
                    </div>

                    @if (expandedSessionId === session.id) {
                      <div class="run-list">
                        @for (run of session.runs; track run.id) {
                          <button
                            type="button"
                            class="run-item"
                            [class.selected]="selectedRunId === run.id"
                            (click)="handleRunSelect($event, run.id)"
                          >
                            <span class="status-dot small" [class]="run.status"></span>
                            <span class="input">{{ run.userInput }}</span>
                            <span class="executor">{{ run.executor || '-' }}</span>
                          </button>
                        }
                      </div>
                    }
                  </article>
                }
              </div>
            </article>
          }

          @if (workspaceGroups().length === 0) {
            <div class="empty">暂无符合条件的会话</div>
          }
        </div>
      </section>

      <div class="thread-filters">
        <input
          type="text"
          [ngModel]="searchText"
          (ngModelChange)="searchTextChange.emit($event)"
          placeholder="搜索任务、路径或 runId"
        />
        <select
          [ngModel]="statusFilter"
          (ngModelChange)="statusFilterChange.emit($event)"
        >
          <option value="all">全部</option>
          <option value="running">进行中</option>
          <option value="failed">失败</option>
          <option value="success">成功</option>
        </select>
      </div>
    </section>
  `,
  styles: [`
    .thread-pane {
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-height: 0;
      height: 100%;
      gap: var(--space-2);
      overflow: hidden;
    }

    .thread-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .thread-header h3 {
      margin: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }

    .count {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      background: var(--color-bg);
      border-radius: var(--radius-pill);
      padding: 2px var(--space-2);
    }

    .workspace-tree {
      min-height: 0;
      display: grid;
      grid-template-rows: auto auto 1fr;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: #fff;
      overflow: hidden;
    }

    .workspace-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }

    .workspace-add {
      border: 1px solid var(--color-border);
      border-radius: 50%;
      width: 22px;
      height: 22px;
      line-height: 20px;
      background: #fff;
      color: var(--color-text-secondary);
      cursor: pointer;
      font-size: 14px;
      padding: 0;
    }

    .workspace-create {
      border-bottom: 1px solid var(--color-border-light);
      padding: var(--space-2);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .workspace-create input {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 6px var(--space-2);
      font-size: var(--font-size-xs);
      font-family: var(--font-family);
      outline: none;
    }

    .workspace-create input:focus {
      border-color: var(--color-primary);
    }

    .workspace-create-actions {
      display: flex;
      gap: var(--space-1);
      flex-wrap: wrap;
    }

    .subtle {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: #fff;
      color: var(--color-text-secondary);
      font-size: 11px;
      padding: 2px var(--space-2);
      cursor: pointer;
    }

    .hint {
      font-size: 10px;
      color: var(--color-text-secondary);
      line-height: 1.4;
    }

    .workspace-list {
      min-height: 0;
      overflow: auto;
      padding: var(--space-2);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .workspace-group {
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .workspace-group.active {
      border-color: rgba(92, 103, 242, 0.35);
    }

    .workspace-node {
      width: 100%;
      border: none;
      border-bottom: 1px solid var(--color-border-light);
      background: var(--color-bg);
      padding: 6px var(--space-2);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px var(--space-2);
      align-items: center;
      text-align: left;
      cursor: pointer;
    }

    .node-label {
      font-size: 11px;
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .node-path {
      grid-column: 1 / 2;
      font-size: 10px;
      color: var(--color-text-secondary);
      word-break: break-all;
    }

    .node-count {
      grid-column: 2 / 3;
      grid-row: 1 / 3;
      font-size: 10px;
      color: var(--color-text-secondary);
      align-self: center;
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-1);
    }

    .session-card {
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: #fff;
      padding: var(--space-1);
      cursor: pointer;
    }

    .session-card.selected {
      border-color: rgba(92, 103, 242, 0.4);
      background: rgba(92, 103, 242, 0.06);
    }

    .session-head-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--space-1);
    }

    .title {
      font-size: 11px;
      font-weight: var(--font-weight-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      font-size: 10px;
      color: var(--color-text-secondary);
    }

    .badges {
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: var(--space-1);
      flex-wrap: wrap;
    }

    .badge {
      font-size: 10px;
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      border-radius: var(--radius-pill);
      padding: 1px var(--space-2);
      background: #fff;
    }

    .badge.running {
      border-color: rgba(243, 156, 18, 0.4);
      color: #b9770e;
      background: rgba(252, 243, 207, 0.7);
    }

    .badge.failed {
      border-color: rgba(231, 76, 60, 0.35);
      color: #c0392b;
      background: rgba(254, 242, 242, 0.8);
    }

    .run-list {
      margin-top: var(--space-1);
      border-top: 1px solid var(--color-border-light);
      padding-top: var(--space-1);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .run-item {
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--space-1);
      align-items: center;
      padding: 4px 6px;
      text-align: left;
      cursor: pointer;
      font-family: var(--font-family);
    }

    .run-item.selected {
      border-color: rgba(92, 103, 242, 0.35);
      background: rgba(92, 103, 242, 0.08);
    }

    .run-item .input {
      font-size: 10px;
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-item .executor {
      font-size: 10px;
      color: var(--color-text-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #7f8c8d;
    }

    .status-dot.small {
      width: 6px;
      height: 6px;
    }

    .status-dot.running,
    .status-dot.pending,
    .status-dot.queued {
      background: #f39c12;
    }

    .status-dot.success {
      background: #27ae60;
    }

    .status-dot.failed {
      background: #e74c3c;
    }

    .status-dot.cancelled {
      background: #7f8c8d;
    }

    .thread-filters {
      display: grid;
      grid-template-columns: 1fr 92px;
      gap: var(--space-2);
    }

    .thread-filters input,
    .thread-filters select {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 6px var(--space-2);
      background: #fff;
      color: var(--color-text);
      font-family: var(--font-family);
      font-size: var(--font-size-xs);
      outline: none;
    }

    .thread-filters input:focus,
    .thread-filters select:focus {
      border-color: var(--color-primary);
    }

    .empty {
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      text-align: center;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
  `],
})
export class DevThreadPaneComponent {
  @Input() sessions: DevSession[] = [];
  @Input() selectedSessionId: string | null = null;
  @Input() selectedRunId: string | null = null;
  @Input() expandedSessionId: string | null = null;
  @Input() searchText = '';
  @Input() statusFilter: ThreadStatusFilter = 'all';
  @Input() activeWorkspaceRoot = '';

  @Output() searchTextChange = new EventEmitter<string>();
  @Output() statusFilterChange = new EventEmitter<ThreadStatusFilter>();
  @Output() sessionToggle = new EventEmitter<string>();
  @Output() runSelect = new EventEmitter<string>();
  @Output() workspaceSelect = new EventEmitter<string>();

  creatingWorkspace = signal(false);
  newWorkspaceRoot = signal('');
  pickerHint = signal<string | null>(null);

  workspaceGroups(): WorkspaceGroup[] {
    const map = new Map<string, DevSession[]>();
    for (const session of this.filteredSessions()) {
      const root = session.workspaceRoot?.trim() || '';
      const key = root || '__default__';
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }

    const roots = Array.from(map.keys()).sort((a, b) => {
      if (a === '__default__') return -1;
      if (b === '__default__') return 1;
      return a.localeCompare(b);
    });

    let customIndex = 2;
    return roots.map((key) => {
      const root = key === '__default__' ? null : key;
      const label = root ? `${customIndex++}号工作区` : '默认工作区';
      return {
        key,
        root,
        label,
        sessions: this.sortedSessions(map.get(key) ?? []),
      };
    });
  }

  filteredSessions(): DevSession[] {
    const keyword = this.searchText.trim().toLowerCase();
    return this.sessions.filter((session) => {
      if (this.statusFilter !== 'all' && this.latestRunGroup(session) !== this.statusFilter) {
        return false;
      }
      if (!keyword) return true;

      const fields = [
        session.id,
        session.title ?? '',
        session.workspaceRoot ?? '',
        ...session.runs.map((run) => `${run.id} ${run.userInput}`),
      ].join(' ').toLowerCase();
      return fields.includes(keyword);
    });
  }

  sortedSessions(sessions: DevSession[]): DevSession[] {
    return sessions.slice().sort((a, b) => this.sessionSortWeight(a) - this.sessionSortWeight(b));
  }

  latestRunStatus(session: DevSession): string {
    return session.runs[0]?.status ?? 'pending';
  }

  latestRunGroup(session: DevSession): ThreadStatusFilter {
    const status = this.latestRunStatus(session);
    if (status === 'failed') return 'failed';
    if (status === 'success') return 'success';
    return 'running';
  }

  failedCount(session: DevSession): number {
    return session.runs.filter((run) => run.status === 'failed').length;
  }

  workspacePathText(root: string | null): string {
    return root || '当前服务目录';
  }

  isWorkspaceActive(root: string | null): boolean {
    const active = this.activeWorkspaceRoot.trim();
    if (!root) return active.length === 0;
    return active === root;
  }

  selectWorkspace(root: string | null) {
    this.workspaceSelect.emit(root ?? '');
  }

  openWorkspaceCreator() {
    this.creatingWorkspace.set(true);
    this.pickerHint.set(null);
  }

  cancelWorkspaceCreator() {
    this.creatingWorkspace.set(false);
    this.newWorkspaceRoot.set('');
    this.pickerHint.set(null);
  }

  confirmWorkspace() {
    const root = this.newWorkspaceRoot().trim();
    if (!root) {
      this.pickerHint.set('请先填写绝对路径。');
      return;
    }
    this.workspaceSelect.emit(root);
    this.cancelWorkspaceCreator();
  }

  async pickDirectoryName() {
    const picker = (window as Window & {
      showDirectoryPicker?: () => Promise<{ name?: string }>;
    }).showDirectoryPicker;
    if (typeof picker !== 'function') {
      this.pickerHint.set('当前环境不支持目录选择器，请粘贴绝对路径。');
      return;
    }
    try {
      const handle = await picker();
      const picked = (handle?.name ?? '').trim();
      if (picked && !this.newWorkspaceRoot().trim()) {
        this.newWorkspaceRoot.set(picked);
      }
      this.pickerHint.set('已选择目录名。浏览器限制下无法读取绝对路径，请粘贴完整路径后添加。');
    } catch {
      this.pickerHint.set('未选择目录。');
    }
  }

  handleRunSelect(event: Event, runId: string) {
    event.stopPropagation();
    this.runSelect.emit(runId);
  }

  private sessionSortWeight(session: DevSession): number {
    const group = this.latestRunGroup(session);
    if (group === 'running') return 0;
    if (group === 'failed') return 1;
    if (group === 'success') return 2;
    return 3;
  }
}

