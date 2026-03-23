import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  RelationshipMomentPreviewDto,
  RelationshipOverviewDto,
  RelationshipService,
  RelationshipStage,
} from '../core/services/relationship.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

const STAGE_META: Record<RelationshipStage, {
  label: string;
  title: string;
  description: string;
  tone: 'info' | 'success' | 'warning';
}> = {
  early: {
    label: 'Early',
    title: '初识阶段',
    description: '彼此还在试探节奏与边界，关系更多靠一次次对话慢慢成形。',
    tone: 'info',
  },
  familiar: {
    label: 'Familiar',
    title: '熟悉阶段',
    description: '互动方式渐渐稳定，小晴已经能更自然地承接你的日常与情绪。',
    tone: 'warning',
  },
  steady: {
    label: 'Steady',
    title: '稳定阶段',
    description: '这段关系已经有了连续性，小晴会把重要片段当作共同经历继续带着走。',
    tone: 'success',
  },
};

const IMPACT_META = {
  deepened: { label: '更近了一点', tone: 'success' as const },
  neutral: { label: '保持稳定', tone: 'neutral' as const },
  strained: { label: '有点紧了', tone: 'danger' as const },
  repaired: { label: '在慢慢修复', tone: 'warning' as const },
};

const CATEGORY_LABELS: Record<string, string> = {
  emotional_support: '情绪支持',
  co_thinking: '一起思考',
  celebration: '庆祝时刻',
  crisis: '紧张时刻',
  milestone: '重要节点',
  daily_ritual: '日常陪伴',
};

