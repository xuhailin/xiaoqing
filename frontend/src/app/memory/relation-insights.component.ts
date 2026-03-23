import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  RelationService,
  SocialEntityRecord,
  SocialInsightRecord,
  SocialRelationEdgeRecord,
  SocialRelationTrend,
} from '../core/services/relation.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

type DecoratedEdge = SocialRelationEdgeRecord & {
  entity: SocialEntityRecord | null;
};

const TREND_META: Record<SocialRelationTrend, {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}> = {
  improving: { label: '升温中', tone: 'success' },
  stable: { label: '稳定', tone: 'neutral' },
  declining: { label: '在走弱', tone: 'danger' },
};

@Component({
  selector: 'app-relation-insights',
  standalone: true,
  imports: [DatePipe, AppBadgeComponent, AppPanelComponent, AppSectionHeaderComponent, AppStateComponent],
  template: `
    <app-panel variant="subtle" class="insights-panel">
      <app-section-header
        class="panel-header"
        title="外部关系动态"
        description="这里是用户社会世界的辅助视角，用来补充理解最近哪些外部关系值得留意。"
      />

      @if (loading()) {
        <app-state
          kind="loading"
          title="关系洞察加载中..."
          description="正在整理最近的人际变化和关系趋势。"
        />
      } @else if (errorMessage()) {
        <app-state
          kind="error"
          title="关系洞察暂时不可用"
          [description]="errorMessage()"
        />
      } @else if (insights().length === 0 && decoratedEdges().length === 0) {
        <app-state
          [compact]="true"
          title="还没有足够的关系动态"
          description="再多积累一些人物提及和关系变化后，这里会逐渐出现趋势和洞察。"
        />
      } @else {
        <div class="insights-grid">
          <section class="insight-column">
            <div class="section-title">社会洞察</div>
            @if (insights().length > 0) {
              <div class="insight-list">
                @for (insight of insights(); track insight.id) {
                  <article class="insight-card">
                    <div class="insight-card__header">
                      <app-badge [tone]="insight.confidence >= 0.7 ? 'success' : insight.confidence >= 0.58 ? 'info' : 'warning'" appearance="outline" size="sm">
                        {{ insight.scope === 'weekly' ? 'Weekly' : 'Monthly' }}
                      </app-badge>
                      <span class="insight-card__confidence">置信 {{ percentLabel(insight.confidence) }}</span>
                    </div>
                    <p class="insight-card__content">{{ insight.content }}</p>
                    <div class="insight-card__meta">
                      <span>{{ insight.createdAt | date:'yyyy-MM-dd HH:mm' }}</span>
                      @if (relatedEntityNames(insight).length > 0) {
                        <span>关联 {{ relatedEntityNames(insight).join('、') }}</span>
                      }
                    </div>
                  </article>
                }
              </div>
            } @else {
              <div class="section-empty">目前还没有生成可信的社会洞察。</div>
            }
          </section>

          <section class="insight-column">
            <div class="section-title">关系趋势</div>
            @if (decoratedEdges().length > 0) {
              <div class="edge-list">
                @for (edge of decoratedEdges(); track edge.id) {
                  <article class="edge-card" [class.edge-card--declining]="edge.trend === 'declining'">
                    <div class="edge-card__header">
                      <div>
                        <div class="edge-card__title">{{ edge.entity?.name || edge.toEntityId }}</div>
                        <div class="edge-card__meta">{{ edge.entity?.relation || 'unknown' }} · {{ edge.relationType }}</div>
                      </div>
                      <app-badge [tone]="trendMeta(edge.trend).tone" appearance="outline" size="sm">
                        {{ trendMeta(edge.trend).label }}
                      </app-badge>
                    </div>

                    <div class="edge-card__quality">
                      <div class="edge-card__quality-label">关系质量</div>
                      <div class="edge-card__quality-bar">
                        <span class="edge-card__quality-fill" [style.width.%]="percentValue(edge.quality)"></span>
                      </div>
                      <div class="edge-card__quality-meta">{{ percentLabel(edge.quality) }} · 最近事件 {{ edge.lastEventAt | date:'MM-dd HH:mm' }}</div>
                    </div>

                    @if (edge.notes) {
                      <div class="edge-card__notes">{{ edge.notes }}</div>
                    }
                  </article>
                }
              </div>
            } @else {
              <div class="section-empty">目前还没有可展示的关系趋势边。</div>
            }
          </section>
        </div>
      }
    </app-panel>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .insights-panel {
      gap: var(--space-4);
    }

    .panel-header {
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .insights-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .insight-column {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-height: 0;
    }

    .section-title {
      font-size: var(--font-size-xs);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .insight-list,
    .edge-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .insight-card,
    .edge-card {
      padding: var(--space-4);
      border-radius: calc(var(--workbench-card-radius) - 6px);
      border: 1px solid var(--relation-card-border);
      background: var(--relation-card-bg-strong);
    }

    .edge-card--declining {
      border-color: var(--relation-card-danger-border);
      background: var(--relation-card-danger-bg);
    }

    .insight-card__header,
    .edge-card__header {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
      align-items: start;
    }

    .insight-card__confidence,
    .insight-card__meta,
    .edge-card__meta,
    .edge-card__quality-meta,
    .section-empty {
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .insight-card__content,
    .edge-card__notes {
      margin: var(--space-3) 0 0;
      font-size: var(--font-size-sm);
      line-height: 1.7;
      color: var(--color-text-secondary);
    }

    .insight-card__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .edge-card__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .edge-card__quality {
      margin-top: var(--space-3);
    }

    .edge-card__quality-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .edge-card__quality-bar {
      margin-top: var(--space-2);
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--relation-track-bg);
    }

    .edge-card__quality-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--relation-fill-quality);
    }

    .edge-card__quality-meta {
      margin-top: var(--space-2);
    }

    @media (max-width: 980px) {
      .insight-card__header,
      .edge-card__header {
        flex-direction: column;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelationInsightsComponent implements OnInit {
  private readonly relationService = inject(RelationService);

  protected readonly insights = signal<SocialInsightRecord[]>([]);
  protected readonly entities = signal<SocialEntityRecord[]>([]);
  protected readonly edges = signal<SocialRelationEdgeRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly entityMap = computed(
    () => new Map(this.entities().map((entity) => [entity.id, entity])),
  );
  protected readonly decoratedEdges = computed<DecoratedEdge[]>(() =>
    this.edges().map((edge) => ({
      ...edge,
      entity: this.entityMap().get(edge.toEntityId) ?? null,
    })),
  );

  async ngOnInit() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [insights, edges, entities] = await Promise.all([
        firstValueFrom(this.relationService.listInsights({ limit: 6, minConfidence: 0.45 })),
        firstValueFrom(this.relationService.listEdges({ limit: 8 })),
        firstValueFrom(this.relationService.listEntities({ sortBy: 'mentionCount', limit: 120 })),
      ]);

      this.insights.set(insights ?? []);
      this.edges.set(edges ?? []);
      this.entities.set(entities ?? []);
    } catch {
      this.errorMessage.set('请确认社会洞察与关系趋势接口已经可用。');
    } finally {
      this.loading.set(false);
    }
  }

  protected trendMeta(trend: SocialRelationTrend) {
    return TREND_META[trend];
  }

  protected relatedEntityNames(insight: SocialInsightRecord) {
    return insight.relatedEntityIds
      .map((id) => this.entityMap().get(id)?.name)
      .filter((name): name is string => !!name);
  }

  protected percentValue(value: number) {
    return Math.max(0, Math.min(100, Math.round(value * 100)));
  }

  protected percentLabel(value: number) {
    return `${this.percentValue(value)}%`;
  }
}
