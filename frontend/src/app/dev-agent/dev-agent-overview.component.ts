import { Component, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DevAgentPageStore } from './dev-agent-page.store';
import { DevSessionBoardComponent } from './components/dev-session-board.component';
import { buildSessionBoard } from './dev-agent.view-model';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

@Component({
  selector: 'app-dev-agent-overview',
  standalone: true,
  imports: [DevSessionBoardComponent, AppTabsComponent],
  template: `
    <div class="overview">
      <div class="board-header">
        <div class="board-header__copy">
          <div class="board-header__eyebrow">Sessions Overview</div>
          <div class="board-header__title">会话状态总览</div>
          <div class="board-metrics">
            <div class="metric-card">
              <span class="metric-card__value">{{ visibleBoard().summary.total }}</span>
              <span class="metric-card__label">总 sessions</span>
            </div>
            <div class="metric-card metric-card--running">
              <span class="metric-card__value">{{ visibleBoard().summary.running }}</span>
              <span class="metric-card__label">进行中</span>
            </div>
            <div class="metric-card metric-card--failed">
              <span class="metric-card__value">{{ visibleBoard().summary.failed }}</span>
              <span class="metric-card__label">失败</span>
            </div>
            <div class="metric-card metric-card--success">
              <span class="metric-card__value">{{ visibleBoard().summary.success }}</span>
              <span class="metric-card__label">成功</span>
            </div>
          </div>
        </div>

        <app-tabs
          class="board-tabs"
          [items]="boardScopeTabs()"
          [value]="boardScope()"
          (valueChange)="boardScope.set($any($event))"
        />
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
      gap: var(--space-3);
    }

    .board-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4);
      border: 1px solid rgba(116, 130, 151, 0.16);
      border-radius: var(--radius-xl);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(250, 251, 255, 0.96));
      box-shadow: var(--shadow-sm);
    }

    .board-header__copy {
      min-width: 0;
    }

    .board-header__eyebrow {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .board-header__title {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .board-metrics {
      margin-top: var(--space-3);
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-2);
    }

    .metric-card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid rgba(116, 130, 151, 0.14);
      background: rgba(255, 255, 255, 0.72);
    }

    .metric-card__value {
      font-size: 1.125rem;
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
      width: fit-content;
      max-width: 100%;
      flex-shrink: 0;
    }

    .board-panel {
      flex: 1 1 auto;
      min-height: 0;
    }

    @media (max-width: 980px) {
      .board-header {
        flex-direction: column;
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
    this.router.navigate(['/dev-agent/sessions', sessionId]);
  }
}
