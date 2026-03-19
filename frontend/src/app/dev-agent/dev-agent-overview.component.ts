import { Component, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DevAgentPageStore } from './dev-agent-page.store';
import { DevSessionBoardComponent } from './components/dev-session-board.component';
import { buildSessionBoard } from './dev-agent.view-model';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

@Component({
  selector: 'app-dev-agent-overview',
  standalone: true,
  imports: [DevSessionBoardComponent, AppPageHeaderComponent, AppTabsComponent],
  template: `
    <div class="overview">
      <app-page-header
        title="DevAgent"
        description="统一查看当前工作区与全局 sessions 的运行状态，再决定进入哪条执行会话。"
      >
        <div actions class="board-header__actions">
          <app-tabs
            class="board-tabs"
            [items]="boardScopeTabs()"
            [value]="boardScope()"
            [appearance]="'secondary'"
            [size]="'sm'"
            (valueChange)="boardScope.set($any($event))"
          />
        </div>
      </app-page-header>

      <div class="board-metrics">
        <div class="metric-card ui-stat-card">
          <span class="metric-card__value">{{ visibleBoard().summary.total }}</span>
          <span class="metric-card__label">总 sessions</span>
        </div>
        <div class="metric-card metric-card--running ui-stat-card">
          <span class="metric-card__value">{{ visibleBoard().summary.running }}</span>
          <span class="metric-card__label">进行中</span>
        </div>
        <div class="metric-card metric-card--failed ui-stat-card">
          <span class="metric-card__value">{{ visibleBoard().summary.failed }}</span>
          <span class="metric-card__label">失败</span>
        </div>
        <div class="metric-card metric-card--success ui-stat-card">
          <span class="metric-card__value">{{ visibleBoard().summary.success }}</span>
          <span class="metric-card__label">成功</span>
        </div>
      </div>

      <div class="board-panel">
        <app-dev-session-board
          [board]="visibleBoard()"
          (selectSession)="openSession($event)"
        />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .overview {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
    }

    .board-header__actions {
      display: flex;
      align-items: center;
      width: min(320px, 100%);
    }

    .board-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .metric-card {
      min-width: 0;
    }

    .metric-card__value {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .metric-card__label {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .metric-card--running .metric-card__value { color: var(--color-warning); }
    .metric-card--failed .metric-card__value { color: var(--color-error); }
    .metric-card--success .metric-card__value { color: var(--color-success); }

    .board-tabs {
      width: 100%;
    }

    .board-panel {
      flex: 1 1 auto;
      min-height: 0;
    }

    @media (max-width: 980px) {
      .board-header__actions {
        width: 100%;
      }

      .board-metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `],
})
export class DevAgentOverviewComponent {
  boardScope = signal<'all' | 'current'>('all');

  readonly globalBoard = computed(() => buildSessionBoard(this.store.sessions()));

  readonly currentWorkspaceSessions = computed(() => {
    const root = this.store.workspaceRootInput().trim();
    if (!root) return [];
    return this.store.sessions().filter((s) => s.workspaceRoot === root);
  });

  readonly currentWorkspaceBoard = computed(() => buildSessionBoard(this.currentWorkspaceSessions()));

  readonly visibleBoard = computed(() =>
    this.boardScope() === 'current' ? this.currentWorkspaceBoard() : this.globalBoard(),
  );

  readonly boardScopeTabs = computed<AppTabItem[]>(() => [
    { value: 'all', label: '全部', count: this.globalBoard().summary.total },
    { value: 'current', label: '当前 workspace', count: this.currentWorkspaceBoard().summary.total },
  ]);

  constructor(
    private readonly store: DevAgentPageStore,
    private readonly router: Router,
  ) {}

  openSession(sessionId: string) {
    this.router.navigate(['/workspace/dev-agent/sessions', sessionId]);
  }
}
