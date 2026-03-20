import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  RelationshipOverviewDto,
  RelationshipService,
  RelationshipStage,
} from '../core/services/relationship.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
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
    description: '彼此正在建立稳定认知，更多是在试探节奏与边界。',
    tone: 'info',
  },
  familiar: {
    label: 'Familiar',
    title: '熟悉阶段',
    description: '互动方式逐渐稳定，信任和默契都在累积。',
    tone: 'warning',
  },
  steady: {
    label: 'Steady',
    title: '稳定阶段',
    description: '关系已经有连续性，小晴能更自然地承接情绪和日常。',
    tone: 'success',
  },
};

@Component({
  selector: 'app-relation-overview',
  standalone: true,
  imports: [DatePipe, AppBadgeComponent, AppPanelComponent, AppStateComponent],
  template: `
    <app-panel variant="workbench" class="overview-card">
      <div class="overview-hero">
        <div class="overview-copy">
          <div class="overview-copy__eyebrow">Relationship Overview</div>
          <div class="overview-copy__title">
            @if (overview(); as data) {
              {{ stageMeta(data.stage).title }}
            } @else {
              关系还在形成中
            }
          </div>
          <p class="overview-copy__description">
            @if (overview(); as data) {
              {{ data.summary || stageMeta(data.stage).description }}
            } @else {
              小晴会从连续对话里慢慢理解你们之间的信任、亲近感和互动节奏。
            }
          </p>
        </div>

        @if (overview(); as data) {
          <app-badge
            class="overview-stage"
            [tone]="stageMeta(data.stage).tone"
            appearance="outline"
          >
            {{ stageMeta(data.stage).label }}
          </app-badge>
        }
      </div>

      @if (loading()) {
        <app-state
          kind="loading"
          title="关系画像加载中..."
          description="正在整理小晴对这段关系的最新观察。"
        />
      } @else if (errorMessage()) {
        <app-state
          kind="error"
          title="关系画像暂时不可用"
          [description]="errorMessage()"
        />
      } @else if (overview(); as data) {
        <div class="overview-grid">
          <section class="metric-card">
            <div class="metric-card__label">信任度</div>
            <div class="metric-card__value">{{ percentLabel(data.trustScore) }}</div>
            <div class="metric-bar">
              <span class="metric-bar__fill metric-bar__fill--trust" [style.width.%]="percentValue(data.trustScore)"></span>
            </div>
            <div class="metric-card__hint">来自连续互动中的回应质量、承接感和稳定性。</div>
          </section>

          <section class="metric-card">
            <div class="metric-card__label">亲密度</div>
            <div class="metric-card__value">{{ percentLabel(data.closenessScore) }}</div>
            <div class="metric-bar">
              <span class="metric-bar__fill metric-bar__fill--close" [style.width.%]="percentValue(data.closenessScore)"></span>
            </div>
            <div class="metric-card__hint">反映你们是否进入了更熟悉、更自然的陪伴状态。</div>
          </section>
        </div>

        <div class="detail-grid">
          <section class="detail-card">
            <div class="detail-card__title">互动节奏偏好</div>
            @if (data.rhythmPreferences.length > 0) {
              <div class="chip-list">
                @for (preference of data.rhythmPreferences; track preference.key) {
                  <div class="preference-chip">
                    <div class="preference-chip__title">{{ preference.key }}</div>
                    <div class="preference-chip__meta">
                      {{ preference.level }} · 置信 {{ percentLabel(preference.confidence) }}
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="detail-card__empty">还没有积累出足够稳定的节奏偏好。</div>
            }
          </section>

          <section class="detail-card">
            <div class="detail-card__title">关系里程碑</div>
            @if (sortedMilestones().length > 0) {
              <div class="milestone-list">
                @for (milestone of sortedMilestones(); track milestone.label + milestone.date) {
                  <div class="milestone-item">
                    <span class="milestone-item__dot" [class.milestone-item__dot--experience]="milestone.type === 'shared_experience'"></span>
                    <div class="milestone-item__body">
                      <div class="milestone-item__label">{{ milestone.label }}</div>
                      <div class="milestone-item__meta">
                        {{ milestone.date | date:'yyyy-MM-dd HH:mm' }} · {{ milestoneTypeLabel(milestone.type) }}
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="detail-card__empty">还没有形成可以落在时间线里的关键节点。</div>
            }
          </section>
        </div>
      } @else {
        <app-state
          title="关系画像还没有建立完成"
          description="等有更多连续对话之后，这里会开始显示阶段、节奏和重要节点。"
        />
      }
    </app-panel>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .overview-card {
      gap: var(--space-5);
      overflow: hidden;
      background: var(--relation-hero-background);
    }

    .overview-hero {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
      align-items: start;
    }

    .overview-copy {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .overview-copy__eyebrow {
      font-size: var(--font-size-xs);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .overview-copy__title {
      font-size: clamp(1.3rem, 2vw, 1.9rem);
      font-weight: var(--font-weight-semibold);
      letter-spacing: -0.03em;
      color: var(--color-text);
    }

    .overview-copy__description {
      margin: 0;
      max-width: 70ch;
      font-size: var(--font-size-sm);
      line-height: 1.7;
      color: var(--color-text-secondary);
    }

    .overview-stage {
      flex-shrink: 0;
    }

    .overview-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-4);
    }

    .metric-card,
    .detail-card {
      padding: var(--space-4);
      border-radius: calc(var(--workbench-card-radius) - 6px);
      border: 1px solid var(--relation-card-border);
      background: var(--relation-card-bg);
      backdrop-filter: blur(8px);
    }

    .metric-card__label,
    .detail-card__title {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .metric-card__value {
      margin-top: var(--space-2);
      font-size: 1.6rem;
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .metric-bar {
      margin-top: var(--space-3);
      height: 10px;
      border-radius: 999px;
      background: var(--relation-track-bg);
      overflow: hidden;
    }

    .metric-bar__fill {
      display: block;
      height: 100%;
      border-radius: inherit;
    }

    .metric-bar__fill--trust {
      background: var(--relation-fill-trust);
    }

    .metric-bar__fill--close {
      background: var(--relation-fill-close);
    }

    .metric-card__hint,
    .detail-card__empty,
    .milestone-item__meta,
    .preference-chip__meta {
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .detail-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      gap: var(--space-4);
    }

    .chip-list,
    .milestone-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin-top: var(--space-3);
    }

    .preference-chip {
      padding: var(--space-3);
      border-radius: var(--radius-2xl);
      background: var(--relation-chip-bg);
      border: 1px solid var(--relation-chip-border);
    }

    .preference-chip__title,
    .milestone-item__label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .milestone-item {
      display: grid;
      grid-template-columns: 12px minmax(0, 1fr);
      gap: var(--space-3);
      align-items: start;
    }

    .milestone-item__dot {
      width: 12px;
      height: 12px;
      margin-top: 0.35rem;
      border-radius: 50%;
      background: var(--relation-milestone-primary);
      box-shadow: 0 0 0 4px var(--relation-milestone-primary-ring);
    }

    .milestone-item__dot--experience {
      background: var(--relation-milestone-success);
      box-shadow: 0 0 0 4px var(--relation-milestone-success-ring);
    }

    @media (max-width: 980px) {
      .overview-hero,
      .overview-grid,
      .detail-grid {
        grid-template-columns: 1fr;
        display: grid;
      }

      .overview-stage {
        justify-self: start;
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
  protected readonly sortedMilestones = computed(() =>
    [...(this.overview()?.milestones ?? [])].sort((left, right) => right.date.localeCompare(left.date)),
  );

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

  protected percentValue(value: number) {
    return Math.max(0, Math.min(100, Math.round(value * 100)));
  }

  protected percentLabel(value: number) {
    return `${this.percentValue(value)}%`;
  }

  protected milestoneTypeLabel(type: RelationshipOverviewDto['milestones'][number]['type']) {
    const labels: Record<RelationshipOverviewDto['milestones'][number]['type'], string> = {
      stage_change: '阶段变化',
      shared_experience: '共同经历',
      rhythm_shift: '节奏变化',
    };
    return labels[type];
  }
}
