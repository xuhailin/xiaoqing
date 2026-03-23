import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  MilestoneDto,
  RelationshipOverviewDto,
  RelationshipService,
  SessionReflectionRecord,
  SharedExperienceCategory,
  SharedExperienceRecord,
  SharedExperienceTone,
} from '../core/services/relationship.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

type TimelineFilter = 'all' | 'event' | 'emotion' | 'behavior';
type TimelineEntryKind = 'milestone' | 'experience' | 'reflection';

type TimelineEntry = {
  id: string;
  kind: TimelineEntryKind;
  lane: Exclude<TimelineFilter, 'all'>;
  happenedAt: string;
  title: string;
  summary: string;
  note: string;
  badge: string;
  badgeTone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
};

type TimelineGroup = {
  key: string;
  label: string;
  items: TimelineEntry[];
};

const TONE_LABELS: Record<SharedExperienceTone, string> = {
  warm: '温暖',
  bittersweet: '复杂',
  proud: '骄傲',
  relieved: '松一口气',
};

const CATEGORY_META: Record<SharedExperienceCategory, {
  label: string;
  lane: Exclude<TimelineFilter, 'all'>;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
}> = {
  emotional_support: { label: '情绪支持', lane: 'emotion', tone: 'info' },
  co_thinking: { label: '一起思考', lane: 'behavior', tone: 'warning' },
  celebration: { label: '庆祝时刻', lane: 'event', tone: 'warning' },
  crisis: { label: '紧张时刻', lane: 'emotion', tone: 'danger' },
  milestone: { label: '重要时刻', lane: 'event', tone: 'success' },
  daily_ritual: { label: '日常陪伴', lane: 'behavior', tone: 'neutral' },
};

const RELATION_IMPACT_META: Record<SessionReflectionRecord['relationImpact'], {
  title: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}> = {
  deepened: { title: '关系更近了一点', tone: 'success' },
  neutral: { title: '关系保持稳定', tone: 'neutral' },
  strained: { title: '关系有一点紧张', tone: 'danger' },
  repaired: { title: '关系被修复了一点', tone: 'warning' },
};

