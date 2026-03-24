import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DailySummaryRecord,
  LifeTraceService,
  TracePointDayGroup,
  TracePointKind,
  TracePointRecord,
} from '../core/services/life-trace.service';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppIconComponent, type AppIconName } from '../shared/ui/app-icon.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

type TimelineViewMode = 'points' | 'day' | 'week';

type WeeklyActivity = {
  dayKey: string;
  day: string;
  label: string;
  count: number;
  intensity: number;
  moodOverall: string | null;
  title: string;
};

type WeeklyTheme = {
  label: string;
  share: number;
  hint: string;
};

type TokenCount = {
  label: string;
  count: number;
};

type KindStat = {
  kind: TracePointKind;
  count: number;
  label: string;
  icon: AppIconName;
  tone: 'neutral' | 'info' | 'success' | 'warning';
};

type InsightMetric = {
  label: string;
  value: string;
  hint: string;
};

type MoodStat = {
  mood: string;
  label: string;
  count: number;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
};

type DayOverviewCard = {
  dayKey: string;
  title: string;
  body: string;
  moodOverall: string | null;
  pointCount: number;
  hasSummary: boolean;
};

const LOOKBACK_DAYS = 30;
const WEEKLY_WINDOW_DAYS = 7;
const RECENT_DAYS_LIMIT = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const TRACE_KIND_META: Record<TracePointKind, {
  label: string;
  icon: AppIconName;
  tone: 'neutral' | 'info' | 'success' | 'warning';
}> = {
  event: { label: '事件', icon: 'route', tone: 'info' },
  mood: { label: '情绪', icon: 'heartPulse', tone: 'warning' },
  mention: { label: '人物', icon: 'user', tone: 'success' },
  plan: { label: '计划', icon: 'calendarCheck', tone: 'info' },
  reflection: { label: '反思', icon: 'lightbulb', tone: 'neutral' },
};

