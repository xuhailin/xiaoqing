import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';
import { LifeTraceService } from '../core/services/life-trace.service';

// ── Shared types ──

type TimelineViewMode = 'points' | 'day' | 'week' | 'xiaoqing';

// ── User life trace types (aligned with backend TracePointRecord) ──

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

// ── XiaoQing cognitive trace types ──

type CognitivePointKind = 'conversation' | 'memory' | 'reminder' | 'insight' | 'growth';

type CognitivePoint = {
  id: string;
  segment: string;
  time: string;
  kind: CognitivePointKind;
  title: string;
  summary: string;
  source: string;
  confidence: number;
  tags: string[];
  actors: string[];
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

// ── User life trace mock data ──

const USER_TRACE_POINTS: UserTracePoint[] = [
  {
    id: 'tp-1',
    kind: 'event',
    content: '又忙到忘记吃晚饭了，一直在改代码',
    happenedAt: '2026-03-18T19:30:00',
    mood: 'frustrated',
    people: [],
    tags: ['work', 'health'],
    confidence: 95,
    createdAt: '2026-03-18T20:15:00',
  },
  {
    id: 'tp-2',
    kind: 'mood',
    content: '今天整体压力比较大，项目进度赶不上',
    happenedAt: '2026-03-18T16:00:00',
    mood: 'stressed',
    people: [],
    tags: ['work', 'pressure'],
    confidence: 92,
    createdAt: '2026-03-18T16:30:00',
  },
  {
    id: 'tp-3',
    kind: 'mention',
    content: '和小张讨论了新的架构方案，他建议用事件驱动',
    happenedAt: '2026-03-18T14:20:00',
    mood: 'neutral',
    people: ['Xiao Zhang'],
    tags: ['work', 'architecture'],
    confidence: 88,
    createdAt: '2026-03-18T14:45:00',
  },
  {
    id: 'tp-4',
    kind: 'plan',
    content: '打算这周末去爬山，好久没运动了',
    happenedAt: null,
    mood: 'hopeful',
    people: [],
    tags: ['exercise', 'weekend'],
    confidence: 85,
    createdAt: '2026-03-18T12:10:00',
  },
  {
    id: 'tp-5',
    kind: 'event',
    content: '上午开了个线上会议，讨论 Q2 规划',
    happenedAt: '2026-03-18T10:00:00',
    mood: 'neutral',
    people: ['Team'],
    tags: ['work', 'meeting'],
    confidence: 93,
    createdAt: '2026-03-18T10:45:00',
  },
  {
    id: 'tp-6',
    kind: 'reflection',
    content: '感觉最近需要调整作息，不能一直熬夜写代码',
    happenedAt: null,
    mood: 'contemplative',
    people: [],
    tags: ['health', 'lifestyle'],
    confidence: 90,
    createdAt: '2026-03-18T22:00:00',
  },
  {
    id: 'tp-7',
    kind: 'event',
    content: '中午点了酸菜鱼外卖，味道还不错',
    happenedAt: '2026-03-18T12:30:00',
    mood: 'content',
    people: [],
    tags: ['food'],
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
  {
    dayKey: '2026-03-17',
    points: [],
    moodSummary: 'neutral',
    count: 4,
  },
  {
    dayKey: '2026-03-16',
    points: [],
    moodSummary: 'content',
    count: 3,
  },
];

const USER_DAILY_SUMMARIES: UserDailySummary[] = [
  {
    dayKey: '2026-03-18',
    title: 'Busy day, skipped dinner again',
    body: 'Spent most of the day heads-down on code. Met with Xiao Zhang about the event-driven architecture idea. Stressed about project timelines. Planning a weekend hike to decompress.',
    moodOverall: 'stressed',
    pointCount: 7,
  },
  {
    dayKey: '2026-03-17',
    title: 'Quiet day, caught up on reviews',
    body: 'Reviewed pull requests and did some light refactoring. Still thinking about the work-hour reporting task from yesterday.',
    moodOverall: 'neutral',
    pointCount: 4,
  },
  {
    dayKey: '2026-03-16',
    title: 'Weekend rest, prepping for the week',
    body: 'Took it easy, read some tech articles. Reminded myself about next week\'s deadlines.',
    moodOverall: 'content',
    pointCount: 3,
  },
];

const USER_WEEKLY_ACTIVITY: WeeklyActivity[] = [
  { day: 'Mon', count: 5, intensity: 54 },
  { day: 'Tue', count: 7, intensity: 74 },
  { day: 'Wed', count: 6, intensity: 66 },
  { day: 'Thu', count: 8, intensity: 88 },
  { day: 'Fri', count: 7, intensity: 76 },
  { day: 'Sat', count: 3, intensity: 32 },
  { day: 'Sun', count: 4, intensity: 42 },
];

const USER_WEEKLY_THEMES: WeeklyTheme[] = [
  { label: 'Work', share: 78, hint: 'Code, meetings, architecture' },
  { label: 'Health', share: 42, hint: 'Meals, sleep, exercise plans' },
  { label: 'Social', share: 35, hint: 'Colleagues, team discussions' },
  { label: 'Plans', share: 28, hint: 'Weekend, habits, goals' },
];

// ── XiaoQing cognitive trace mock data ──

const XIAOQING_COGNITIVE_POINTS: CognitivePoint[] = [
  {
    id: 'xq-opening',
    segment: 'Dawn',
    time: '08:15',
    kind: 'conversation',
    title: 'Shifted morning opener to a softer prompt',
    summary: 'Default to asking "what would you like to talk about today?" to lower the entry barrier and match XiaoQing\'s conversational rhythm.',
    source: 'Realtime',
    confidence: 96,
    tags: ['opener', 'companionship'],
    actors: ['User', 'XiaoQing'],
  },
  {
    id: 'xq-memory',
    segment: 'Morning',
    time: '09:40',
    kind: 'memory',
    title: 'Stored "plan-first, then expand" preference',
    summary: 'This pattern appeared repeatedly across recent turns. Homepage and suggestions now lead with structure before detail.',
    source: 'Post-turn',
    confidence: 93,
    tags: ['preference', 'planning', 'structure'],
    actors: ['User'],
  },
  {
    id: 'xq-reminder',
    segment: 'Noon',
    time: '11:25',
    kind: 'reminder',
    title: 'Queued a gentle Thursday review nudge',
    summary: 'Kept the tone as a soft nudge rather than a hard interrupt -- reminders should feel like accompaniment.',
    source: 'Scheduler',
    confidence: 89,
    tags: ['reminder', 'review'],
    actors: ['Scheduler'],
  },
  {
    id: 'xq-insight',
    segment: 'Afternoon',
    time: '14:05',
    kind: 'insight',
    title: 'Extracted "acknowledge feelings first, then solutions"',
    summary: 'When the user is under pressure, confirm the emotion before offering action paths. Aligns with XiaoQing\'s current persona.',
    source: 'Relational',
    confidence: 95,
    tags: ['insight', 'emotion', 'relationship'],
    actors: ['User', 'XiaoQing'],
  },
  {
    id: 'xq-growth',
    segment: 'Evening',
    time: '17:10',
    kind: 'growth',
    title: 'Workbench now covers DevAgent collaboration',
    summary: 'Technical support and conversational warmth coexist. The homepage can now display a mixed dialogue + execution stream.',
    source: 'Evolution',
    confidence: 91,
    tags: ['execution', 'collaboration', 'frontend'],
    actors: ['DevAgent'],
  },
  {
    id: 'xq-night',
    segment: 'Night',
    time: '20:45',
    kind: 'conversation',
    title: 'Evening wrap-up switched to compact highlight cards',
    summary: 'Condensed long paragraph summaries into punchy bullet cards -- cleaner density, better on mobile.',
    source: 'Refine',
    confidence: 94,
    tags: ['summary', 'compact', 'mobile'],
    actors: ['User', 'XiaoQing'],
  },
];

const XIAOQING_WEEKLY_ACTIVITY: WeeklyActivity[] = [
  { day: 'Mon', count: 5, intensity: 54 },
  { day: 'Tue', count: 7, intensity: 74 },
  { day: 'Wed', count: 6, intensity: 66 },
  { day: 'Thu', count: 8, intensity: 88 },
  { day: 'Fri', count: 7, intensity: 76 },
  { day: 'Sat', count: 4, intensity: 42 },
  { day: 'Sun', count: 6, intensity: 68 },
];

const XIAOQING_WEEKLY_THEMES: WeeklyTheme[] = [
  { label: 'Dialogue Rhythm', share: 82, hint: 'Receive first, then advance' },
  { label: 'Memory Linking', share: 71, hint: 'Preferences carried across pages' },
  { label: 'Gentle Reminders', share: 58, hint: 'Soft nudges, no pressure' },
  { label: 'Execution Support', share: 64, hint: 'Richer task-level assistance' },
];

@Component({
  selector: 'app-home-timeline',
  standalone: true,
  imports: [NgClass, AppBadgeComponent, AppTabsComponent],
  templateUrl: './home-timeline.component.html',
  styleUrl: './home-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeTimelineComponent {
  private readonly lifeTraceService = inject(LifeTraceService);

  protected readonly viewMode = signal<TimelineViewMode>('points');

  // User data
  protected readonly userPoints = USER_TRACE_POINTS;
  protected readonly userDayGroups = USER_DAY_GROUPS;
  protected readonly userDailySummaries = USER_DAILY_SUMMARIES;
  protected readonly userWeeklyActivity = USER_WEEKLY_ACTIVITY;
  protected readonly userWeeklyThemes = USER_WEEKLY_THEMES;

  // XiaoQing data
  protected readonly cognitivePoints = XIAOQING_COGNITIVE_POINTS;
  protected readonly xqWeeklyActivity = XIAOQING_WEEKLY_ACTIVITY;
  protected readonly xqWeeklyThemes = XIAOQING_WEEKLY_THEMES;

  protected readonly tabs: AppTabItem[] = [
    { value: 'points', label: 'Stream' },
    { value: 'day', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'xiaoqing', label: 'XiaoQing' },
  ];

  // ── User computed ──

  protected readonly userKinds = computed(() => {
    const counts = new Map<UserTracePointKind, number>();
    for (const point of this.userPoints) {
      counts.set(point.kind, (counts.get(point.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([kind, count]) => ({
      kind,
      count,
      label: this.userKindLabel(kind),
      tone: this.userKindTone(kind),
    }));
  });

  protected readonly userPeople = [...new Set(USER_TRACE_POINTS.flatMap((p) => p.people).filter(Boolean))];
  protected readonly userTags = [...new Set(USER_TRACE_POINTS.flatMap((p) => p.tags))];
  protected readonly userTotalWeekly = USER_WEEKLY_ACTIVITY.reduce((s, i) => s + i.count, 0);
  protected readonly userAvgDaily = (this.userTotalWeekly / USER_WEEKLY_ACTIVITY.length).toFixed(1);
  protected readonly userTopTheme = USER_WEEKLY_THEMES[0]?.label ?? 'Work';

  protected readonly todaySummary = USER_DAILY_SUMMARIES[0];

  protected readonly userHeroMetrics = [
    { label: 'Today', value: `${USER_TRACE_POINTS.length}` },
    { label: 'Mood', value: this.moodEmoji(USER_DAY_GROUPS[0]?.moodSummary) },
    { label: 'Streak', value: '3 Days' },
  ];

  // ── XiaoQing computed ──

  protected readonly xqKinds = computed(() => {
    const counts = new Map<CognitivePointKind, number>();
    for (const point of this.cognitivePoints) {
      counts.set(point.kind, (counts.get(point.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([kind, count]) => ({
      kind,
      count,
      label: this.cognitiveKindLabel(kind),
      tone: this.cognitiveKindTone(kind),
    }));
  });

  protected readonly xqActors = [...new Set(XIAOQING_COGNITIVE_POINTS.flatMap((p) => p.actors))];
  protected readonly xqTags = [...new Set(XIAOQING_COGNITIVE_POINTS.flatMap((p) => p.tags))];
  protected readonly xqAvgConfidence = Math.round(
    XIAOQING_COGNITIVE_POINTS.reduce((s, p) => s + p.confidence, 0) / XIAOQING_COGNITIVE_POINTS.length,
  );
  protected readonly xqTotalWeekly = XIAOQING_WEEKLY_ACTIVITY.reduce((s, i) => s + i.count, 0);
  protected readonly xqAvgDaily = (this.xqTotalWeekly / XIAOQING_WEEKLY_ACTIVITY.length).toFixed(1);
  protected readonly xqTopTheme = XIAOQING_WEEKLY_THEMES[0]?.label ?? 'Dialogue Rhythm';

  protected readonly xqHeroMetrics = [
    { label: 'Nodes', value: `${XIAOQING_COGNITIVE_POINTS.length}` },
    { label: 'Focus', value: 'Memory Link' },
    { label: 'Active', value: '7 Days' },
  ];

  // ── Actions ──

  protected selectViewMode(value: string) {
    if (value === 'points' || value === 'day' || value === 'week' || value === 'xiaoqing') {
      this.viewMode.set(value);
    }
  }

  // ── User kind helpers ──

  protected userKindTone(kind: UserTracePointKind): 'neutral' | 'info' | 'success' | 'warning' {
    switch (kind) {
      case 'event':
        return 'info';
      case 'mood':
        return 'warning';
      case 'mention':
        return 'success';
      case 'plan':
        return 'info';
      case 'reflection':
        return 'neutral';
    }
  }

  protected userKindLabel(kind: UserTracePointKind): string {
    switch (kind) {
      case 'event': return 'Event';
      case 'mood': return 'Mood';
      case 'mention': return 'People';
      case 'plan': return 'Plan';
      case 'reflection': return 'Reflection';
    }
  }

  protected userKindGlyph(kind: UserTracePointKind): string {
    switch (kind) {
      case 'event': return 'E';
      case 'mood': return 'M';
      case 'mention': return 'P';
      case 'plan': return 'G';
      case 'reflection': return 'R';
    }
  }

  protected timeSegment(isoTime: string | null, createdAt: string): string {
    const t = isoTime ?? createdAt;
    const h = new Date(t).getHours();
    if (h < 6) return 'Night';
    if (h < 9) return 'Dawn';
    if (h < 12) return 'Morning';
    if (h < 14) return 'Noon';
    if (h < 17) return 'Afternoon';
    if (h < 20) return 'Evening';
    return 'Night';
  }

  protected shortTime(isoTime: string | null, createdAt: string): string {
    const t = isoTime ?? createdAt;
    const d = new Date(t);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  protected moodEmoji(mood: string | null | undefined): string {
    switch (mood) {
      case 'stressed': case 'frustrated': return 'Stressed';
      case 'content': case 'happy': return 'Content';
      case 'hopeful': return 'Hopeful';
      case 'contemplative': return 'Thinking';
      default: return 'Neutral';
    }
  }

  protected formatDayKey(dayKey: string): string {
    const d = new Date(dayKey + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  }

  // ── XiaoQing kind helpers ──

  protected cognitiveKindTone(kind: CognitivePointKind): 'neutral' | 'info' | 'success' | 'warning' {
    switch (kind) {
      case 'conversation':
      case 'insight':
        return 'info';
      case 'memory':
      case 'growth':
        return 'success';
      case 'reminder':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  protected cognitiveKindLabel(kind: CognitivePointKind): string {
    switch (kind) {
      case 'conversation': return 'Dialogue';
      case 'memory': return 'Memory';
      case 'reminder': return 'Reminder';
      case 'insight': return 'Insight';
      case 'growth': return 'Growth';
    }
  }

  protected cognitiveKindGlyph(kind: CognitivePointKind): string {
    switch (kind) {
      case 'conversation': return 'D';
      case 'memory': return 'M';
      case 'reminder': return 'R';
      case 'insight': return 'I';
      case 'growth': return 'G';
    }
  }
}