@Component({
  selector: 'app-relation-overview',
  standalone: true,
  imports: [DatePipe, AppBadgeComponent, AppStateComponent],
  template: `
    <section class="relationship-hero">
      @if (loading()) {
        <div class="relationship-hero__fallback">
          <app-state
            [compact]="true"
            kind="loading"
            title="关系正在整理中"
            description="我在把你和小晴之间那些真正留下痕迹的互动重新串起来。"
          />
        </div>
      } @else if (errorMessage()) {
        <div class="relationship-hero__fallback">
          <app-state
            [compact]="true"
            kind="error"
            title="关系暂时还没整理好"
            [description]="errorMessage()"
          />
        </div>
      } @else if (overview(); as data) {
        <div class="relationship-hero__content">
          <div class="relationship-hero__copy">
            <div class="relationship-hero__eyebrow">Relationship</div>
            <h1 class="relationship-hero__title">你 与 小晴</h1>
            <div class="relationship-hero__meta">
              <app-badge
                class="relationship-hero__stage"
                [tone]="stageMeta(data.stage).tone"
                appearance="outline"
              >
                {{ stageMeta(data.stage).title }}
              </app-badge>
              <div class="relationship-hero__stage-note">{{ stageMeta(data.stage).description }}</div>
            </div>
            <p class="relationship-hero__summary">
              {{ data.summary || defaultSummary(data.stage) }}
            </p>
            @if (data.lastMeaningfulMomentAt) {
              <div class="relationship-hero__last-note">
                最近一次被记住的关系片段：
                {{ data.lastMeaningfulMomentAt | date:'yyyy-MM-dd HH:mm' }}
              </div>
            }
          </div>

          <div class="relationship-hero__index">
            <div class="relationship-hero__index-label">关系温度</div>
            <div class="relationship-hero__index-value">{{ relationIndexLabel(data) }}</div>
            <div class="relationship-hero__index-track">
              <span class="relationship-hero__index-fill" [style.width.%]="relationIndexValue(data)"></span>
            </div>
            <div class="relationship-hero__metrics">
              <div class="relationship-hero__metric">
                <span>信任</span>
                <strong>{{ percentValue(data.trustScore) }}</strong>
              </div>
              <div class="relationship-hero__metric">
                <span>亲近</span>
                <strong>{{ percentValue(data.closenessScore) }}</strong>
              </div>
            </div>
            <div class="relationship-hero__index-note">
              它不是打分，而是小晴对这段关系现在有多稳、多近的一次温和估计。
            </div>
          </div>
        </div>

        <div class="relationship-hero__support-grid">
          <article class="relationship-support-card">
            <div class="relationship-support-card__eyebrow">Recent Shifts</div>
            <div class="relationship-support-card__title">最近关系变化</div>
            @if (data.recentReflections.length > 0) {
              <div class="relationship-support-list">
                @for (reflection of data.recentReflections; track reflection.id) {
                  <div class="relationship-support-item">
                    <div class="relationship-support-item__header">
                      <div class="relationship-support-item__title">{{ reflection.title }}</div>
                      <app-badge [tone]="impactMeta(reflection.impact).tone" appearance="outline" size="sm">
                        {{ impactMeta(reflection.impact).label }}
                      </app-badge>
                    </div>
                    <div class="relationship-support-item__body">{{ reflection.summary }}</div>
                    <div class="relationship-support-item__meta">
                      <span>{{ reflection.happenedAt | date:'MM-dd HH:mm' }}</span>
                      <span>信任 {{ deltaLabel(reflection.trustDelta) }}</span>
                      <span>亲近 {{ deltaLabel(reflection.closenessDelta) }}</span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="relationship-support-card__empty">
                目前还没有足够明显的关系变化，小晴会继续观察哪些互动只是经过，哪些会留下痕迹。
              </div>
            }
          </article>

          <article class="relationship-support-card">
            <div class="relationship-support-card__eyebrow">Rhythm</div>
            <div class="relationship-support-card__title">现在的相处方式</div>
            @if (data.rhythmPreferences.length > 0 || data.rhythmObservations.length > 0) {
              @if (data.rhythmPreferences.length > 0) {
                <div class="relationship-chip-list">
                  @for (pref of data.rhythmPreferences.slice(0, 4); track pref.key) {
                    <div class="relationship-chip">
                      <span>{{ pref.key }}</span>
                      <strong>{{ pref.level }}</strong>
                    </div>
                  }
                </div>
              }

              @if (data.rhythmObservations.length > 0) {
                <div class="relationship-note-list">
                  @for (note of data.rhythmObservations; track note) {
                    <div class="relationship-note">{{ note }}</div>
                  }
                </div>
              }
            } @else {
              <div class="relationship-support-card__empty">
                互动节奏还在慢慢形成，等关系更稳定之后，这里会出现更清晰的相处偏好。
              </div>
            }
          </article>

          <article class="relationship-support-card">
            <div class="relationship-support-card__eyebrow">Shared Moments</div>
            <div class="relationship-support-card__title">最近被记住的共同经历</div>
            @if (data.recentSharedMoments.length > 0) {
              <div class="relationship-support-list">
                @for (moment of data.recentSharedMoments; track moment.id) {
                  <div class="relationship-support-item">
                    <div class="relationship-support-item__header">
                      <div class="relationship-support-item__title">{{ moment.title }}</div>
                      <app-badge tone="warning" appearance="outline" size="sm">
                        {{ categoryLabel(moment) }}
                      </app-badge>
                    </div>
                    <div class="relationship-support-item__body">{{ moment.summary }}</div>
                    <div class="relationship-support-item__meta">
                      <span>{{ moment.happenedAt | date:'MM-dd HH:mm' }}</span>
                      <span>显著性 {{ significanceLabel(moment.significance) }}</span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="relationship-support-card__empty">
                还没有足够清晰的共同经历被提炼出来，但重要的片段已经在开始积累了。
              </div>
            }
          </article>
        </div>
      } @else {
        <div class="relationship-hero__fallback">
          <app-state
            [compact]="true"
            title="这段关系还在慢慢成形"
            description="再和我多聊聊吧，我会一点点把你们之间的阶段、变化和共同经历记住。"
          />
        </div>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .relationship-hero {
      overflow: hidden;
      border-radius: calc(var(--radius-2xl) + 4px);
      background:
        linear-gradient(140deg,
          color-mix(in srgb, var(--color-primary-soft) 70%, white) 0%,
          color-mix(in srgb, var(--color-surface-elevated) 88%, white) 48%,
          color-mix(in srgb, var(--color-info-soft-bg) 52%, white) 100%);
      border: 1px solid color-mix(in srgb, var(--color-border) 70%, white);
      box-shadow: 0 24px 60px color-mix(in srgb, var(--color-shadow-rgb) 12%, transparent);
    }

    .relationship-hero__content {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
      gap: var(--space-6);
      align-items: stretch;
      padding: clamp(1.4rem, 2.6vw, 2.3rem);
      border-bottom: 1px solid color-mix(in srgb, var(--color-border) 68%, white);
    }

    .relationship-hero__copy {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    .relationship-hero__eyebrow,
    .relationship-support-card__eyebrow {
      font-size: var(--font-size-xs);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .relationship-hero__title {
      margin: 0;
      font-size: clamp(1.75rem, 3vw, 2.75rem);
      font-weight: var(--font-weight-semibold);
      letter-spacing: -0.03em;
      color: var(--color-text);
    }

    .relationship-hero__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }

    .relationship-hero__stage-note,
    .relationship-hero__index-note,
    .relationship-hero__last-note {
      font-size: var(--font-size-sm);
      line-height: 1.7;
      color: var(--color-text-secondary);
    }

    .relationship-hero__summary {
      margin: 0;
      max-width: 62ch;
      font-size: clamp(1rem, 1.6vw, 1.1rem);
      line-height: 1.85;
      color: var(--color-text);
    }

    .relationship-hero__index {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-2xl);
      background: color-mix(in srgb, var(--color-surface) 82%, white);
      border: 1px solid color-mix(in srgb, var(--color-border) 68%, white);
      min-width: 0;
    }

    .relationship-hero__index-label {
      font-size: var(--font-size-xs);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
    }

    .relationship-hero__index-value {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: var(--font-weight-semibold);
      line-height: 1;
      color: var(--color-text);
    }

    .relationship-hero__index-track {
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      background: color-mix(in srgb, var(--color-border) 58%, white);
    }

    .relationship-hero__index-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--relation-fill-trust), var(--relation-fill-close));
    }

    .relationship-hero__metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .relationship-hero__metric {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface-muted) 65%, white);
      border: 1px solid color-mix(in srgb, var(--color-border) 58%, white);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }

    .relationship-hero__metric strong {
      color: var(--color-text);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }

    .relationship-hero__support-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-4);
      padding: clamp(1.1rem, 2.1vw, 1.6rem);
    }

    .relationship-support-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
      padding: var(--space-4);
      border-radius: calc(var(--radius-2xl) - 2px);
      background: color-mix(in srgb, var(--color-surface) 82%, white);
      border: 1px solid color-mix(in srgb, var(--color-border) 68%, white);
    }

    .relationship-support-card__title {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      letter-spacing: -0.02em;
      color: var(--color-text);
    }

    .relationship-support-list,
    .relationship-note-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .relationship-support-item {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--color-border-light);
    }

    .relationship-support-item:last-child {
      padding-bottom: 0;
      border-bottom: none;
    }

    .relationship-support-item__header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: var(--space-3);
    }

    .relationship-support-item__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .relationship-support-item__body,
    .relationship-support-card__empty,
    .relationship-note {
      font-size: var(--font-size-sm);
      line-height: 1.75;
      color: var(--color-text-secondary);
    }

    .relationship-support-item__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .relationship-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .relationship-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.5rem 0.7rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--color-primary-soft) 48%, white);
      border: 1px solid color-mix(in srgb, var(--color-border) 68%, white);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .relationship-chip strong {
      color: var(--color-text);
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
    }

    .relationship-note {
      padding: var(--space-3);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface-muted) 60%, white);
      border: 1px solid color-mix(in srgb, var(--color-border) 62%, white);
    }

    .relationship-hero__fallback {
      padding: clamp(1.1rem, 2.2vw, 1.6rem);
    }

    @media (max-width: 1180px) {
      .relationship-hero__support-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 980px) {
      .relationship-hero__content {
        grid-template-columns: 1fr;
        gap: var(--space-4);
        padding: var(--space-5);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelationOverviewComponent implements OnInit {
  private readonly relationshipService = inject(RelationshipService);

  protected readonly overview = signal<RelationshipOverviewDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');

  async ngOnInit() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const result = await firstValueFrom(this.relationshipService.getOverview());
      this.overview.set(result ?? null);
    } catch {
      this.errorMessage.set('请确认后端关系画像接口已经可用。');
    } finally {
      this.loading.set(false);
    }
  }

  protected stageMeta(stage: RelationshipStage) {
    return STAGE_META[stage];
  }

  protected impactMeta(
    impact: keyof typeof IMPACT_META,
  ) {
    return IMPACT_META[impact];
  }

  protected relationIndexValue(data: RelationshipOverviewDto) {
    return Math.round(((data.trustScore + data.closenessScore) / 2) * 100);
  }

  protected relationIndexLabel(data: RelationshipOverviewDto) {
    return `${this.relationIndexValue(data)} / 100`;
  }

  protected defaultSummary(stage: RelationshipStage) {
    return STAGE_META[stage].description;
  }

  protected percentValue(value: number) {
    return `${Math.max(0, Math.min(100, Math.round(value * 100)))}`;
  }

  protected deltaLabel(value: number) {
    if (value > 0) return `+${value.toFixed(2)}`;
    if (value < 0) return value.toFixed(2);
    return '0.00';
  }

  protected categoryLabel(moment: RelationshipMomentPreviewDto) {
    return CATEGORY_LABELS[moment.category] ?? moment.category;
  }

  protected significanceLabel(value: number) {
    if (value >= 0.82) return '很高';
    if (value >= 0.68) return '较高';
    return '已记录';
  }
}