@Component({
  selector: 'app-life-trace-board',
  standalone: true,
  imports: [NgClass, AppBadgeComponent, AppButtonComponent, AppIconComponent, AppStateComponent, AppTabsComponent],
  templateUrl: './life-trace-board.component.html',
  styleUrl: './life-trace-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeTraceBoardComponent implements OnInit {
  private readonly lifeTraceService = inject(LifeTraceService);
  private dayDetailRequestId = 0;

  protected readonly viewMode = signal<TimelineViewMode>('points');
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly dayGroups = signal<TracePointDayGroup[]>([]);
  protected readonly dailySummaries = signal<DailySummaryRecord[]>([]);
  protected readonly selectedDayKey = signal<string | null>(null);
  protected readonly dayPointCache = signal<Record<string, TracePointRecord[]>>({});
  protected readonly dayDetailLoading = signal(false);
  protected readonly dayDetailError = signal('');
  protected readonly tabs: AppTabItem[] = [
    { value: 'points', label: '轨迹' },
    { value: 'day', label: '日览' },
    { value: 'week', label: '周览' },
  ];

  protected readonly hasData = computed(() => this.dayGroups().length > 0 || this.dailySummaries().length > 0);
  protected readonly latestDayGroup = computed(() => this.dayGroups()[0] ?? null);
  protected readonly latestPoints = computed(() => this.latestDayGroup()?.points ?? []);
  protected readonly summaryMap = computed(
    () => new Map(this.dailySummaries().map((summary) => [summary.dayKey, summary])),
  );
  protected readonly highlightDayCard = computed(() => {
    const latest = this.latestDayGroup();
    if (latest) {
      return this.buildDayOverview(latest, this.summaryMap().get(latest.dayKey));
    }
    const firstSummary = this.dailySummaries()[0];
    return firstSummary ? this.summaryToDayOverview(firstSummary) : null;
  });
  protected readonly selectedDayKinds = computed(() => this.buildKindStats(this.selectedDayPoints()));
  protected readonly selectedDayPeople = computed(
    () => this.rankTokenCounts(this.selectedDayPoints(), 'people').slice(0, 6),
  );
  protected readonly selectedDayTags = computed(
    () => this.rankTokenCounts(this.selectedDayPoints(), 'tags').slice(0, 8),
  );
  protected readonly selectedDayAiCount = computed(
    () => this.selectedDayPoints().filter((point) => this.isAiPoint(point)).length,
  );
  protected readonly selectedDayMetrics = computed(() => {
    const card = this.selectedDayCard();
    const people = this.selectedDayPeople();
    const tags = this.selectedDayTags();
    const aiCount = this.selectedDayAiCount();

    return [
      {
        label: '主情绪',
        value: this.moodLabel(card?.moodOverall),
        hint: card?.moodOverall ? '来自当天片段里最常出现的情绪' : '当天没有明显情绪线索',
      },
      {
        label: '高频主题',
        value: tags[0]?.label ?? '暂无',
        hint: tags.length > 1 ? `${tags[0].label}、${tags[1].label} 反复出现` : '还没有形成稳定主题',
      },
      {
        label: '关系线索',
        value: people[0]?.label ?? '独处感',
        hint: people.length > 0 ? `共出现 ${people.length} 位人物线索` : '当天主要围绕个人事件展开',
      },
      {
        label: 'AI 参与',
        value: `${aiCount} 条`,
        hint: aiCount > 0 ? '这些片段先保留作辅助参考' : '当天没有低置信片段',
      },
    ] satisfies InsightMetric[];
  });
  protected readonly recentDayCards = computed(() => {
    const cards: DayOverviewCard[] = [];
    const seen = new Set<string>();
    const summaryMap = this.summaryMap();

    for (const group of this.dayGroups()) {
      cards.push(this.buildDayOverview(group, summaryMap.get(group.dayKey)));
      seen.add(group.dayKey);
    }

    for (const summary of this.dailySummaries()) {
      if (!seen.has(summary.dayKey)) {
        cards.push(this.summaryToDayOverview(summary));
      }
    }

    return cards.sort((a, b) => b.dayKey.localeCompare(a.dayKey)).slice(0, RECENT_DAYS_LIMIT);
  });
  protected readonly selectedDayCard = computed(() => {
    const dayKey = this.selectedDayKey();
    if (!dayKey) {
      return null;
    }

    return (
      this.recentDayCards().find((card) => card.dayKey === dayKey) ??
      this.dayCardFor(dayKey)
    );
  });
  protected readonly selectedDayPoints = computed(() => {
    const dayKey = this.selectedDayKey();
    if (!dayKey) {
      return [];
    }

    const cache = this.dayPointCache();
    if (Object.prototype.hasOwnProperty.call(cache, dayKey)) {
      return cache[dayKey] ?? [];
    }

    return this.dayGroups().find((group) => group.dayKey === dayKey)?.points ?? [];
  });
  protected readonly weeklyGroups = computed(() => {
    const keys = new Set(this.weekWindow().map((item) => item.dayKey));
    return this.dayGroups().filter((group) => keys.has(group.dayKey));
  });
  protected readonly weeklyPoints = computed(() => this.weeklyGroups().flatMap((group) => group.points));
  protected readonly weekWindow = computed(() => {
    const groupMap = new Map(this.dayGroups().map((group) => [group.dayKey, group]));
    const endDate = this.latestDayGroup() ? this.parseDayKey(this.latestDayGroup()!.dayKey) : this.today();
    const days: WeeklyActivity[] = [];

    for (let offset = WEEKLY_WINDOW_DAYS - 1; offset >= 0; offset--) {
      const date = new Date(endDate);
      date.setDate(endDate.getDate() - offset);
      const dayKey = this.toDayKey(date);
      const group = groupMap.get(dayKey);
      const count = group?.points.length ?? 0;
      const card = this.dayCardFor(dayKey);
      days.push({
        dayKey,
        day: this.weekdayLabel(date),
        label: this.formatMonthDay(dayKey),
        count,
        intensity: 0,
        moodOverall: group?.moodSummary ?? card?.moodOverall ?? null,
        title: card?.title ?? (count > 0 ? `记录了 ${count} 个片段` : '这一天还没有记录'),
      });
    }

    const max = Math.max(...days.map((item) => item.count), 0);
    return days.map((item) => ({
      ...item,
      intensity: max === 0 ? 18 : Math.max(18, Math.round((item.count / max) * 100)),
    }));
  });
  protected readonly weeklyActiveDays = computed(
    () => this.weekWindow().filter((item) => item.count > 0).length,
  );
  protected readonly weeklyRichestDay = computed(() => {
    const days = this.weekWindow().filter((item) => item.count > 0);
    if (days.length === 0) {
      return null;
    }
    return [...days].sort((a, b) => b.count - a.count)[0];
  });
  protected readonly weeklyThemes = computed(() => {
    const weeklyPoints = this.weeklyPoints();
    if (weeklyPoints.length === 0) {
      return [] as WeeklyTheme[];
    }

    const tagCounts = new Map<string, number>();
    for (const point of weeklyPoints) {
      for (const tag of point.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    if (tagCounts.size > 0) {
      const total = Array.from(tagCounts.values()).reduce((sum, count) => sum + count, 0);
      return Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([label, count]) => ({
          label,
          share: Math.max(8, Math.round((count / total) * 100)),
          hint: `近 7 天在 ${count} 条片段里出现`,
        }));
    }

    const kindCounts = new Map<TracePointKind, number>();
    for (const point of weeklyPoints) {
      kindCounts.set(point.kind, (kindCounts.get(point.kind) ?? 0) + 1);
    }

    return Array.from(kindCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([kind, count]) => ({
        label: this.kindLabel(kind),
        share: Math.max(8, Math.round((count / weeklyPoints.length) * 100)),
        hint: `近 7 天提炼出 ${count} 条${this.kindLabel(kind)}片段`,
      }));
  });
  protected readonly weeklyMoodStats = computed(() => {
    const counts = new Map<string, number>();
    for (const point of this.weeklyPoints()) {
      if (point.mood) {
        counts.set(point.mood, (counts.get(point.mood) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([mood, count]) => ({
        mood,
        label: this.moodLabel(mood),
        count,
        tone: this.moodTone(mood),
      })) satisfies MoodStat[];
  });
  protected readonly weeklyPeople = computed(
    () => this.rankTokenCounts(this.weeklyPoints(), 'people').slice(0, 8),
  );
  protected readonly weeklyKindMix = computed(() => this.buildKindStats(this.weeklyPoints()));
  protected readonly weeklyAiCount = computed(
    () => this.weeklyPoints().filter((point) => this.isAiPoint(point)).length,
  );
  protected readonly totalWeekly = computed(
    () => this.weekWindow().reduce((sum, item) => sum + item.count, 0),
  );
  protected readonly averageDaily = computed(() => (this.totalWeekly() / WEEKLY_WINDOW_DAYS).toFixed(1));
  protected readonly topTheme = computed(() => this.weeklyThemes()[0]?.label ?? '暂无主题');
  protected readonly weeklyHeadline = computed(() => {
    const dominantMood = this.weeklyMoodStats()[0]?.label;
    const richestDay = this.weeklyRichestDay();

    if (this.totalWeekly() === 0) {
      return '近七天还没有足够的生活片段，等新记录进来后这里会逐渐长出节律感。';
    }

    return [
      `近七天共沉淀 ${this.totalWeekly()} 条生活片段，${this.weeklyActiveDays()} 天保持记录。`,
      `主线围绕 ${this.topTheme()} 展开。`,
      dominantMood ? `整体情绪更接近“${dominantMood}”。` : '',
      richestDay ? `${richestDay.label} 是最饱满的一天。` : '',
    ]
      .filter(Boolean)
      .join('');
  });
  protected readonly weeklyMetrics = computed(() => {
    const richestDay = this.weeklyRichestDay();
    return [
      {
        label: '活跃天数',
        value: `${this.weeklyActiveDays()}/7`,
        hint: '近七天里真正留下轨迹的天数',
      },
      {
        label: '最满一天',
        value: richestDay?.label ?? '暂无',
        hint: richestDay ? `${richestDay.count} 条片段集中在这一天` : '还没有形成明显峰值',
      },
      {
        label: '人物线索',
        value: `${this.weeklyPeople().length} 位`,
        hint: this.weeklyPeople().length > 0 ? '持续出现的人会把这一周串起来' : '本周更多是个人状态记录',
      },
      {
        label: 'AI 参与',
        value: `${this.weeklyAiCount()} 条`,
        hint: this.weeklyAiCount() > 0 ? '低置信片段先保留在周观察里' : '本周没有低置信片段',
      },
    ] satisfies InsightMetric[];
  });
  protected readonly streakDays = computed(() => {
    const groups = this.dayGroups();
    if (groups.length === 0) {
      return 0;
    }

    let streak = 1;
    let previous = this.parseDayKey(groups[0].dayKey);

    for (let index = 1; index < groups.length; index++) {
      const current = this.parseDayKey(groups[index].dayKey);
      const diff = Math.round((previous.getTime() - current.getTime()) / DAY_MS);
      if (diff === 1) {
        streak += 1;
        previous = current;
        continue;
      }
      if (diff > 1) {
        break;
      }
    }

    return streak;
  });
  protected readonly heroMetrics = computed(() => {
    const highlight = this.highlightDayCard();
    return [
      {
        label: this.isToday(highlight?.dayKey ?? null) ? '今日片段' : '最近片段',
        value: `${highlight?.pointCount ?? 0}`,
      },
      {
        label: this.isToday(highlight?.dayKey ?? null) ? '今日情绪' : '最近情绪',
        value: this.moodLabel(highlight?.moodOverall),
      },
      {
        label: '连续记录',
        value: `${this.streakDays()} 天`,
      },
    ];
  });

  async ngOnInit() {
    await this.reload();
  }

  protected selectViewMode(value: string) {
    if (value === 'points' || value === 'day' || value === 'week') {
      this.viewMode.set(value);
    }
  }

  protected async reload() {
    const lookbackStart = this.today();
    lookbackStart.setDate(lookbackStart.getDate() - (LOOKBACK_DAYS - 1));
    lookbackStart.setHours(0, 0, 0, 0);

    this.loading.set(true);
    this.errorMessage.set('');
    this.dayDetailLoading.set(false);

    try {
      const [groupsResult, summariesResult] = await Promise.allSettled([
        firstValueFrom(
          this.lifeTraceService.queryByDay({
            since: lookbackStart.toISOString(),
          }),
        ),
        firstValueFrom(
          this.lifeTraceService.listSummaries({
            limit: LOOKBACK_DAYS,
            since: this.toDayKey(lookbackStart),
          }),
        ),
      ]);

      if (groupsResult.status === 'rejected') {
        throw groupsResult.reason;
      }

      const dayGroups = this.normalizeDayGroups(groupsResult.value ?? []);
      const summaries = summariesResult.status === 'fulfilled' ? summariesResult.value ?? [] : [];

      this.dayGroups.set(dayGroups);
      this.dailySummaries.set(
        summaries.sort((a, b) => b.dayKey.localeCompare(a.dayKey)).slice(0, LOOKBACK_DAYS),
      );

      const nextSelectedDay =
        this.pickSelectedDayKey(dayGroups, summaries) ??
        null;

      this.selectedDayKey.set(nextSelectedDay);
      this.dayDetailError.set('');
      if (nextSelectedDay) {
        void this.loadDayPoints(nextSelectedDay, { force: true });
      } else {
        this.dayPointCache.set({});
        this.dayDetailLoading.set(false);
      }
    } catch {
      this.dayGroups.set([]);
      this.dailySummaries.set([]);
      this.selectedDayKey.set(null);
      this.dayPointCache.set({});
      this.dayDetailLoading.set(false);
      this.dayDetailError.set('');
      this.errorMessage.set('生活轨迹数据加载失败，请确认后端服务已启动。');
    } finally {
      this.loading.set(false);
    }
  }

  protected selectDay(dayKey: string) {
    if (!dayKey) {
      return;
    }

    const current = this.selectedDayKey();
    this.selectedDayKey.set(dayKey);
    this.dayDetailError.set('');

    if (current === dayKey && this.hasCachedDayPoints(dayKey)) {
      return;
    }

    void this.loadDayPoints(dayKey);
  }

  protected retrySelectedDay() {
    const dayKey = this.selectedDayKey();
    if (!dayKey) {
      return;
    }
    void this.loadDayPoints(dayKey, { force: true });
  }

  protected kindTone(kind: TracePointKind): 'neutral' | 'info' | 'success' | 'warning' {
    return TRACE_KIND_META[kind].tone;
  }

  protected kindLabel(kind: TracePointKind): string {
    return TRACE_KIND_META[kind].label;
  }

  protected kindIcon(kind: TracePointKind): AppIconName {
    return TRACE_KIND_META[kind].icon;
  }

  protected timeSegment(isoTime: string | null, createdAt: string): string {
    const target = new Date(isoTime ?? createdAt).getHours();
    if (target < 6) return '凌晨';
    if (target < 9) return '清晨';
    if (target < 12) return '上午';
    if (target < 14) return '中午';
    if (target < 17) return '午后';
    if (target < 20) return '傍晚';
    return '夜间';
  }

  protected shortTime(isoTime: string | null, createdAt: string): string {
    const target = new Date(isoTime ?? createdAt);
    return `${target.getHours().toString().padStart(2, '0')}:${target
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  protected moodLabel(mood: string | null | undefined): string {
    switch (mood) {
      case 'stressed':
      case 'frustrated':
        return '偏紧绷';
      case 'content':
      case 'happy':
        return '偏舒展';
      case 'hopeful':
        return '有期待';
      case 'contemplative':
        return '在反思';
      default:
        return '平稳';
    }
  }

  protected moodTone(mood: string | null | undefined): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    switch (mood) {
      case 'content':
      case 'happy':
        return 'success';
      case 'hopeful':
        return 'info';
      case 'stressed':
      case 'frustrated':
        return 'warning';
      case 'contemplative':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  protected formatDayKey(dayKey: string): string {
    const target = this.parseDayKey(dayKey);
    return target.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
  }

  protected highlightDayLabel(): string {
    const highlight = this.highlightDayCard();
    if (!highlight) {
      return '最近记录';
    }
    return this.isToday(highlight.dayKey) ? '今天' : this.formatDayKey(highlight.dayKey);
  }

  protected confidencePercent(confidence: number): number {
    return confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
  }

  protected isAiPoint(point: TracePointRecord): boolean {
    return this.confidencePercent(point.confidence) === 0;
  }

  protected pointMetaLabel(point: TracePointRecord): string {
    return this.isAiPoint(point) ? 'AI 标记' : `可信 ${this.confidencePercent(point.confidence)}%`;
  }

  protected selectedDayLabel(): string {
    const dayKey = this.selectedDayKey();
    return dayKey ? this.formatDayKey(dayKey) : '当天详情';
  }

  protected selectedDayCaption(): string {
    const card = this.selectedDayCard();
    if (!card) {
      return '选择一天后查看当天的完整生活片段。';
    }
    return card.hasSummary ? '当天的日摘要和完整轨迹明细' : '当天还没有日摘要，先展示原始轨迹片段';
  }

  private normalizeDayGroups(groups: TracePointDayGroup[]): TracePointDayGroup[] {
    return groups
      .map((group) => {
        const points = this.sortPoints(group.points);

        return {
          ...group,
          points,
          count: points.length,
          moodSummary: group.moodSummary ?? this.dominantMood(points),
        };
      })
      .filter((group) => group.points.length > 0)
      .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  }

  private buildDayOverview(
    group: TracePointDayGroup,
    summary?: DailySummaryRecord,
  ): DayOverviewCard {
    if (summary) {
      return {
        dayKey: group.dayKey,
        title: summary.title,
        body: summary.body,
        moodOverall: summary.moodOverall ?? group.moodSummary,
        pointCount: group.points.length,
        hasSummary: true,
      };
    }

    const tags = this.rankTokens(group.points, 'tags').slice(0, 2);
    const title = tags.length > 0 ? `${tags.join(' / ')} 是这一天的主线` : `记录了 ${group.points.length} 个生活片段`;
    const leadPoint = group.points[0]?.content ?? '';
    const bodyParts = [`这一天沉淀了 ${group.points.length} 个生活片段`];

    if (group.moodSummary) {
      bodyParts.push(`整体情绪 ${this.moodLabel(group.moodSummary)}`);
    }
    if (leadPoint) {
      bodyParts.push(`最新片段提到“${this.truncate(leadPoint, 32)}”`);
    }

    return {
      dayKey: group.dayKey,
      title,
      body: `${bodyParts.join('，')}。`,
      moodOverall: group.moodSummary,
      pointCount: group.points.length,
      hasSummary: false,
    };
  }

  private summaryToDayOverview(summary: DailySummaryRecord): DayOverviewCard {
    return {
      dayKey: summary.dayKey,
      title: summary.title,
      body: summary.body,
      moodOverall: summary.moodOverall,
      pointCount: summary.pointCount,
      hasSummary: true,
    };
  }

  private dominantMood(points: TracePointRecord[]): string | null {
    const counts = new Map<string, number>();
    for (const point of points) {
      if (point.mood) {
        counts.set(point.mood, (counts.get(point.mood) ?? 0) + 1);
      }
    }
    if (counts.size === 0) {
      return null;
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }

  private rankTokens(points: TracePointRecord[], key: 'people' | 'tags'): string[] {
    return this.rankTokenCounts(points, key).map((item) => item.label);
  }

  private rankTokenCounts(points: TracePointRecord[], key: 'people' | 'tags'): TokenCount[] {
    const counts = new Map<string, number>();
    for (const point of points) {
      for (const token of point[key]) {
        if (!token) {
          continue;
        }
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([label, count]) => ({ label, count }));
  }

  private buildKindStats(points: TracePointRecord[]): KindStat[] {
    const counts = new Map<TracePointKind, number>();
    for (const point of points) {
      counts.set(point.kind, (counts.get(point.kind) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => ({
        kind,
        count,
        label: this.kindLabel(kind),
        icon: this.kindIcon(kind),
        tone: this.kindTone(kind),
      }));
  }

  private pointTimestamp(point: TracePointRecord): number {
    return new Date(point.happenedAt ?? point.createdAt).getTime();
  }

  private sortPoints(points: TracePointRecord[]): TracePointRecord[] {
    return [...points].sort((a, b) => this.pointTimestamp(b) - this.pointTimestamp(a));
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
  }

  private formatMonthDay(dayKey: string): string {
    const target = this.parseDayKey(dayKey);
    return target.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }

  private hasCachedDayPoints(dayKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.dayPointCache(), dayKey);
  }

  private pickSelectedDayKey(
    dayGroups: TracePointDayGroup[],
    summaries: DailySummaryRecord[],
  ): string | null {
    const current = this.selectedDayKey();
    const available = new Set<string>([
      ...dayGroups.map((group) => group.dayKey),
      ...summaries.map((summary) => summary.dayKey),
    ]);

    if (current && available.has(current)) {
      return current;
    }

    return dayGroups[0]?.dayKey ?? summaries[0]?.dayKey ?? null;
  }

  private dayCardFor(dayKey: string): DayOverviewCard | null {
    const group = this.dayGroups().find((item) => item.dayKey === dayKey);
    const summary = this.summaryMap().get(dayKey);

    if (group) {
      return this.buildDayOverview(group, summary);
    }
    if (summary) {
      return this.summaryToDayOverview(summary);
    }
    return null;
  }

  private async loadDayPoints(dayKey: string, options?: { force?: boolean }) {
    if (!options?.force && this.hasCachedDayPoints(dayKey)) {
      return;
    }

    const requestId = ++this.dayDetailRequestId;
    this.dayDetailLoading.set(true);
    this.dayDetailError.set('');

    try {
      const points = await firstValueFrom(this.lifeTraceService.getPointsForDay(dayKey));
      this.dayPointCache.set({
        ...this.dayPointCache(),
        [dayKey]: this.sortPoints(points ?? []),
      });
    } catch {
      if (requestId === this.dayDetailRequestId && this.selectedDayKey() === dayKey) {
        this.dayDetailError.set('当天明细加载失败，请稍后再试。');
      }
    } finally {
      if (requestId === this.dayDetailRequestId && this.selectedDayKey() === dayKey) {
        this.dayDetailLoading.set(false);
      }
    }
  }

  private weekdayLabel(date: Date): string {
    return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  }

  private parseDayKey(dayKey: string): Date {
    return new Date(`${dayKey}T00:00:00`);
  }

  private toDayKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private today(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private isToday(dayKey: string | null): boolean {
    return dayKey === this.toDayKey(this.today());
  }
}
