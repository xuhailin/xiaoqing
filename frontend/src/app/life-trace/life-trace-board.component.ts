import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

type TimelineViewMode = 'points' | 'day' | 'week';
type UserTracePointKind = 'event' | 'mood' | 'mention' | 'plan' | 'reflection';

type UserTracePoint = {
  id: string;
  kind: UserTracePointKind;
  content: string;
  happenedAt: string | null;
  mood: string | null;
  people: string[];
  tags: string[];
  confidence: number;
  createdAt: string;
};

type UserDayGroup = {
  dayKey: string;
  points: UserTracePoint[];
  moodSummary: string | null;
  count: number;
};

type UserDailySummary = {
  dayKey: string;
  title: string;
  body: string;
  moodOverall: string | null;
  pointCount: number;
};

type WeeklyActivity = {
  day: string;
  count: number;
  intensity: number;
};

type WeeklyTheme = {
  label: string;
  share: number;
  hint: string;
};

const USER_TRACE_POINTS: UserTracePoint[] = [
  {
    id: 'tp-1',
    kind: 'event',
    content: '又忙到忘记吃晚饭了，一直在改代码。',
    happenedAt: '2026-03-18T19:30:00',
    mood: 'frustrated',
    people: [],
    tags: ['工作', '健康'],
    confidence: 95,
    createdAt: '2026-03-18T20:15:00',
  },
  {
    id: 'tp-2',
    kind: 'mood',
    content: '今天整体压力比较大，项目节奏有点追不上。',
    happenedAt: '2026-03-18T16:00:00',
    mood: 'stressed',
    people: [],
    tags: ['压力', '项目'],
    confidence: 92,
    createdAt: '2026-03-18T16:30:00',
  },
  {
    id: 'tp-3',
    kind: 'mention',
    content: '和小张讨论了新架构方案，他建议往事件驱动方向走。',
    happenedAt: '2026-03-18T14:20:00',
    mood: 'neutral',
    people: ['小张'],
    tags: ['架构', '协作'],
    confidence: 88,
    createdAt: '2026-03-18T14:45:00',
  },
  {
    id: 'tp-4',
    kind: 'plan',
    content: '这周末想去爬山，最近坐得太久了。',
    happenedAt: null,
    mood: 'hopeful',
    people: [],
    tags: ['运动', '周末'],
    confidence: 85,
    createdAt: '2026-03-18T12:10:00',
  },
  {
    id: 'tp-5',
    kind: 'event',
    content: '上午开了个线上会议，主要在讨论 Q2 规划。',
    happenedAt: '2026-03-18T10:00:00',
    mood: 'neutral',
    people: ['团队'],
    tags: ['会议', '规划'],
    confidence: 93,
    createdAt: '2026-03-18T10:45:00',
  },
  {
    id: 'tp-6',
    kind: 'reflection',
    content: '最近确实该调整作息了，不能一直熬夜写代码。',
    happenedAt: null,
    mood: 'contemplative',
    people: [],
    tags: ['作息', '反思'],
    confidence: 90,
    createdAt: '2026-03-18T22:00:00',
  },
  {
    id: 'tp-7',
    kind: 'event',
    content: '中午点了酸菜鱼外卖，味道意外地不错。',
    happenedAt: '2026-03-18T12:30:00',
    mood: 'content',
    people: [],
    tags: ['吃饭', '日常'],
    confidence: 91,
    createdAt: '2026-03-18T13:00:00',
  },
];

const USER_DAY_GROUPS: UserDayGroup[] = [
  {
    dayKey: '2026-03-18',
    points: USER_TRACE_POINTS,
    moodSummary: 'stressed',
    count: USER_TRACE_POINTS.length,
  },
  { dayKey: '2026-03-17', points: [], moodSummary: 'neutral', count: 4 },
  { dayKey: '2026-03-16', points: [], moodSummary: 'content', count: 3 },
];

const USER_DAILY_SUMMARIES: UserDailySummary[] = [
  {
    dayKey: '2026-03-18',
    title: '忙碌的一天，又把晚饭拖到了很晚',
    body: '今天大部分时间都埋在代码里，中间和小张聊了架构方案，项目节奏有点压人。身体已经开始提醒自己，该把吃饭和休息重新摆回优先级了。',
    moodOverall: 'stressed',
    pointCount: 7,
  },
  {
    dayKey: '2026-03-17',
    title: '节奏比较安静，把积压的评审清掉了',
    body: '处理了几条 review，也顺手补了一些小重构。脑子里还挂着昨天那件需要继续跟进的工时上报。',
    moodOverall: 'neutral',
    pointCount: 4,
  },
  {
    dayKey: '2026-03-16',
    title: '周末稍微放松了一些，也在给下周蓄力',
    body: '没有安排太多事，读了点技术文章，也顺手把下周的几件重要事项过了一遍。',
    moodOverall: 'content',
    pointCount: 3,
  },
];

