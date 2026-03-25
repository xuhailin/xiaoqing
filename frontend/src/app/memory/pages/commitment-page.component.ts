import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MemoryService, Memory } from '../../core/services/memory.service';
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
        description="你提到的计划、约定或承诺，我会帮你留意。"
      />

      <div class="page-content">
        <app-panel variant="workbench" class="commitment-panel">
          @if (loading()) {
            <app-state kind="loading" title="加载中..." />
          } @else if (items().length === 0) {
            <app-state
              title="暂无承诺记录"
              description="对话中提到的计划和约定会沉淀到这里。"
            />
          } @else {
            <div class="commitment-list">
              @for (item of items(); track item.id) {
                <div class="commitment-card">
                  <div class="commitment-content">{{ item.content }}</div>
                  <div class="commitment-meta">
                    <app-badge tone="info" size="sm">待追踪</app-badge>
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
  private memoryService = inject(MemoryService);

  readonly items = signal<Memory[]>([]);
  readonly loading = signal(true);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const list = await firstValueFrom(
        this.memoryService.list(undefined, 'commitment')
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
