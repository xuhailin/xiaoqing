import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MemoryService, Memory } from '../../core/services/memory.service';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-shared-fact-page',
  standalone: true,
  imports: [AppBadgeComponent, AppPageHeaderComponent, AppPanelComponent, AppStateComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="共识事实"
        description="我们双方确认过的事实性信息，作为后续对话的共同基础。"
      />

      <div class="page-content">
        <app-panel variant="workbench" class="fact-panel">
          @if (loading()) {
            <app-state kind="loading" title="加载中..." />
          } @else if (items().length === 0) {
            <app-state
              title="暂无共识事实"
              description="对话中确认的事实会沉淀到这里。"
            />
          } @else {
            <div class="fact-list">
              @for (item of items(); track item.id) {
                <div class="fact-card">
                  <div class="fact-content">{{ item.content }}</div>
                  <div class="fact-meta">
                    <app-badge tone="success" size="sm">已确认</app-badge>
                    <span class="meta-time">{{ formatDate(item.createdAt) }}</span>
                  </div>
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

    .fact-panel {
      min-height: 200px;
    }

    .fact-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .fact-card {
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--color-success);
    }

    .fact-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--space-2);
    }

    .fact-meta {
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
export class SharedFactPageComponent implements OnInit {
  private memoryService = inject(MemoryService);

  readonly items = signal<Memory[]>([]);
  readonly loading = signal(true);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const list = await firstValueFrom(
        this.memoryService.list(undefined, 'shared_fact')
      );
      this.items.set(list ?? []);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
}
