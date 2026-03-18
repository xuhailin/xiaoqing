import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

type TimelineViewMode = 'points' | 'day' | 'week';
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

const COGNITIVE_POINTS: CognitivePoint[] = [
  {
    id: 'xq-opening',
    segment: '清晨',
    time: '08:15',
    kind: 'conversation',
    title: '晨间开场切到更柔和的提问方式',
    summary: '默认先问一句“今天想先聊什么”，把进入对话的门槛压低，让小晴的节奏更容易被接住。',
    source: '即时感知',
    confidence: 96,
    tags: ['开场', '陪伴'],
    actors: ['用户', '小晴'],
  },
  {
    id: 'xq-memory',
    segment: '上午',
    time: '09:40',
    kind: 'memory',
    title: '把“先给计划再展开”的偏好写进记忆',
    summary: '最近几轮对话反复出现这个倾向，所以在说明和建议区里先给结构，再补细节。',
    source: '回合沉淀',
    confidence: 93,
    tags: ['偏好', '规划', '结构化'],
    actors: ['用户'],
  },
  {
    id: 'xq-reminder',
    segment: '中午',
    time: '11:25',
    kind: 'reminder',
    title: '轻提醒队列补上周四复盘节点',
    summary: '提醒本身保持在轻推而不打断的范围里，更像伴随而不是命令。',
    source: '提醒编排',
    confidence: 89,
    tags: ['提醒', '复盘'],
    actors: ['调度器'],
  },
  {
    id: 'xq-insight',
    segment: '午后',
    time: '14:05',
    kind: 'insight',
    title: '提炼出“先稳情绪，再给方案”的回应主线',
    summary: '当用户处在压力里时，先确认感受再给行动路径，整体气质会更贴合小晴当前的人格风格。',
    source: '关系洞察',
    confidence: 95,
    tags: ['洞察', '情绪', '关系'],
    actors: ['用户', '小晴'],
  },
  {
    id: 'xq-growth',
    segment: '傍晚',
    time: '17:10',
    kind: 'growth',
    title: '工作台能力扩到 DevAgent 协作场景',
    summary: '技术支持能力和主对话气质开始并存，所以认知轨迹里也要能看到执行向的节点。',
    source: '能力演进',
    confidence: 91,
    tags: ['执行', '协作', '前端'],
    actors: ['DevAgent'],
  },
  {
    id: 'xq-night',
    segment: '夜间',
    time: '20:45',
    kind: 'conversation',
    title: '晚间总结改成短句重点卡片',
    summary: '把长段落总结收束成几条重点卡，让信息密度更干净，也更适合移动端浏览。',
    source: '样式整理',
    confidence: 94,
    tags: ['总结', '短句', '移动端'],
    actors: ['用户', '小晴'],
  },
];

const WEEKLY_ACTIVITY: WeeklyActivity[] = [
  { day: '一', count: 5, intensity: 54 },
  { day: '二', count: 7, intensity: 74 },
  { day: '三', count: 6, intensity: 66 },
  { day: '四', count: 8, intensity: 88 },
  { day: '五', count: 7, intensity: 76 },
  { day: '六', count: 4, intensity: 42 },
  { day: '日', count: 6, intensity: 68 },
];

const WEEKLY_THEMES: WeeklyTheme[] = [
  { label: '对话节奏', share: 82, hint: '先接住，再推进' },
  { label: '记忆联结', share: 71, hint: '偏好会沿着页面持续被继承' },
  { label: '提醒陪伴', share: 58, hint: '弱提醒，不生硬' },
  { label: '执行支持', share: 64, hint: '任务型协助能力更完整' },
];

@Component({
  selector: 'app-cognitive-trace-board',
  standalone: true,
  imports: [NgClass, AppBadgeComponent, AppTabsComponent],
  templateUrl: './cognitive-trace-board.component.html',
  styleUrl: './cognitive-trace-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CognitiveTraceBoardComponent {
  protected readonly viewMode = signal<TimelineViewMode>('points');
  protected readonly points = COGNITIVE_POINTS;
  protected readonly weeklyActivity = WEEKLY_ACTIVITY;
  protected readonly weeklyThemes = WEEKLY_THEMES;
  protected readonly tabs: AppTabItem[] = [
    { value: 'points', label: '轨迹' },
    { value: 'day', label: '概览' },
    { value: 'week', label: '周览' },
  ];
  protected readonly kinds = computed(() => {
    const counts = new Map<CognitivePointKind, number>();
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
  protected readonly actors = [...new Set(COGNITIVE_POINTS.flatMap((point) => point.actors))];
  protected readonly tags = [...new Set(COGNITIVE_POINTS.flatMap((point) => point.tags))];
  protected readonly averageConfidence = Math.round(
    COGNITIVE_POINTS.reduce((sum, point) => sum + point.confidence, 0) / COGNITIVE_POINTS.length,
  );
  protected readonly totalWeekly = WEEKLY_ACTIVITY.reduce((sum, item) => sum + item.count, 0);
  protected readonly averageDaily = (this.totalWeekly / WEEKLY_ACTIVITY.length).toFixed(1);
  protected readonly topTheme = WEEKLY_THEMES[0]?.label ?? '对话节奏';
  protected readonly heroMetrics = [
    { label: '认知节点', value: `${COGNITIVE_POINTS.length}` },
    { label: '当前焦点', value: '记忆联结' },
    { label: '连续演进', value: '7 天' },
  ];

  protected selectViewMode(value: string) {
    if (value === 'points' || value === 'day' || value === 'week') {
      this.viewMode.set(value);
    }
  }

  protected kindTone(kind: CognitivePointKind): 'neutral' | 'info' | 'success' | 'warning' {
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

  protected kindLabel(kind: CognitivePointKind): string {
    switch (kind) {
      case 'conversation':
        return '对话';
      case 'memory':
        return '记忆';
      case 'reminder':
        return '提醒';
      case 'insight':
        return '洞察';
      case 'growth':
        return '演进';
    }
  }

  protected kindGlyph(kind: CognitivePointKind): string {
    switch (kind) {
      case 'conversation':
        return '聊';
      case 'memory':
        return '记';
      case 'reminder':
        return '提';
      case 'insight':
        return '察';
      case 'growth':
        return '升';
    }
  }
}