const USER_WEEKLY_ACTIVITY: WeeklyActivity[] = [
  { day: '一', count: 5, intensity: 54 },
  { day: '二', count: 7, intensity: 74 },
  { day: '三', count: 6, intensity: 66 },
  { day: '四', count: 8, intensity: 88 },
  { day: '五', count: 7, intensity: 76 },
  { day: '六', count: 3, intensity: 32 },
  { day: '日', count: 4, intensity: 42 },
];

const USER_WEEKLY_THEMES: WeeklyTheme[] = [
  { label: '工作', share: 78, hint: '代码、会议和方案讨论占比最高' },
  { label: '健康', share: 42, hint: '吃饭、睡眠和运动的提醒反复出现' },
  { label: '社交', share: 35, hint: '同事协作与沟通贯穿了工作日' },
  { label: '计划', share: 28, hint: '周末安排和习惯调整开始上升' },
];

@Component({
  selector: 'app-life-trace-board',
  standalone: true,
  imports: [NgClass, AppBadgeComponent, AppTabsComponent],
  templateUrl: './life-trace-board.component.html',
  styleUrl: './life-trace-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeTraceBoardComponent {
  protected readonly viewMode = signal<TimelineViewMode>('points');
  protected readonly points = USER_TRACE_POINTS;
  protected readonly dayGroups = USER_DAY_GROUPS;
  protected readonly dailySummaries = USER_DAILY_SUMMARIES;
  protected readonly weeklyActivity = USER_WEEKLY_ACTIVITY;
  protected readonly weeklyThemes = USER_WEEKLY_THEMES;
  protected readonly tabs: AppTabItem[] = [
    { value: 'points', label: '轨迹' },
    { value: 'day', label: '日览' },
    { value: 'week', label: '周览' },
  ];
  protected readonly kinds = computed(() => {
    const counts = new Map<UserTracePointKind, number>();
    for (const point of this.points) {
      counts.set(point.kind, (counts.get(point.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([kind, count]) => ({
      kind,
      count,
      label: this.kindLabel(kind),
      tone: this.kindTone(kind),
    }));
  });
  protected readonly people = [...new Set(USER_TRACE_POINTS.flatMap((point) => point.people).filter(Boolean))];
  protected readonly tags = [...new Set(USER_TRACE_POINTS.flatMap((point) => point.tags))];
  protected readonly totalWeekly = USER_WEEKLY_ACTIVITY.reduce((sum, item) => sum + item.count, 0);
  protected readonly averageDaily = (this.totalWeekly / USER_WEEKLY_ACTIVITY.length).toFixed(1);
  protected readonly topTheme = USER_WEEKLY_THEMES[0]?.label ?? '工作';
  protected readonly todaySummary = USER_DAILY_SUMMARIES[0];
  protected readonly heroMetrics = [
    { label: '今日片段', value: `${USER_TRACE_POINTS.length}` },
    { label: '今日情绪', value: this.moodLabel(USER_DAY_GROUPS[0]?.moodSummary) },
    { label: '连续记录', value: '3 天' },
  ];

  protected selectViewMode(value: string) {
    if (value === 'points' || value === 'day' || value === 'week') {
      this.viewMode.set(value);
    }
  }

  protected kindTone(kind: UserTracePointKind): 'neutral' | 'info' | 'success' | 'warning' {
    switch (kind) {
      case 'event':
      case 'plan':
        return 'info';
      case 'mention':
        return 'success';
      case 'mood':
        return 'warning';
      case 'reflection':
        return 'neutral';
    }
  }

  protected kindLabel(kind: UserTracePointKind): string {
    switch (kind) {
      case 'event':
        return '事件';
      case 'mood':
        return '情绪';
      case 'mention':
        return '人物';
      case 'plan':
        return '计划';
      case 'reflection':
        return '反思';
    }
  }

  protected kindGlyph(kind: UserTracePointKind): string {
    switch (kind) {
      case 'event':
        return '事';
      case 'mood':
        return '绪';
      case 'mention':
        return '人';
      case 'plan':
        return '计';
      case 'reflection':
        return '想';
    }
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
    return `${target.getHours().toString().padStart(2, '0')}:${target.getMinutes().toString().padStart(2, '0')}`;
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

  protected formatDayKey(dayKey: string): string {
    const target = new Date(`${dayKey}T00:00:00`);
    return target.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
  }
}
