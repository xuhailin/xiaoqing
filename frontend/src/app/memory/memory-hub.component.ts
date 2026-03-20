import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IdentityAnchorEditorComponent } from '../identity-anchor/identity-anchor-editor.component';
import { LifeTraceBoardComponent } from '../life-trace/life-trace-board.component';
import { MemoryListComponent } from './memory-list.component';
import { PersonaConfigComponent } from '../persona/persona-config.component';
import { PersonaSummaryComponent } from '../persona/persona-summary.component';
import { CognitiveTraceBoardComponent } from '../cognitive-trace/cognitive-trace-board.component';
import { MemoryRelationsPageComponent } from './memory-relations-page.component';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { SystemOverviewService, type SystemOverview } from '../core/services/system-overview.service';

@Component({
  selector: 'app-memory-hub',
  standalone: true,
  imports: [
    IdentityAnchorEditorComponent,
    LifeTraceBoardComponent,
    MemoryListComponent,
    PersonaConfigComponent,
    PersonaSummaryComponent,
    CognitiveTraceBoardComponent,
    MemoryRelationsPageComponent,
    AppBadgeComponent,
    AppPanelComponent,
    AppStateComponent,
  ],
  template: `
    <div class="memory-hub">
      @if (currentView() === 'profile') {
        <div class="memory-grid memory-grid--profile">
          <app-panel variant="workbench" class="memory-card">
            <div class="module-header">
              <div class="module-title">用户画像</div>
              <app-badge tone="info" appearance="outline">Profile</app-badge>
            </div>
            <app-identity-anchor-editor />
          </app-panel>

          <app-panel variant="workbench" class="memory-card memory-card--wide">
            <div class="module-header">
              <div class="module-title">Persona / System Self</div>
              <app-badge tone="warning" appearance="outline">Memory</app-badge>
            </div>

            <div class="persona-meta">
              <div class="persona-meta__summary ui-workbench-surface ui-workbench-surface--soft">
                <app-persona-summary />
              </div>

              <div class="persona-meta__system ui-workbench-surface ui-workbench-surface--soft">
                <div class="system-self__title">System Self</div>
                @if (overviewLoading()) {
                  <div class="system-self__meta">系统摘要加载中...</div>
                } @else if (overview(); as data) {
                  <div class="system-self__meta">
                    {{ data.systemSelf.system.name }} · v{{ data.systemSelf.system.version }} · {{ data.systemSelf.system.environment }}
                  </div>
                  <div class="system-self__chips">
                    @for (agent of data.systemSelf.agents; track agent.name) {
                      <app-badge [tone]="agent.active ? 'success' : 'neutral'" appearance="outline">
                        {{ agent.name }} · {{ agent.channel }}
                      </app-badge>
                    }
                  </div>
                } @else {
                  <div class="system-self__meta">暂无 system self 摘要</div>
                }
              </div>
            </div>

            <app-persona-config />
          </app-panel>
        </div>
      }

      @if (currentView() === 'memories') {
        <div class="memory-toolbar">
          <label class="memory-search__field">
            <input
              class="ui-input"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              placeholder="搜索记忆模块或条目"
            />
          </label>
        </div>

        @if (!showModule('memories')) {
          <app-panel variant="workbench" class="memory-card">
            <app-state
              title="没有匹配到记忆内容"
              description="换一个关键词试试，例如长期记忆、memory 或相关条目。"
            />
          </app-panel>
        } @else {
          <app-panel variant="workbench" class="memory-card">
            <app-memory-list />
          </app-panel>
        }
      }

      @if (currentView() === 'life-record') {
        <app-life-trace-board />
      }

      @if (currentView() === 'cognitive-trace') {
        <app-cognitive-trace-board />
      }

      @if (currentView() === 'relations') {
        <app-memory-relations-page />
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .memory-hub {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
      padding: var(--workbench-shell-padding) calc(var(--workbench-shell-padding) + var(--space-2));
      overflow: auto;
    }

    .memory-search__field {
      width: min(440px, 100%);
    }

    .memory-toolbar {
      display: flex;
      justify-content: flex-end;
    }

    .memory-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--workbench-section-gap);
      min-height: 0;
      align-content: start;
    }

    .memory-grid--profile {
      align-items: start;
    }

    .memory-card {
      min-height: 0;
    }

    .memory-card--wide {
      grid-column: 1 / -1;
    }

    .module-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .module-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: var(--line-height-tight);
      color: var(--color-text);
    }

    .persona-meta {
      display: grid;
      grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      margin-bottom: var(--space-4);
    }

    .persona-meta__summary,
    .persona-meta__system {
      min-height: 0;
      border-radius: var(--workbench-card-radius);
      overflow: hidden;
    }

    .persona-meta__system {
      padding: var(--workbench-card-padding);
      border: 1px solid var(--relation-card-border);
    }

    .system-self__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .system-self__meta {
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .system-self__chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    @media (max-width: 1100px) {
      .memory-grid,
      .persona-meta {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 980px) {
      .memory-hub {
        padding: var(--workbench-shell-padding-mobile);
      }

      .memory-search__field {
        width: 100%;
      }

      .memory-toolbar {
        justify-content: stretch;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryHubComponent implements OnInit {
  private readonly systemOverviewService = inject(SystemOverviewService);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  protected readonly overview = signal<SystemOverview | null>(null);
  protected readonly overviewLoading = signal(false);
  protected readonly modules = [
    { key: 'profile', keywords: ['profile', '画像', '用户', '身份', '偏好'] },
    { key: 'persona', keywords: ['persona', 'system self', '人格', '系统'] },
    { key: 'memories', keywords: ['memory', 'memories', 'long memory', '记忆', '长期'] },
    { key: 'life-trace', keywords: ['life', 'life trace', 'record', '生活', '轨迹'] },
    { key: 'cognitive-trace', keywords: ['cognitive', 'trace', '认知', '观察'] },
    { key: 'relations', keywords: ['relation', 'social', '关系', '社会', '人物'] },
  ] as const;

  protected readonly visibleModules = computed(() => {
    const keyword = this.query().trim().toLowerCase();
    if (!keyword) {
      return this.modules;
    }

    return this.modules.filter((module) =>
      module.keywords.some((item) => item.toLowerCase().includes(keyword)),
    );
  });
  protected readonly currentView = computed<
    'life-record' | 'cognitive-trace' | 'memories' | 'profile' | 'relations'
  >(() => {
    const url = this.router.url;
    if (url.startsWith('/memory/relations')) return 'relations';
    if (url.startsWith('/memory/cognitive-trace')) return 'cognitive-trace';
    if (url.startsWith('/memory/memories')) return 'memories';
    if (url.startsWith('/memory/profile')) return 'profile';
    return 'life-record';
  });

  async ngOnInit() {
    this.overviewLoading.set(true);
    try {
      const result = await firstValueFrom(this.systemOverviewService.getOverview());
      this.overview.set(result ?? null);
    } finally {
      this.overviewLoading.set(false);
    }
  }

  protected showModule(key: string) {
    return this.visibleModules().some((module) => module.key === key);
  }
}
