import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PlanApiService, type PlanRecord } from '../../core/services/plan.service';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-commitment-page',
  standalone: true,
  imports: [AppBadgeComponent, AppPageHeaderComponent, AppPanelComponent, AppStateComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="承诺感知"
        description="优先显示仍在生效的 Plan / Task 承诺，而不是只看旧记忆分类。"
      />

      <div class="page-content">
        <app-panel variant="workbench" class="commitment-panel">
          @if (loading()) {
            <app-state kind="loading" title="加载中..." />
          } @else if (items().length === 0) {
            <app-state
              title="暂无承诺记录"
              description="当系统创建了仍在生效的计划或约定后，会优先显示在这里。"
            />
          } @else {
            <div class="commitment-list">
              @for (item of items(); track item.id) {
                <div class="commitment-card">
                  <div class="commitment-content">{{ item.title || item.description || '未命名承诺' }}</div>
                  <div class="commitment-meta">
                    <app-badge [tone]="item.status === 'paused' ? 'neutral' : 'info'" size="sm">
                      {{ item.status === 'paused' ? '已暂停' : '进行中' }}
                    </app-badge>
                    @if (item.nextRunAt) {
                      <span class="meta-time">下次 {{ formatDate(item.nextRunAt) }}</span>
                    } @else {
                      <span class="meta-time">{{ item.recurrence }}</span>
                    }
                  </div>
                  @if (item.description) {
                    <div class="commitment-detail">{{ item.description }}</div>
                  }
                </div>
              }
            </div>
          }
        </app-panel>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .page-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--workbench-shell-padding);
      overflow: auto;
    }

    .page-container__header {
      margin-bottom: var(--space-4);
    }

    .page-content {
      flex: 1;
      min-height: 0;
    }

    .commitment-panel {
      min-height: 200px;
    }

    .commitment-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .commitment-card {
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--color-primary);
    }

    .commitment-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--space-2);
    }

    .commitment-detail {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      line-height: 1.5;
      margin-top: var(--space-2);
    }

    .commitment-meta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .meta-time {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommitmentPageComponent implements OnInit {
  private planService = inject(PlanApiService);

  readonly items = signal<PlanRecord[]>([]);
  readonly loading = signal(true);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const [active, paused] = await Promise.all([
        firstValueFrom(this.planService.list({ status: 'active' })),
        firstValueFrom(this.planService.list({ status: 'paused' })),
      ]);
      const plans = [...(active ?? []), ...(paused ?? [])]
        .filter((item) => item.scope !== 'dev')
        .sort((left, right) => {
          const leftTime = left.nextRunAt ? new Date(left.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
          const rightTime = right.nextRunAt ? new Date(right.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
          return leftTime - rightTime;
        });
      this.items.set(plans);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
