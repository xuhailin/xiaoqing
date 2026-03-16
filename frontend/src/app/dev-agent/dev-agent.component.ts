import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DevAgentPageStore } from './dev-agent-page.store';
import { WorkspaceSidebarComponent } from './components/workspace-sidebar.component';
import { DevChatPanelComponent } from './components/dev-chat-panel.component';
import { DevSessionBoardComponent } from './components/dev-session-board.component';
import { buildSessionBoard } from './dev-agent.view-model';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

@Component({
  selector: 'app-dev-agent',
  standalone: true,
  imports: [
    WorkspaceSidebarComponent,
    DevChatPanelComponent,
    DevSessionBoardComponent,
    AppPageHeaderComponent,
    AppPanelComponent,
    AppTabsComponent,
  ],
  providers: [DevAgentPageStore],
  template: `
    <div class="dev-agent-page">
      <app-panel variant="workbench" padding="lg" class="page-header-panel">
        <app-page-header
          eyebrow="Workbench / DevAgent"
          title="开发执行台"
          description="一边直接下发开发任务，一边从 sessions 泳道快速扫全局执行状态。"
        >
          <div actions class="page-summary">
            <div class="ui-stat-card summary-card">
              <span class="ui-stat-card__value">{{ sessionBoard().summary.total }}</span>
              <span class="ui-stat-card__label">总 sessions</span>
            </div>
            <div class="ui-stat-card summary-card summary-card--running">
              <span class="ui-stat-card__value">{{ sessionBoard().summary.running }}</span>
              <span class="ui-stat-card__label">进行中</span>
            </div>
            <div class="ui-stat-card summary-card summary-card--failed">
              <span class="ui-stat-card__value">{{ sessionBoard().summary.failed }}</span>
              <span class="ui-stat-card__label">失败</span>
            </div>
            <div class="ui-stat-card summary-card summary-card--success">
              <span class="ui-stat-card__value">{{ sessionBoard().summary.success }}</span>
              <span class="ui-stat-card__label">成功</span>
            </div>
          </div>
        </app-page-header>
      </app-panel>

      <app-tabs
        class="view-tabs"
        [items]="viewTabs"
        [value]="activeView()"
        (valueChange)="activeView.set($any($event))"
      />

      <div class="layout-grid">
        <app-workspace-sidebar
          [workspaceRoot]="store.workspaceRootInput()"
          [workspaceOptions]="store.workspaceOptions()"
          [sessions]="store.sessions()"
          [activeSessionId]="store.selectedSessionId()"
          (workspaceRootSelect)="store.selectWorkspaceRoot($event)"
          (selectSession)="store.selectSession($event)"
        />

        <div class="main-panel">
          @if (activeView() === 'run') {
            <app-dev-chat-panel
              [messages]="store.chatMessages()"
              [runState]="store.runState()"
              [taskInput]="taskInput()"
              [sending]="store.sending()"
              [canCancel]="isCurrentRunCancellable()"
              [canRerun]="isCurrentRunRerunnable()"
              [cancelling]="isCancellingCurrentRun()"
              (taskInputChange)="taskInput.set($event)"
              (submit)="submitTask()"
              (cancel)="store.cancelCurrentRun()"
              (rerun)="store.rerunCurrentRun()"
            />
          } @else {
            <app-dev-session-board
              [board]="sessionBoard()"
              [selectedSessionId]="store.selectedSessionId()"
              (selectSession)="openSessionFromBoard($event)"
            />
          }
        </div>
      </div>

      @if (store.actionNotice()) {
        <div class="action-notice">{{ store.actionNotice() }}</div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .dev-agent-page {
      height: 100%;
      min-height: 0;
      overflow: hidden;
      padding: var(--space-4);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      background: transparent;
    }

    .page-header-panel {
      flex-shrink: 0;
    }

    .page-summary {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-3);
      flex-shrink: 0;
    }

    .summary-card {
      min-width: 116px;
    }

    .summary-card .ui-stat-card__label {
      color: var(--color-workbench-muted);
    }

    .summary-card--running .ui-stat-card__value {
      color: var(--color-warning);
    }

    .summary-card--failed .ui-stat-card__value {
      color: var(--color-error);
    }

    .summary-card--success .ui-stat-card__value {
      color: var(--color-success);
    }

    .view-tabs {
      width: fit-content;
      max-width: 100%;
      flex-shrink: 0;
    }

    .layout-grid {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
      gap: var(--space-4);
    }

    .main-panel {
      min-height: 0;
    }

    .action-notice {
      position: absolute;
      right: var(--space-4);
      top: var(--space-4);
      z-index: 2;
      font-size: var(--font-size-xs);
      color: #1f8a4d;
      border: 1px solid rgba(39, 174, 96, 0.3);
      background: rgba(240, 253, 244, 0.95);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      box-shadow: var(--shadow-sm);
      max-width: min(340px, 72vw);
    }

    @media (max-width: 980px) {
      .dev-agent-page {
        padding: var(--space-3);
      }

      .page-summary {
        justify-content: flex-start;
      }

      .layout-grid {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(220px, 32vh) minmax(0, 1fr);
      }
    }
  `],
})
export class DevAgentComponent implements OnInit, OnDestroy {
  taskInput = signal('');
  activeView = signal<'run' | 'sessions'>('run');
  readonly sessionBoard = computed(() => buildSessionBoard(this.store.sessions()));
  protected readonly viewTabs: AppTabItem[] = [
    { value: 'run', label: '当前执行' },
    { value: 'sessions', label: 'Sessions 概览' },
  ];

  constructor(
    public readonly store: DevAgentPageStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit() {
    const query = this.route.snapshot.queryParamMap;
    const navState = (history.state ?? {}) as Record<string, unknown>;
    this.store.init({
      preferredSessionId: query.get('sessionId'),
      preferredRunId: query.get('runId'),
      workspaceRoot: query.get('workspaceRoot'),
      notice: typeof navState['notice'] === 'string' ? navState['notice'] : null,
    });
  }

  ngOnDestroy() {
    this.store.destroy();
  }

  submitTask() {
    const task = this.taskInput();
    this.store.send(task);
    this.taskInput.set('');
    this.activeView.set('run');
  }

  openSessionFromBoard(sessionId: string) {
    this.store.selectSession(sessionId);
    this.activeView.set('run');
  }

  isCurrentRunCancellable(): boolean {
    const status = this.store.currentResult()?.run.status;
    return status ? this.store.isRunCancellable(status) : false;
  }

  isCurrentRunRerunnable(): boolean {
    const status = this.store.currentResult()?.run.status;
    return !!status && !this.store.isRunCancellable(status);
  }

  isCancellingCurrentRun(): boolean {
    const runId = this.store.currentResult()?.run.id;
    return !!runId && this.store.cancellingRunId() === runId;
  }

}
