import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PersonaConfigComponent } from '../persona/persona-config.component';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { SystemOverviewService, type SystemOverview } from '../core/services/system-overview.service';

@Component({
  selector: 'app-memory-persona-page',
  standalone: true,
  imports: [
    PersonaConfigComponent,
    AppBadgeComponent,
    AppPageHeaderComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
    AppStateComponent,
  ],
  template: `
    <div class="memory-page">
      <app-page-header
        class="memory-page__header"
        eyebrow="Memory"
        title="人格设定"
        description="把小晴的人格、表达约束和系统自我摘要放在一个稳定的编辑入口里维护。"
      />

      <app-panel variant="subtle" class="summary-card">
        <div class="summary-card__top">
          <app-section-header
            class="card-header"
            title="System Self"
            description="只读系统摘要放在上方，作为当前人格配置的运行上下文，不与主编辑器抢视觉重心。"
          />
        </div>

        @if (loading()) {
          <app-state [compact]="true" kind="loading" title="系统摘要加载中..." />
        } @else if (overview(); as data) {
          <div class="summary-grid">
            <div class="summary-group">
              <div class="summary-label">系统</div>
              <div class="summary-value">{{ data.systemSelf.system.name }} · v{{ data.systemSelf.system.version }}</div>
              <div class="summary-meta">env={{ data.systemSelf.system.environment }}</div>
            </div>

            <div class="summary-group">
              <div class="summary-label">Agents</div>
              <div class="chip-row">
                @for (agent of data.systemSelf.agents; track agent.name) {
                  <app-badge [tone]="agent.active ? 'success' : 'neutral'">{{ agent.name }} · {{ agent.channel }}</app-badge>
                }
              </div>
            </div>

            <div class="summary-group">
              <div class="summary-label">Features</div>
              <div class="chip-row">
                @for (entry of featureEntries(); track entry.key) {
                  <app-badge [tone]="entry.enabled ? 'info' : 'neutral'" appearance="outline">
                    {{ entry.key }}={{ entry.enabled }}
                  </app-badge>
                }
              </div>
            </div>

            <div class="summary-group">
              <div class="summary-label">Capabilities</div>
              <div class="summary-meta">{{ data.systemSelf.capabilities.length }} 个可见能力</div>
              <div class="chip-row">
                @for (cap of visibleCapabilities(); track cap.name) {
                  <app-badge tone="neutral" appearance="outline">{{ cap.name }}</app-badge>
                }
              </div>
            </div>
          </div>
        } @else {
          <app-state [compact]="true" title="暂无系统摘要" description="稍后可在设置页查看完整只读信息。" />
        }
      </app-panel>

      <div class="memory-grid">
        <app-panel variant="workbench" class="persona-card">
          <app-persona-config />
        </app-panel>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .memory-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      min-height: 100%;
    }

    .memory-page__header,
    .summary-card,
    .memory-grid {
      width: min(100%, var(--content-max-width));
      margin: 0 auto;
    }

    .memory-grid {
      min-height: 0;
    }

    .summary-card,
    .persona-card {
      min-height: 0;
      gap: var(--space-4);
    }

    .summary-card__top {
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-4);
      align-items: start;
    }

    .card-header {
      min-width: 0;
    }

    .summary-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-top: var(--space-3);
      margin-top: var(--space-3);
      border-top: 1px solid var(--color-border-light);
    }

    .summary-group:first-of-type {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }

    .summary-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .summary-value {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .summary-meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    @media (max-width: 980px) {
      .memory-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .memory-grid {
        gap: var(--space-4);
      }

      .summary-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class MemoryPersonaPageComponent implements OnInit {
  private readonly overviewService = inject(SystemOverviewService);

  readonly overview = signal<SystemOverview | null>(null);
  readonly loading = signal(false);

  async ngOnInit() {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(this.overviewService.getOverview());
      this.overview.set(result ?? null);
    } finally {
      this.loading.set(false);
    }
  }

  featureEntries() {
    const features = this.overview()?.systemSelf.features ?? {};
    return Object.entries(features)
      .map(([key, enabled]) => ({ key, enabled }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  visibleCapabilities() {
    return (this.overview()?.systemSelf.capabilities ?? []).slice(0, 8);
  }
}
