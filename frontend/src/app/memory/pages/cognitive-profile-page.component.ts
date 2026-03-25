import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MemoryService, Memory } from '../../core/services/memory.service';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

const COGNITIVE_SECTIONS = [
  { category: 'judgment_pattern', label: '判断模式', hint: '做决定时的习惯思路' },
  { category: 'value_priority', label: '价值排序', hint: '你看重的事情' },
  { category: 'rhythm_pattern', label: '关系节奏', hint: '我们相处的模式' },
];

type SectionWithItems = typeof COGNITIVE_SECTIONS[number] & { items: Memory[] };

@Component({
  selector: 'app-cognitive-profile-page',
  standalone: true,
  imports: [AppBadgeComponent, AppPageHeaderComponent, AppPanelComponent, AppStateComponent],
  template: `
    <div class="page-container">
      <app-page-header
        title="长期认知"
        description="我对你更深层的理解：判断模式、价值排序、关系节奏。"
      />

      <div class="page-content">
        @if (loading()) {
          <app-state kind="loading" title="加载中..." />
        } @else if (sections().every((s) => s.items.length === 0)) {
          <app-state
            title="暂无长期认知"
            description="随着对话深入，我会逐渐理解你的判断模式和价值取向。"
          />
        } @else {
          @for (section of sections(); track section.category) {
            @if (section.items.length > 0) {
              <app-panel variant="subtle" class="section-panel">
                <div class="section-header">
                  <span class="section-label">{{ section.label }}</span>
                  <span class="section-hint">{{ section.hint }}</span>
                </div>
                <div class="cognitive-list">
                  @for (item of section.items; track item.id) {
                    <div class="cognitive-card">
                      <div class="cognitive-content">{{ item.content }}</div>
                      <div class="cognitive-meta">
                        <app-badge tone="info" size="sm">
                          置信 {{ (item.confidence * 100).toFixed(0) }}%
                        </app-badge>
                        <span class="meta-time">{{ formatDate(item.createdAt) }}</span>
                      </div>
                    </div>
                  }
                </div>
              </app-panel>
            }
          }
        }
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
      gap: var(--space-4);
    }

    .page-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .section-panel {
      gap: var(--space-3);
    }

    .section-header {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .section-label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .section-hint {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .cognitive-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .cognitive-card {
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }

    .cognitive-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--space-2);
    }

    .cognitive-meta {
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
export class CognitiveProfilePageComponent implements OnInit {
  private memoryService = inject(MemoryService);

  readonly sections = signal<SectionWithItems[]>(
    COGNITIVE_SECTIONS.map((s) => ({ ...s, items: [] }))
  );
  readonly loading = signal(true);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const results = await Promise.all(
        COGNITIVE_SECTIONS.map(async (section) => {
          const items = await firstValueFrom(
            this.memoryService.list(undefined, section.category)
          );
          return { ...section, items: items ?? [] };
        })
      );
      this.sections.set(results);
    } catch {
      // Keep empty sections
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
}
