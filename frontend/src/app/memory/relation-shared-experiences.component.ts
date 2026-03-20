import { DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  RelationshipService,
  SharedExperienceCategory,
  SharedExperienceRecord,
  SharedExperienceTone,
} from '../core/services/relationship.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

type CategoryFilter = 'all' | SharedExperienceCategory;
type ExperienceSortMode = 'time' | 'significance';

const CATEGORY_ORDER: SharedExperienceCategory[] = [
  'emotional_support',
  'co_thinking',
  'celebration',
  'crisis',
  'milestone',
  'daily_ritual',
];

const CATEGORY_META: Record<SharedExperienceCategory, {
  label: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  accent: string;
}> = {
  emotional_support: { label: '情绪支持', tone: 'info', accent: '#6f9bff' },
  co_thinking: { label: '一起思考', tone: 'warning', accent: '#8e7dff' },
  celebration: { label: '庆祝时刻', tone: 'warning', accent: '#daa43c' },
  crisis: { label: '紧张时刻', tone: 'danger', accent: '#d86a6a' },
  milestone: { label: '里程碑', tone: 'success', accent: '#57b48c' },
  daily_ritual: { label: '日常习惯', tone: 'neutral', accent: '#92a0bf' },
};

const TONE_LABELS: Record<SharedExperienceTone, string> = {
  warm: '温暖',
  bittersweet: '复杂',
  proud: '骄傲',
  relieved: '松一口气',
};