@Component({
  selector: 'app-relation-shared-experiences',
  standalone: true,
  imports: [DatePipe, AppBadgeComponent, AppSectionHeaderComponent, AppStateComponent, AppTabsComponent],
  template: `
    <section class="timeline-section">
      <div class="timeline-section__header">
        <app-section-header
          class="timeline-section__copy"
          title="共同经历主线"
          description="把真正留下痕迹的互动、关系节点和共同经历串成一条连续时间线。"
        />

        <app-tabs
          class="timeline-section__tabs"
          [items]="filterTabs()"
          [value]="filter()"
          size="sm"
          (valueChange)="setFilter($event)"
        />
      </div>

      @if (loading()) {
        <app-state
          [compact]="true"
          kind="loading"
          title="我在回看你们最近的互动"
          description="很快就会把值得记住的关系片段串起来。"
        />
      } @else if (errorMessage()) {
        <app-state
          [compact]="true"
          kind="error"
          title="时间线暂时没有整理出来"
          [description]="errorMessage()"
        />
      } @else if (timelineGroups().length === 0) {
        <app-state
          [compact]="true"
          title="我们还在积累第一段关系时间线"
          description="你可以继续和我聊聊今天发生了什么，我会慢慢把这些片段记成一条有温度的时间线。"
        />
      } @else {
        <div class="timeline">
          @for (group of timelineGroups(); track group.key) {
            <section class="timeline-group">
              <div class="timeline-group__label">{{ group.label }}</div>

              <div class="timeline-group__items">
                @for (entry of group.items; track entry.id) {
                  <article class="timeline-entry">
                    <div class="timeline-entry__rail">
                      <span class="timeline-entry__dot"></span>
                    </div>

                    <div class="timeline-entry__body">
                      <div class="timeline-entry__header">
                        <div class="timeline-entry__time">{{ entry.happenedAt | date:'HH:mm' }}</div>
                        <app-badge [tone]="entry.badgeTone" appearance="outline" size="sm">
                          {{ entry.badge }}
                        </app-badge>
                      </div>

                      <div class="timeline-entry__title">{{ entry.title }}</div>
                      <div class="timeline-entry__summary">{{ entry.summary }}</div>

                      @if (entry.note) {
                        <div class="timeline-entry__note">{{ entry.note }}</div>
                      }
                    </div>
                  </article>
                }
              </div>
            </section>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .timeline-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: 0 var(--space-1);
    }

    .timeline-section__header {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: var(--space-4);
    }

    .timeline-section__copy {
      min-width: 0;
    }

    .timeline-section__tabs {
      flex-shrink: 0;
    }

    .timeline {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .timeline-group {
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr);
      gap: var(--space-5);
      align-items: start;
    }

    .timeline-group__label {
      position: sticky;
      top: calc(var(--workbench-shell-padding) + var(--space-2));
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      letter-spacing: -0.01em;
    }

    .timeline-group__items {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding-left: var(--space-1);
    }

    .timeline-group__items::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 6px;
      bottom: 6px;
      width: 1px;
      background: var(--color-border-light);
    }

    .timeline-entry {
      position: relative;
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: var(--space-4);
      align-items: start;
    }

    .timeline-entry__rail {
      position: relative;
      display: flex;
      justify-content: center;
      padding-top: 0.35rem;
    }

    .timeline-entry__dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--color-primary);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary-soft) 55%, white);
    }

    .timeline-entry__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-bottom: var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
      min-width: 0;
    }

    .timeline-entry__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-3);
    }

    .timeline-entry__time,
    .timeline-entry__note {
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .timeline-entry__title {
      font-size: clamp(1rem, 1.6vw, 1.15rem);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      letter-spacing: -0.01em;
    }

    .timeline-entry__summary {
      font-size: var(--font-size-sm);
      line-height: 1.85;
      color: var(--color-text);
    }

    @media (max-width: 980px) {
      .timeline-section {
        gap: var(--space-4);
      }

      .timeline-section__header,
      .timeline-group {
        grid-template-columns: 1fr;
        display: grid;
      }

      .timeline-group {
        gap: var(--space-3);
      }

      .timeline-group__label {
        position: static;
        top: auto;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelationSharedExperiencesComponent implements OnInit {
  private readonly relationshipService = inject(RelationshipService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly overview = signal<RelationshipOverviewDto | null>(null);
  protected readonly experiences = signal<SharedExperienceRecord[]>([]);
  protected readonly reflections = signal<SessionReflectionRecord[]>([]);
  protected readonly filter = signal<TimelineFilter>('all');

  protected readonly entries = computed<TimelineEntry[]>(() => {
    const milestoneEntries = (this.overview()?.milestones ?? []).map((milestone) => this.toMilestoneEntry(milestone));
    const experienceEntries = this.experiences().map((experience) => this.toExperienceEntry(experience));
    const reflectionEntries = this.reflections().map((reflection) => this.toReflectionEntry(reflection));

    return [...milestoneEntries, ...experienceEntries, ...reflectionEntries]
      .sort((left, right) => right.happenedAt.localeCompare(left.happenedAt));
  });

  protected readonly timelineGroups = computed<TimelineGroup[]>(() => {
    const activeFilter = this.filter();
    const filtered = this.entries().filter((entry) => activeFilter === 'all' || entry.lane === activeFilter);
    const grouped = new Map<string, TimelineEntry[]>();

    for (const entry of filtered) {
      const key = entry.happenedAt.slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([key, items]) => ({
        key,
        label: this.dayLabel(key),
        items: items.sort((left, right) => right.happenedAt.localeCompare(left.happenedAt)),
      }));
  });

  protected readonly filterTabs = computed<AppTabItem[]>(() => {
    const counts = {
      all: this.entries().length,
      event: this.entries().filter((entry) => entry.lane === 'event').length,
      emotion: this.entries().filter((entry) => entry.lane === 'emotion').length,
      behavior: this.entries().filter((entry) => entry.lane === 'behavior').length,
    };

    return [
      { value: 'all', label: '全部', count: counts.all },
      { value: 'event', label: '事件', count: counts.event },
      { value: 'emotion', label: '情绪', count: counts.emotion },
      { value: 'behavior', label: '行为', count: counts.behavior },
    ];
  });

  async ngOnInit() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [overview, experiences, reflections] = await Promise.all([
        firstValueFrom(this.relationshipService.getOverview()),
        firstValueFrom(this.relationshipService.listSharedExperiences({ limit: 48 })),
        firstValueFrom(this.relationshipService.listSessionReflections({ limit: 48 })),
      ]);

      this.overview.set(overview ?? null);
      this.experiences.set(experiences ?? []);
      this.reflections.set(reflections ?? []);
    } catch {
      this.errorMessage.set('关系接口还没有完全准备好，稍后再来看我会把这些片段重新整理好。');
    } finally {
      this.loading.set(false);
    }
  }

  protected setFilter(value: string) {
    this.filter.set(value as TimelineFilter);
  }

  private toMilestoneEntry(milestone: MilestoneDto): TimelineEntry {
    return {
      id: `milestone-${milestone.type}-${milestone.date}-${milestone.label}`,
      kind: 'milestone',
      lane: 'event',
      happenedAt: milestone.date,
      title: milestone.label,
      summary: this.milestoneSummary(milestone),
      note: '这是关系阶段里的一个关键节点。',
      badge: '关系节点',
      badgeTone: 'success',
    };
  }

  private toExperienceEntry(experience: SharedExperienceRecord): TimelineEntry {
    const meta = CATEGORY_META[experience.category];
    return {
      id: experience.id,
      kind: 'experience',
      lane: meta.lane,
      happenedAt: experience.happenedAt,
      title: experience.title,
      summary: experience.summary,
      note: experience.emotionalTone
        ? `情绪：${TONE_LABELS[experience.emotionalTone]} · 关联 ${experience.conversationIds.length} 次对话`
        : `关联 ${experience.conversationIds.length} 次对话`,
      badge: meta.label,
      badgeTone: meta.tone,
    };
  }

  private toReflectionEntry(reflection: SessionReflectionRecord): TimelineEntry {
    const meta = RELATION_IMPACT_META[reflection.relationImpact];
    return {
      id: reflection.id,
      kind: 'reflection',
      lane: reflection.sharedMoment || reflection.rhythmNote ? 'behavior' : 'emotion',
      happenedAt: reflection.createdAt,
      title: meta.title,
      summary: reflection.summary,
      note: reflection.rhythmNote
        ? `行为：${reflection.rhythmNote}`
        : reflection.sharedMoment
          ? '行为：这一轮互动留下了值得记住的共同片段。'
          : '情绪会被继续留意，看看它会不会变成更稳定的关系线索。',
      badge: '互动回看',
      badgeTone: meta.tone,
    };
  }

  private milestoneSummary(milestone: MilestoneDto) {
    if (milestone.type === 'shared_experience') {
      return '这一刻被记成了共同经历，会成为关系记忆里更稳定的一部分。';
    }
    if (milestone.type === 'rhythm_shift') {
      return '你们的互动节奏发生了变化，小晴会继续观察这种变化会不会稳定下来。';
    }
    return '这代表关系阶段出现了一次可被记住的变化。';
  }

  private dayLabel(dateKey: string) {
    const target = new Date(`${dateKey}T00:00:00`);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((today.getTime() - target.getTime()) / 86400000);

    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    return dateKey.replace(/-/g, '.');
  }
}
