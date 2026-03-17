import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  DevSessionBoardCard,
  DevSessionBoardModel,
} from '../dev-agent.view-model';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-dev-session-board',
  standalone: true,
  imports: [AppBadgeComponent, AppPanelComponent, AppStateComponent],
  template: `
    <section class="session-board">
      @if (!board.summary.total) {
        <app-state
          title="还没有 dev sessions"
          description="先创建一个 New Session，这里会按进行中、失败、成功自动归类。"
        />
      } @else {
        <div class="lane-grid">
          @for (lane of board.lanes; track lane.id) {
            <app-panel
              variant="workbench"
              padding="none"
              class="lane"
              [accent]="laneAccent(lane.id)"
            >
              <header class="lane-header">
                <div>
                  <div class="lane-title">{{ lane.title }}</div>
                  <div class="lane-description">{{ lane.description }}</div>
                </div>
                <app-badge tone="neutral" [appearance]="'outline'">{{ lane.cards.length }}</app-badge>
              </header>

              <div class="lane-list ui-scrollbar">
                @if (!lane.cards.length) {
                  <app-state
                    [compact]="true"
                    title="当前泳道为空"
                    description="新的 session 会自动出现在这一列。"
                  />
                } @else {
                  @for (card of lane.cards; track card.id) {
                    <button
                      type="button"
                      class="session-card ui-list-card"
                      [class.is-active]="card.id === selectedSessionId"
                      (click)="selectSession.emit(card.id)"
                    >
                      <div class="card-head">
                        <div class="card-title">{{ card.title }}</div>
                        <app-badge
                          class="status-badge"
                          [tone]="statusTone(card.status)"
                          [caps]="true"
                        >
                          {{ card.statusLabel }}
                        </app-badge>
                      </div>

                      <div class="card-meta">
                        <span>{{ card.workspaceLabel }}</span>
                        @if (card.updatedAtLabel) {
                          <span>{{ card.updatedAtLabel }}</span>
                        }
                      </div>

                      @if (card.latestTask) {
                        <div class="card-task">{{ card.latestTask }}</div>
                      }

                      <div class="card-stats">
                        <span>{{ card.runCount }} runs</span>
                        <span>{{ card.runningCount }} running</span>
                        <span>{{ card.failedCount }} failed</span>
                        <span>{{ card.successCount }} success</span>
                        @if (card.totalCostUsd != null) {
                          <span class="card-cost">\${{ formatCost(card.totalCostUsd) }}</span>
                        }
                      </div>
                    </button>
                  }
                }
              </div>
            </app-panel>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .session-board {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .lane-grid {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-4);
    }

    .lane {
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .lane-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
    }

    .lane-title {
      font-size: 0.95rem;
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .lane-description {
      margin-top: 4px;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.6;
    }

    .lane-list {
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
      cursor: pointer;
      color: var(--color-text);
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

    .card-meta,
    .card-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      margin-top: var(--space-3);
      font-size: 11px;
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

    .card-stats {
      margin-top: var(--space-4);
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border-light);
    }

    .card-cost {
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 1180px) {
      .lane-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class DevSessionBoardComponent {
  @Input({ required: true }) board!: DevSessionBoardModel;
  @Input() selectedSessionId: string | null = null;

  @Output() selectSession = new EventEmitter<string>();

  protected laneAccent(id: string): 'none' | 'warning' | 'danger' | 'success' {
    if (id === 'running') return 'warning';
    if (id === 'failed') return 'danger';
    if (id === 'success') return 'success';
    return 'none';
  }

  protected statusTone(status: DevSessionBoardCard['status']) {
    if (status === 'running') return 'warning';
    if (status === 'failed') return 'danger';
    if (status === 'success') return 'success';
    return 'neutral';
  }

  protected formatCost(value: number): string {
    return value < 0.01 ? value.toFixed(4) : value.toFixed(2);
  }

  trackCard(_index: number, card: DevSessionBoardCard) {
    return card.id;
  }
}