@Component({
  selector: 'app-relation-shared-experiences',
  standalone: true,
  imports: [DatePipe, NgClass, AppBadgeComponent, AppPanelComponent, AppStateComponent, AppTabsComponent],
  template: `
    <app-panel variant="workbench" class="experience-panel">
      <div class="panel-header">
        <div>
          <div class="panel-header__title">共同经历时间线</div>
          <p class="panel-header__description">把你们一起经历过的重要片段，整理成一条更有情绪温度的时间线。</p>
        </div>

        <label class="panel-toolbar__sort">
          <span>排序</span>
          <select class="ui-select" [value]="sortMode()" (change)="setSortMode($any($event.target).value)">
            <option value="time">按时间</option>
            <option value="significance">按重要度</option>
          </select>
        </label>
      </div>

      <app-tabs
        [items]="categoryTabs()"
        [value]="categoryFilter()"
        size="sm"
        (valueChange)="setCategoryFilter($event)"
      />

      @if (loading()) {
        <app-state
          kind="loading"
          title="共同经历加载中..."
          description="正在整理你们一起经历过的重要节点。"
        />
      } @else if (errorMessage()) {
        <app-state
          kind="error"
          title="共同经历暂时不可用"
          [description]="errorMessage()"
        />
      } @else if (experiences().length === 0) {
        <app-state
          title="还没有形成共同经历"
          description="等更多对话沉淀之后，这里会开始串起你们一起经历过的时刻。"
        />
      } @else if (visibleExperiences().length === 0) {
        <app-state
          title="当前筛选下没有结果"
          description="换一个分类或排序方式看看。"
        />
      } @else {
        <div class="timeline">
          @for (experience of visibleExperiences(); track experience.id) {
            <article
              class="timeline-item"
              [ngClass]="experienceClasses(experience)"
              [style.--experience-accent]="categoryMeta(experience.category).accent"
              [style.--significance-weight]="significanceWeight(experience.significance)"
            >
              <div class="timeline-item__rail">
                <span class="timeline-item__dot"></span>
              </div>

              <div class="timeline-item__card">
                <div class="timeline-item__header">
                  <div class="timeline-item__title-wrap">
                    <h3>{{ experience.title }}</h3>
                    <div class="timeline-item__meta">
                      {{ experience.happenedAt | date:'yyyy-MM-dd HH:mm' }}
                    </div>
                  </div>

                  <div class="timeline-item__badges">
                    <app-badge [tone]="categoryMeta(experience.category).tone" appearance="outline" size="sm">
                      {{ categoryMeta(experience.category).label }}
                    </app-badge>
                    <app-badge tone="neutral" appearance="outline" size="sm">
                      重要度 {{ percentLabel(experience.significance) }}
                    </app-badge>
                  </div>
                </div>

                <p class="timeline-item__summary">{{ experience.summary }}</p>

                <div class="timeline-item__footer">
                  @if (experience.emotionalTone) {
                    <span class="timeline-item__tone">{{ toneLabel(experience.emotionalTone) }}</span>
                  } @else {
                    <span class="timeline-item__tone timeline-item__tone--muted">未标注明显情绪基调</span>
                  }

                  <span class="timeline-item__conversations">{{ experience.conversationIds.length }} 次对话关联</span>
                </div>
              </div>
            </article>
          }
        </div>
      }
    </app-panel>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .experience-panel {
      gap: var(--space-4);
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
      align-items: start;
    }

    .panel-header__title {
      font-size: 1.05rem;
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .panel-header__description {
      margin: var(--space-2) 0 0;
      max-width: 54ch;
      font-size: var(--font-size-sm);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .panel-toolbar__sort {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 160px;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .timeline {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-left: var(--space-1);
    }

    .timeline::before {
      content: '';
      position: absolute;
      left: 11px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: linear-gradient(180deg, rgba(113, 138, 186, 0.14), rgba(113, 138, 186, 0.03));
    }

    .timeline-item {
      position: relative;
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: var(--space-3);
      align-items: start;
    }

    .timeline-item__rail {
      position: relative;
      display: flex;
      justify-content: center;
      padding-top: 0.6rem;
    }

    .timeline-item__dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--experience-accent);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--experience-accent) 18%, white);
    }

    .timeline-item__card {
      padding: var(--space-4);
      border-radius: calc(var(--workbench-card-radius) - 6px);
      border: calc(1px + (var(--significance-weight) * 0.8px)) solid color-mix(in srgb, var(--experience-accent) 24%, white);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--experience-accent) calc(5% + (var(--significance-weight) * 10%)), white) 0%, rgba(255, 255, 255, 0.92) 100%);
      box-shadow: 0 12px 34px rgba(24, 34, 56, 0.05);
    }

    .timeline-item__header,
    .timeline-item__footer {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
      align-items: start;
    }

    .timeline-item__title-wrap h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .timeline-item__meta,
    .timeline-item__footer,
    .timeline-item__tone,
    .timeline-item__conversations {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.6;
    }

    .timeline-item__badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: flex-end;
    }

    .timeline-item__summary {
      margin: var(--space-3) 0;
      font-size: var(--font-size-sm);
      line-height: 1.7;
      color: var(--color-text-secondary);
    }

    .timeline-item__tone {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: color-mix(in srgb, var(--experience-accent) 64%, var(--color-text-secondary));
    }

    .timeline-item__tone--muted {
      color: var(--color-text-muted);
    }

    @media (max-width: 980px) {
      .panel-header,
      .timeline-item__header,
      .timeline-item__footer {
        flex-direction: column;
      }

      .panel-toolbar__sort {
        min-width: 0;
        width: 100%;
      }

      .timeline-item__badges {
        justify-content: flex-start;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelationSharedExperiencesComponent implements OnInit {
  private readonly relationshipService = inject(RelationshipService);

  protected readonly experiences = signal<SharedExperienceRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly categoryFilter = signal<CategoryFilter>('all');
  protected readonly sortMode = signal<ExperienceSortMode>('time');
  protected readonly categoryTabs = computed<AppTabItem[]>(() => {
    const counts = new Map<CategoryFilter, number>([['all', this.experiences().length]]);

    for (const category of CATEGORY_ORDER) {
      counts.set(
        category,
        this.experiences().filter((experience) => experience.category === category).length,
      );
    }

    return [
      { value: 'all', label: '全部', count: counts.get('all') ?? 0 },
      ...CATEGORY_ORDER.map((category) => ({
        value: category,
        label: this.categoryMeta(category).label,
        count: counts.get(category) ?? 0,
      })),
    ];
  });
  protected readonly visibleExperiences = computed(() => {
    const category = this.categoryFilter();
    const filtered = category === 'all'
      ? [...this.experiences()]
      : this.experiences().filter((experience) => experience.category === category);

    return filtered.sort((left, right) => {
      if (this.sortMode() === 'significance') {
        if (right.significance !== left.significance) {
          return right.significance - left.significance;
        }
      }
      return right.happenedAt.localeCompare(left.happenedAt);
    });
  });

  async ngOnInit() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const result = await firstValueFrom(this.relationshipService.listSharedExperiences({
        limit: 80,
      }));
      this.experiences.set(result ?? []);
    } catch {
      this.errorMessage.set('请确认共同经历相关接口已经可用。');
    } finally {
      this.loading.set(false);
    }
  }

  protected categoryMeta(category: SharedExperienceCategory) {
    return CATEGORY_META[category];
  }

  protected setCategoryFilter(value: string) {
    this.categoryFilter.set(value as CategoryFilter);
  }

  protected setSortMode(value: string) {
    this.sortMode.set(value as ExperienceSortMode);
  }

  protected percentLabel(value: number) {
    return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
  }

  protected toneLabel(value: SharedExperienceTone) {
    return TONE_LABELS[value];
  }

  protected experienceClasses(experience: SharedExperienceRecord) {
    return [`timeline-item--${experience.category}`, experience.emotionalTone ? `timeline-item--tone-${experience.emotionalTone}` : ''];
  }

  protected significanceWeight(value: number) {
    return String(Math.min(1, Math.max(0.2, value)));
  }
}
