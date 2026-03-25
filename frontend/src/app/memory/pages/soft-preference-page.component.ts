import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MemoryService, Memory } from '../../core/services/memory.service';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-soft-preference-page',
  standalone: true,
  imports: [AppBadgeComponent, AppPageHeaderComponent, AppPanelComponent, AppStateComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="软偏好"
        description="从对话里提取的偏好倾向，比如口味、习惯、喜欢的方式等。"
      />

      <div class="page-content">
        <app-panel variant="workbench" class="preference-panel">
          @if (loading()) {
            <app-state kind="loading" title="加载中..." />
          } @else if (items().length === 0) {
            <app-state
              title="暂无软偏好"
              description="对话中提及的偏好会自动沉淀到这里。"
            />
          } @else {
            <div class="preference-list">
              @for (item of items(); track item.id) {
                <div class="preference-card">
                  <div class="preference-content">{{ item.content }}</div>
                  <div class="preference-meta">
                    <app-badge tone="neutral" appearance="outline" size="sm">
                      置信 {{ (item.confidence * 100).toFixed(0) }}%
                    </app-badge>
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

    .preference-panel {
      min-height: 200px;
    }

    .preference-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .preference-card {
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      transition: border-color var(--transition-fast);

      &:hover {
        border-color: var(--color-primary);
      }
    }

    .preference-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--space-2);
    }

    .preference-meta {
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
export class SoftPreferencePageComponent implements OnInit {
  private memoryService = inject(MemoryService);

  readonly items = signal<Memory[]>([]);
  readonly loading = signal(true);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const list = await firstValueFrom(
        this.memoryService.list(undefined, 'soft_preference')
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
