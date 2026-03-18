import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CognitiveTraceService,
  type CognitiveObservationRecord,
  type ObservationDayGroup,
  type ObservationDimension,
} from '../core/services/cognitive-trace.service';
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
};

type WeeklyTheme = {
  label: string;
  share: number;
  hint: string;
};

const LOOKBACK_DAYS = 30;
const WEEKLY_WINDOW_DAYS = 7;

const DIMENSION_META: Record<ObservationDimension, {
  label: string;
  icon: AppIconName;
  tone: 'neutral' | 'info' | 'success' | 'warning';
}> = {
  perception: { label: '感知', icon: 'sparkles', tone: 'info' },
  decision: { label: '决策', icon: 'brain', tone: 'warning' },
  memory: { label: '记忆', icon: 'bookmark', tone: 'success' },
  expression: { label: '表达', icon: 'message', tone: 'neutral' },
  growth: { label: '成长', icon: 'trendingUp', tone: 'success' },
};

@Component({
  selector: 'app-cognitive-trace-board',
  standalone: true,
  imports: [NgClass, AppBadgeComponent, AppIconComponent, AppStateComponent, AppTabsComponent],
  templateUrl: './cognitive-trace-board.component.html',
  styleUrl: './cognitive-trace-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CognitiveTraceBoardComponent implements OnInit {
  private readonly cognitiveTraceService = inject(CognitiveTraceService);

  protected readonly viewMode = signal<TimelineViewMode>('points');
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly dayGroups = signal<ObservationDayGroup[]>([]);
  protected readonly allObservations = signal<CognitiveObservationRecord[]>([]);
  protected readonly tabs: AppTabItem[] = [
    { value: 'points', label: '轨迹' },
    { value: 'day', label: '概览' },
    { value: 'week', label: '周览' },
  ];

  // ── Derived: latest points ──
  protected readonly hasData = computed(() => this.allObservations().length > 0);
  protected readonly latestPoints = computed(() => {
    const groups = this.dayGroups();
    return groups.length > 0 ? groups[0].observations : [];
  });

  // ── Derived: dimension stats ──
  protected readonly kinds = computed(() => {
    const counts = new Map<ObservationDimension, number>();
    for (const obs of this.allObservations()) {
      counts.set(obs.dimension, (counts.get(obs.dimension) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([dim, count]) => ({
      dimension: dim,
      count,
      label: this.dimensionLabel(dim),
      tone: this.dimensionTone(dim),
    }));
  });
  protected readonly averageConfidence = computed(() => {
    const obs = this.allObservations();
    if (obs.length === 0) return 0;
    return Math.round(
      (obs.reduce((sum, o) => sum + o.significance, 0) / obs.length) * 100,
    );
  });

  // ── Derived: weekly ──
  protected readonly weekWindow = computed(() => {
    const groupMap = new Map(this.dayGroups().map((g) => [g.dayKey, g]));
    const endDate = this.today();
    const days: WeeklyActivity[] = [];

    for (let offset = WEEKLY_WINDOW_DAYS - 1; offset >= 0; offset--) {
      const date = new Date(endDate);
      date.setDate(endDate.getDate() - offset);
      const dayKey = this.toDayKey(date);
      const group = groupMap.get(dayKey);
      const count = group?.count ?? 0;
      days.push({
        dayKey,
        day: this.weekdayLabel(date),
        label: this.formatMonthDay(dayKey),
        count,
        intensity: 0,
      });
    }

    const max = Math.max(...days.map((d) => d.count), 0);
    return days.map((d) => ({
      ...d,
      intensity: max === 0 ? 18 : Math.max(18, Math.round((d.count / max) * 100)),
    }));
  });
  protected readonly totalWeekly = computed(
    () => this.weekWindow().reduce((sum, d) => sum + d.count, 0),
  );
  protected readonly averageDaily = computed(
    () => (this.totalWeekly() / WEEKLY_WINDOW_DAYS).toFixed(1),
  );
  protected readonly weeklyThemes = computed(() => {
    const obs = this.allObservations();
    if (obs.length === 0) return [] as WeeklyTheme[];

    const dimCounts = new Map<ObservationDimension, number>();
    for (const o of obs) {
      dimCounts.set(o.dimension, (dimCounts.get(o.dimension) ?? 0) + 1);
    }

    const total = Array.from(dimCounts.values()).reduce((s, c) => s + c, 0);
    return Array.from(dimCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([dim, count]) => ({
        label: DIMENSION_META[dim].label,
        share: Math.max(8, Math.round((count / total) * 100)),
        hint: `近期产生 ${count} 条${DIMENSION_META[dim].label}观测`,
      }));
  });
  protected readonly topTheme = computed(
    () => this.weeklyThemes()[0]?.label ?? '暂无',
  );

  // ── Hero metrics ──
  protected readonly heroMetrics = computed(() => [
    { label: '认知节点', value: `${this.allObservations().length}` },
    { label: '当前焦点', value: this.topTheme() },
    { label: '日均观测', value: this.averageDaily() },
  ]);

  async ngOnInit() {
    await this.reload();
  }

  protected selectViewMode(value: string) {
    if (value === 'points' || value === 'day' || value === 'week') {
      this.viewMode.set(value);
    }
  }

  protected dimensionTone(dimension: ObservationDimension): 'neutral' | 'info' | 'success' | 'warning' {
    return DIMENSION_META[dimension]?.tone ?? 'neutral';
  }

  protected dimensionLabel(dimension: ObservationDimension): string {
    return DIMENSION_META[dimension]?.label ?? dimension;
  }

  protected dimensionIcon(dimension: ObservationDimension): AppIconName {
    return DIMENSION_META[dimension]?.icon ?? 'info';
  }

  protected timeSegment(isoTime: string): string {
    const hour = new Date(isoTime).getHours();
    if (hour < 6) return '凌晨';
    if (hour < 9) return '清晨';
    if (hour < 12) return '上午';
    if (hour < 14) return '中午';
    if (hour < 17) return '午后';
    if (hour < 20) return '傍晚';
    return '夜间';
  }

  protected shortTime(isoTime: string): string {
    const d = new Date(isoTime);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  protected significancePercent(significance: number): number {
    return Math.round(significance * 100);
  }

  protected async reload() {
    const lookbackStart = this.today();
    lookbackStart.setDate(lookbackStart.getDate() - (LOOKBACK_DAYS - 1));
    lookbackStart.setHours(0, 0, 0, 0);

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [obsResult, dayResult] = await Promise.allSettled([
        firstValueFrom(
          this.cognitiveTraceService.queryObservations({
            from: lookbackStart.toISOString(),
            limit: 100,
          }),
        ),
        firstValueFrom(
          this.cognitiveTraceService.queryByDay({
            from: lookbackStart.toISOString(),
          }),
        ),
      ]);

      if (obsResult.status === 'rejected') throw obsResult.reason;

      this.allObservations.set(obsResult.value ?? []);
      this.dayGroups.set(
        dayResult.status === 'fulfilled'
          ? (dayResult.value ?? []).sort((a, b) => b.dayKey.localeCompare(a.dayKey))
          : [],
      );
    } catch {
      this.allObservations.set([]);
      this.dayGroups.set([]);
      this.errorMessage.set('认知轨迹数据加载失败，请确认后端服务已启动。');
    } finally {
      this.loading.set(false);
    }
  }

  private toDayKey(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private today(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private weekdayLabel(date: Date): string {
    return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  }

  private formatMonthDay(dayKey: string): string {
    const target = new Date(`${dayKey}T00:00:00`);
    return target.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }
}
