import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { ModelConfigService, type ModelConfigView } from '../core/services/model-config.service';
import { SystemOverviewService, type SystemOverview } from '../core/services/system-overview.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    AppBadgeComponent,
    AppPageHeaderComponent,
    AppPanelComponent,
    AppStateComponent,
  ],
  template: `
    <div class="settings-page">
      <app-page-header
        title="系统设置"
        description="本轮只做只读整合，不提供写入操作。"
      />

      <div class="settings-grid">
        <app-panel variant="workbench" class="settings-card">
          <div class="card-title">模型配置</div>
          @if (modelLoading()) {
            <app-state [compact]="true" kind="loading" title="模型配置加载中..." />
          } @else if (modelConfig(); as config) {
            <div class="meta-line">来源：{{ config.source.path }}</div>
            <div class="section-list">
              @for (entry of scenarioEntries(); track entry.scenario) {
                <div class="ui-list-card section-item">
                  <div class="section-item__title">{{ entry.scenario }}</div>
                  <div class="section-item__meta">{{ entry.view.displayName }} · {{ entry.view.provider }}</div>
                </div>
              }
            </div>
          } @else {
            <app-state [compact]="true" title="暂无模型配置" />
          }
        </app-panel>

        <app-panel variant="workbench" class="settings-card">
          <div class="card-title">Token 策略</div>
          @if (overviewLoading()) {
            <app-state [compact]="true" kind="loading" title="策略加载中..." />
          } @else if (overview(); as data) {
            <div class="stats-grid">
              <div class="ui-stat-card stat-card">
                <span class="stat-value">{{ data.tokenPolicy.maxContextTokens }}</span>
                <span class="stat-label">Max Context</span>
              </div>
              <div class="ui-stat-card stat-card">
                <span class="stat-value">{{ data.tokenPolicy.maxSystemTokens }}</span>
                <span class="stat-label">Max System</span>
              </div>
              <div class="ui-stat-card stat-card">
                <span class="stat-value">{{ data.tokenPolicy.memoryMidK }}</span>
                <span class="stat-label">Memory Mid K</span>
              </div>
              <div class="ui-stat-card stat-card">
                <span class="stat-value">{{ data.tokenPolicy.autoSummarizeThreshold }}</span>
                <span class="stat-label">Auto Summarize</span>
              </div>
            </div>
          } @else {
            <app-state [compact]="true" title="暂无 token 策略信息" />
          }
        </app-panel>

        <app-panel variant="workbench" class="settings-card">
          <div class="card-title">Agent 配置</div>
          @if (overviewLoading()) {
            <app-state [compact]="true" kind="loading" title="Agent 信息加载中..." />
          } @else if (overview(); as data) {
            <div class="section-list">
              @for (agent of data.systemSelf.agents; track agent.name) {
                <div class="ui-list-card section-item">
                  <div class="section-item__title">{{ agent.name }}</div>
                  <div class="section-item__meta">{{ agent.channel }} · active={{ agent.active }}</div>
                </div>
              }
            </div>
            <div class="chip-row">
              @for (entry of featureEntries(); track entry.key) {
                <app-badge [tone]="entry.enabled ? 'info' : 'neutral'" appearance="outline">
                  {{ entry.key }}={{ entry.enabled }}
                </app-badge>
              }
            </div>
          } @else {
            <app-state [compact]="true" title="暂无 agent 配置摘要" />
          }
        </app-panel>

        <app-panel variant="workbench" class="settings-card">
          <div class="card-title">外部服务配置</div>
          @if (overviewLoading()) {
            <app-state [compact]="true" kind="loading" title="外部服务加载中..." />
          } @else if (overview(); as data) {
            @if (data.integrations.length) {
              <div class="section-list">
                @for (item of data.integrations; track item.key) {
                  <div class="ui-list-card section-item">
                    <div class="section-item__row">
                      <div class="section-item__title">{{ item.label }}</div>
                      <app-badge [tone]="item.enabled ? 'success' : 'neutral'">
                        {{ item.enabled ? 'enabled' : 'disabled' }}
                      </app-badge>
                    </div>
                    <div class="section-item__meta">{{ item.summary }}</div>
                  </div>
                }
              </div>
            } @else {
              <app-state [compact]="true" title="暂无外部服务配置" />
            }
          } @else {
            <app-state [compact]="true" title="暂无外部服务配置" />
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

    .settings-page {
      height: 100%;
      overflow: auto;
      padding: var(--workbench-shell-padding) calc(var(--workbench-shell-padding) + var(--space-2));
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
      min-height: 100%;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--workbench-section-gap);
      align-content: start;
    }

    .settings-card {
      gap: var(--space-3);
      min-height: 0;
    }

    .card-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .meta-line,
    .section-item__meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.6;
    }

    .section-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .section-item {
      padding: var(--workbench-card-padding);
    }

    .section-item__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-1);
    }

    .section-item__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }

    .stat-card {
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .stat-value {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .stat-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    @media (max-width: 980px) {
      .settings-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .settings-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly modelConfigService = inject(ModelConfigService);
  private readonly systemOverviewService = inject(SystemOverviewService);

  readonly modelConfig = signal<ModelConfigView | null>(null);
  readonly overview = signal<SystemOverview | null>(null);
  readonly modelLoading = signal(false);
  readonly overviewLoading = signal(false);

  async ngOnInit() {
    this.modelLoading.set(true);
    this.overviewLoading.set(true);
    try {
      const [modelConfig, overview] = await Promise.all([
        firstValueFrom(this.modelConfigService.getConfig()).catch(() => null),
        firstValueFrom(this.systemOverviewService.getOverview()).catch(() => null),
      ]);
      this.modelConfig.set(modelConfig);
      this.overview.set(overview);
    } finally {
      this.modelLoading.set(false);
      this.overviewLoading.set(false);
    }
  }

  scenarioEntries() {
    const config = this.modelConfig();
    if (!config) {
      return [] as Array<{ scenario: string; view: ModelConfigView['scenarios'][keyof ModelConfigView['scenarios']] }>;
    }
    return Object.entries(config.scenarios).map(([scenario, view]) => ({ scenario, view }));
  }

  featureEntries() {
    const features = this.overview()?.systemSelf.features ?? {};
    return Object.entries(features)
      .map(([key, enabled]) => ({ key, enabled }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }
}
