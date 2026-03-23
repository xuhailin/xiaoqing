import { Component, OnInit, OnDestroy, signal, inject, viewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Subscription, combineLatest } from 'rxjs';
import {
  ConversationService,
  AgentDelegationStatus,
  ConversationWorkItem,
  ConversationWorkHealthState,
  ConversationWorkStatus,
  Message,
  MessageContentType,
  MessageKind,
  DebugMeta,
  TraceStep,
  WorldState,
  EntryAgentId,
} from '../core/services/conversation.service';
import { JsonPipe, DOCUMENT, NgClass } from '@angular/common';
import { IdeaApiService } from '../core/services/idea.service';
import { PersonaService, EvolutionChange } from '../core/services/persona.service';
import { PlanApiService, type TaskOccurrenceRecord } from '../core/services/plan.service';
import { RelationshipService, SessionReflectionRecord } from '../core/services/relationship.service';
import { TodoApiService } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent, type AppIconName } from '../shared/ui/app-icon.component';
import { MessageContentComponent } from './message-content.component';
import { XiaoqingAvatarComponent } from '../shared/ui/xiaoqing-avatar.component';
import { ChatQuickActionsComponent } from './chat-quick-actions.component';
import { executionStatusLabel, executionStatusTone, ideaStatusLabel, ideaStatusTone, todoStatusLabel, todoStatusTone } from '../shared/workbench-status.utils';

type MessageDebugEntry = {
  debugMeta: DebugMeta | null;
  traceSteps: TraceStep[];
  openclawUsed: boolean;
};

type ActivityNotice = {
  tone: 'info' | 'success' | 'warning' | 'danger';
  text: string;
};

type MessageCaptureReceipt = {
  tone: 'info' | 'success' | 'warning';
  icon: AppIconName;
  label: string;
  kindLabel: string;
  statusLabel: string;
  entityTitle: string | null;
  summary: string | null;
  detail: string | null;
};

type ReceiptLiveStatus = {
  key: string;
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  detail?: string | null;
};

type WorkCardSignal = {
  tone: 'info' | 'warning' | 'success' | 'danger';
  icon: AppIconName;
  label: string;
  detail: string | null;
};

const MESSAGE_KIND_META: Partial<Record<MessageKind, { icon: AppIconName; label: string }>> = {
  agent_receipt: { icon: 'route', label: '代理回执' },
  agent_result: { icon: 'sparkles', label: '代理结果' },
  reminder_created: { icon: 'bell', label: '提醒已设置' },
  reminder_list: { icon: 'bell', label: '提醒列表' },
  reminder_cancelled: { icon: 'bell', label: '提醒已取消' },
  reminder_triggered: { icon: 'bell', label: '到点提醒' },
  tool: { icon: 'tool', label: '工具结果' },
  system: { icon: 'info', label: '系统提示' },
  daily_moment: { icon: 'sparkles', label: '今日日记' },
};

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    JsonPipe,
    NgClass,
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
    MessageContentComponent,
    XiaoqingAvatarComponent,
    ChatQuickActionsComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy {
  private conversation = inject(ConversationService);
  private ideaApi = inject(IdeaApiService);
  private personaService = inject(PersonaService);
  private planApi = inject(PlanApiService);
  private relationshipService = inject(RelationshipService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private todoApi = inject(TodoApiService);
  private document = inject(DOCUMENT);
  private routeSub?: Subscription;
  private workItemStreamSub?: Subscription;
  private pollHandle: number | null = null;
  private noticeTimer: number | null = null;
  private readonly receiptStatusRequests = new Set<string>();

  private inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('inputEl');
  private messagesEl = viewChild<ElementRef<HTMLDivElement>>('messagesEl');

  conversationId = signal<string | null>(null);
  entryAgentId = signal<EntryAgentId>('xiaoqing');
  messages = signal<Message[]>([]);
  inputText = signal('');
  loading = signal(false);
  error = signal<string | null>(null);
  activityNotice = signal<ActivityNotice | null>(null);
  workItems = signal<ConversationWorkItem[]>([]);
  receiptLiveStatus = signal<Record<string, ReceiptLiveStatus>>({});

  injectedMemories = signal<Array<{ id: string; type: string; content: string }>>([]);
  worldState = signal<WorldState | null>(null);
  sessionReflection = signal<SessionReflectionRecord | null>(null);
  collapsedSessionReflectionId = signal<string | null>(null);
  messageDebugState = signal<Record<string, MessageDebugEntry>>({});
  expandedTraceMessageId = signal<string | null>(null);
  activeDebugMessageId = signal<string | null>(null);
  copyDebugFeedback = signal<string | null>(null);

  evolveSuggestion = signal<EvolutionChange[] | null>(null);
  evolveConfirming = signal(false);
  evolveResult = signal<string | null>(null);

  protected hasTopPanels(): boolean {
    const worldState = this.worldState();
    return Boolean(
      this.error()
      || this.evolveResult()
      || this.activityNotice()
      || this.injectedMemories().length
      || this.evolveSuggestion()
      || this.sessionReflection()
      || worldState?.city
      || worldState?.timezone
      || worldState?.language,
    );
  }

  protected visibleSessionReflection(): SessionReflectionRecord | null {
    const reflection = this.sessionReflection();
    if (!reflection) return null;
    return this.collapsedSessionReflectionId() === reflection.id ? null : reflection;
  }

  protected isSessionReflectionCollapsed(reflectionId: string): boolean {
    return this.collapsedSessionReflectionId() === reflectionId;
  }

  protected showEmptyState(): boolean {
    return !this.loading() && this.messages().length === 0;
  }

  protected emptyStateTitle(): string {
    return this.entryAgentId() === 'xiaoqin' ? '和小勤开始一段新协作' : '和小晴开始一段新对话';
  }

  protected emptyStateDescription(): string {
    return this.entryAgentId() === 'xiaoqin'
      ? '这里会保留你和小勤的前台对话；如果小勤转给小晴处理，协作记录会单独沉淀下来。'
      : '小晴会陪你聊天、记事、提醒，也能在需要时自然接入执行能力。你可以直接说想法，也可以先从下面的快捷入口开始。';
  }

  protected emptyStateHints(): string[] {
    return this.entryAgentId() === 'xiaoqin'
      ? ['适合执行、排障、协作类话题', '需要转给小晴时会保留协作轨迹', '可以先描述目标、问题，或想让她代做的事']
      : ['适合闲聊、记录、提醒与长期陪伴', '短消息也没关系，小晴会顺着你的节奏接住', '可以直接输入近况、想法，或一句“帮我记一下”'];
  }

  ngOnInit() {
    this.routeSub = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, queryParams]) => {
      this.entryAgentId.set(queryParams.get('entryAgentId') === 'xiaoqin' ? 'xiaoqin' : 'xiaoqing');
      const id = params.get('id');
      if (id) {
        this.loadConversation(id);
      } else {
        this.loadCurrent();
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.stopWorkItemStream();
    this.stopConversationPolling();
    this.clearActivityNoticeTimer();
  }

  @HostListener('document:keydown.escape')
  handleEscapeKey() {
    if (this.activeDebugMessageId()) {
      this.closeDebugDialog();
    }
  }

  private async loadConversation(id: string) {
    // flush 旧会话（fire-and-forget，不阻塞切换）
    const previousId = this.conversationId();
    if (previousId && previousId !== id) {
      this.conversation.flushSummarize(previousId).subscribe({ error: () => {} });
    }

    this.error.set(null);
    this.messages.set([]);
    this.conversationId.set(id);
    this.stopWorkItemStream();
    this.stopConversationPolling();
    // 切换对话时重置所有通知/状态
    this.evolveResult.set(null);
    this.evolveSuggestion.set(null);
    this.injectedMemories.set([]);
    this.worldState.set(null);
    this.sessionReflection.set(null);
    this.collapsedSessionReflectionId.set(null);
    this.activityNotice.set(null);
    this.workItems.set([]);
    this.receiptLiveStatus.set({});
    this.resetMessageDebugState();
    await this.loadMessages(id, { forceScroll: true });
    await this.loadWorkItems(id);
    this.startWorkItemStream(id);
    await this.fetchWorldState(id);
    await this.fetchSessionReflection(id);
    this.startConversationPolling(id);
    this.checkPendingEvolution();
  }

  private async loadCurrent() {
    this.error.set(null);
    this.stopWorkItemStream();
    this.workItems.set([]);
    this.receiptLiveStatus.set({});
    this.resetMessageDebugState();
    try {
      const res = await this.conversation.getOrCreateCurrent(this.entryAgentId()).toPromise();
      if (res?.id) {
        this.conversationId.set(res.id);
        await this.loadMessages(res.id, { forceScroll: true });
        await this.loadWorkItems(res.id);
        this.startWorkItemStream(res.id);
        await this.fetchWorldState(res.id);
        await this.fetchSessionReflection(res.id);
        this.startConversationPolling(res.id);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : '获取会话失败');
    }
  }

  private async loadMessages(
    cid: string,
    options: { announceSpecial?: boolean; forceScroll?: boolean } = {},
  ) {
    try {
      const list = await this.conversation.getMessages(cid).toPromise();
      this.applyMessageSnapshot(list ?? [], options);
    } catch {
      if (!options.announceSpecial) {
        this.messages.set([]);
      }
    }
  }

  private async fetchWorldState(cid: string) {
    try {
      const ws = await this.conversation.getWorldState(cid).toPromise();
      this.worldState.set(ws ?? null);
    } catch {
      this.worldState.set(null);
    }
  }

  private async fetchSessionReflection(cid: string) {
    try {
      const rows = await this.relationshipService.listSessionReflections({
        conversationId: cid,
        limit: 1,
      }).toPromise();
      const latest = rows?.[0] ?? null;
      this.sessionReflection.set(latest);
      if (!latest) {
        this.collapsedSessionReflectionId.set(null);
      }
    } catch {
      this.sessionReflection.set(null);
      this.collapsedSessionReflectionId.set(null);
    }
  }

  collapseSessionReflection() {
    const reflection = this.sessionReflection();
    this.collapsedSessionReflectionId.set(reflection?.id ?? null);
  }

  expandSessionReflection() {
    this.collapsedSessionReflectionId.set(null);
  }

  private async loadWorkItems(cid: string) {
    try {
      const list = await this.conversation.getWorkItems(cid).toPromise();
      this.workItems.set(list ?? []);
    } catch {
      this.workItems.set([]);
    }
  }

  onKeydown(event: KeyboardEvent) {
    // 输入法合成中（中文/日文等 IME）直接忽略，避免确认候选词时误触发发送
    if (event.isComposing || (event as any).keyCode === 229) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!this.loading() && this.inputText().trim()) {
        this.send();
      }
    }
  }

  async send() {
    const cid = this.conversationId();
    const text = this.inputText().trim();
    if (!cid || !text) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.conversation.sendMessage(cid, text, this.entryAgentId()).toPromise();
      if (res) {
        this.applyMessageSnapshot(
          [...this.messages(), res.userMessage, res.assistantMessage, ...(res.extraMessages ?? [])],
          { forceScroll: true },
        );
        this.inputText.set('');
        const el = this.inputEl();
        if (el) el.nativeElement.value = '';
        if (res.injectedMemories) {
          this.injectedMemories.set(res.injectedMemories);
        }
        if (res.debugMeta || res.trace?.length || res.openclawUsed) {
          this.attachMessageDebugState(res.assistantMessage.id, {
            debugMeta: res.debugMeta ?? null,
            openclawUsed: !!res.openclawUsed,
            traceSteps: res.trace ?? [],
          });
        }
        this.expandedTraceMessageId.set(null);
        this.activeDebugMessageId.set(null);
        this.copyDebugFeedback.set(null);
        if (res.workItems?.length) {
          for (const item of res.workItems) {
            this.upsertWorkItem(item);
          }
        }
        await this.fetchWorldState(cid);
        await this.fetchSessionReflection(cid);
        this.checkPendingEvolution();
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : '发送失败');
    } finally {
      this.loading.set(false);
    }
  }

  /** 检查后端是否有自动总结产出的待确认进化建议 */
  private async checkPendingEvolution() {
    try {
      const pending = await this.personaService.getPendingEvolution().toPromise();
      if (pending?.changes?.length) {
        this.evolveSuggestion.set(pending.changes);
      }
    } catch { /* ignore */ }
  }

  async confirmEvolve() {
    const changes = this.evolveSuggestion();
    if (!changes?.length) return;
    this.evolveConfirming.set(true);
    this.evolveResult.set(null);
    try {
      const res = await this.personaService.confirmEvolution(changes).toPromise();
      if (res?.accepted) {
        this.evolveResult.set('已写入人格');
        this.evolveSuggestion.set(null);
      } else {
        this.evolveResult.set(`拒绝：${res?.reason ?? '未知原因'}`);
      }
      this.personaService.clearPendingEvolution().subscribe();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : '确认进化失败');
    } finally {
      this.evolveConfirming.set(false);
    }
  }

  dismissEvolve() {
    this.evolveSuggestion.set(null);
    this.evolveResult.set(null);
    this.personaService.clearPendingEvolution().subscribe();
  }

  private resetMessageDebugState() {
    this.messageDebugState.set({});
    this.expandedTraceMessageId.set(null);
    this.activeDebugMessageId.set(null);
    this.copyDebugFeedback.set(null);
  }

  private attachMessageDebugState(messageId: string, entry: MessageDebugEntry) {
    this.messageDebugState.update((state) => ({
      ...state,
      [messageId]: entry,
    }));
  }

  toggleTraceDetail(messageId: string) {
    this.expandedTraceMessageId.update((current) => current === messageId ? null : messageId);
  }

  openDebugDialog(messageId: string) {
    this.activeDebugMessageId.set(messageId);
    this.copyDebugFeedback.set(null);
  }

  closeDebugDialog() {
    this.activeDebugMessageId.set(null);
    this.copyDebugFeedback.set(null);
  }

  async copyDebugInfo(messageId: string) {
    const entry = this.messageDebugState()[messageId];
    if (!entry?.debugMeta) return;
    try {
      await this.writeToClipboard(JSON.stringify(entry.debugMeta, null, 2));
      this.copyDebugFeedback.set('已复制');
    } catch {
      this.copyDebugFeedback.set('复制失败');
    }
  }

  private async writeToClipboard(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = this.document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    this.document.body.appendChild(textarea);
    textarea.select();
    const copied = this.document.execCommand('copy');
    this.document.body.removeChild(textarea);
    if (!copied) {
      throw new Error('copy failed');
    }
  }

  formatDebugJson(debugMeta: DebugMeta): string {
    return JSON.stringify(debugMeta, null, 2);
  }

  /** 将 trace detail 对象格式化为可读的键值对行；pipeline 单独格式化为「管道状态」小节 */
  formatDetail(detail: Record<string, unknown>): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(detail)) {
      if (value === null || value === undefined) continue;
      if (key === 'pipeline' && typeof value === 'object' && value !== null) {
        lines.push('管道状态:');
        const p = value as Record<string, unknown>;
        for (const [k, v] of Object.entries(p)) {
          if (v === null || v === undefined) continue;
          lines.push(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        }
      } else if (typeof value === 'object') {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    return lines.join('\n');
  }

  /** 该 step 的 detail 是否包含 pipeline 快照（如策略决策合并后的管道状态） */
  hasPipelineInDetail(step: TraceStep): boolean {
    return step.detail && typeof step.detail === 'object' && 'pipeline' in step.detail;
  }

  isPipelineTraceStep(step: TraceStep): boolean {
    return step.label === 'pipeline-cognition'
      || step.label === 'pipeline-decision'
      || step.label === 'pipeline-expression';
  }

  traceTone(status: TraceStep['status']) {
    if (status === 'success') return 'success';
    if (status === 'fail') return 'danger';
    if (status === 'skip') return 'neutral';
    return 'info';
  }

  messageClasses(message: Message): Record<string, boolean> {
    return {
      user: message.role === 'user',
      assistant: message.role === 'assistant',
      'message--kind-agent-receipt': message.kind === 'agent_receipt',
      'message--kind-agent-result-success': message.kind === 'agent_result' && message.metadata?.success !== false,
      'message--kind-agent-result-fail': message.kind === 'agent_result' && message.metadata?.success === false,
      'message--kind-tool': message.kind === 'tool',
      'message--kind-system': message.kind === 'system',
      'message--kind-daily-moment': message.kind === 'daily_moment',
      'message--kind-reminder-created': message.kind === 'reminder_created',
      'message--kind-reminder-list': message.kind === 'reminder_list',
      'message--kind-reminder-cancelled': message.kind === 'reminder_cancelled',
      'message--kind-reminder-triggered': message.kind === 'reminder_triggered',
    };
  }

  messageKindTone(
    kind: MessageKind,
    message?: Message,
  ): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (kind === 'agent_receipt') return 'info';
    if (kind === 'agent_result') {
      return message?.metadata?.success === false ? 'danger' : 'success';
    }
    if (kind === 'reminder_triggered' || kind === 'reminder_created' || kind === 'reminder_list' || kind === 'reminder_cancelled') {
      return 'warning';
    }
    if (kind === 'tool' || kind === 'daily_moment') return 'info';
    if (kind === 'system') return 'neutral';
    return 'neutral';
  }

  messageKindMeta(kind: MessageKind) {
    return MESSAGE_KIND_META[kind] ?? null;
  }

  traceStepStatusIcon(status: TraceStep['status']): AppIconName {
    if (status === 'success') return 'check';
    if (status === 'fail') return 'close';
    return 'minus';
  }

  activityNoticeIcon(tone: ActivityNotice['tone']): AppIconName {
    if (tone === 'warning') return 'bell';
    if (tone === 'success') return 'check';
    if (tone === 'danger') return 'alert';
    return 'info';
  }

  relationImpactTone(impact: SessionReflectionRecord['relationImpact']): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (impact === 'deepened') return 'success';
    if (impact === 'repaired') return 'info';
    if (impact === 'strained') return 'danger';
    return 'neutral';
  }

  relationImpactLabel(impact: SessionReflectionRecord['relationImpact']) {
    if (impact === 'deepened') return '关系加深';
    if (impact === 'repaired') return '关系修复';
    if (impact === 'strained') return '关系紧张';
    return '关系平稳';
  }

  relationDeltaLabel(value: number) {
    const percent = Math.round(Math.abs(value) * 100);
    if (percent === 0) return '0%';
    return `${value > 0 ? '+' : '-'}${percent}%`;
  }

  workItemForMessage(message: Message): ConversationWorkItem | null {
    const workItemId = message.metadata?.workItemId;
    if (!workItemId) return null;
    return this.workItems().find((item) => item.id === workItemId) ?? null;
  }

  shouldRenderWorkCard(message: Message): boolean {
    return message.role === 'assistant'
      && (message.metadata?.workProjection === 'receipt' || message.metadata?.workProjection === 'followup');
  }

  workStatusTone(status: ConversationWorkStatus): 'info' | 'success' | 'warning' | 'danger' {
    if (status === 'completed') return 'success';
    if (status === 'failed' || status === 'cancelled' || status === 'timed_out') return 'danger';
    if (status === 'running') return 'info';
    if (status === 'waiting_input') return 'warning';
    if (status === 'queued') return 'warning';
    return 'info';
  }

  workStatusLabel(status: ConversationWorkStatus): string {
    if (status === 'accepted') return '已接手';
    if (status === 'queued') return '排队中';
    if (status === 'running') return '处理中';
    if (status === 'waiting_input') return '待补充';
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'cancelled') return '已取消';
    if (status === 'timed_out') return '已超时';
    return status;
  }

  workHealthTone(state: ConversationWorkHealthState): 'info' | 'warning' | 'danger' {
    if (state === 'timed_out' || state === 'stalled') return 'danger';
    if (state === 'attention' || state === 'waiting_user') return 'warning';
    return 'info';
  }

  workHealthLabel(item: ConversationWorkItem): string | null {
    if (item.status === 'failed' || item.status === 'cancelled' || item.status === 'timed_out') {
      return null;
    }
    if (item.healthState === 'waiting_user') return '等你回复';
    if (item.healthState === 'attention') return '持续跟进中';
    if (item.healthState === 'stalled') return '暂时卡住';
    if (item.healthState === 'timed_out') return '已超时';
    return null;
  }

  workHierarchyTone(item: ConversationWorkItem): 'neutral' | 'info' | 'warning' {
    if (item.parentWorkItemId) return 'info';
    if (item.childCount > 0) return 'warning';
    return 'neutral';
  }

  workHierarchyLabel(item: ConversationWorkItem): string | null {
    if (item.parentWorkItemId) {
      return '协作子任务';
    }
    if (item.childCount > 0) {
      return item.activeChildCount > 0 ? `协作任务 · 进行中 ${item.activeChildCount}` : '协作任务';
    }
    return null;
  }

  workCardTitle(item: ConversationWorkItem): string {
    const raw = (item.title || item.userFacingGoal || '').trim();
    return raw.replace(/^(父任务|子任务|协作任务)\s*[:：]\s*/u, '') || raw;
  }

  workCardSummary(item: ConversationWorkItem): string | null {
    const latest = item.latestSummary?.trim();
    if (latest) return latest;

    if (item.status === 'timed_out') return '处理超时，已停止等待。';
    if (item.status === 'failed') return '处理失败，当前没有拿到可用结果。';
    if (item.status === 'cancelled') return '任务已取消。';
    if (item.status === 'waiting_input') return item.waitingQuestion?.trim() ?? '等待你补充更多信息。';
    if (item.status === 'queued') return '已接手，等待开始。';
    if (item.status === 'running') return '正在处理中。';
    return null;
  }

  workCardMeta(item: ConversationWorkItem): string | null {
    const timeLabel = this.formatDateTime(item.updatedAt)
      || this.formatDateTime(item.startedAt)
      || this.formatDateTime(item.createdAt);
    return timeLabel ? `更新于 ${timeLabel}` : null;
  }

  workCardSignal(item: ConversationWorkItem): WorkCardSignal | null {
    const detail = item.waitingQuestion
      || item.blockReason
      || (item.healthSummary && item.healthSummary !== item.waitingQuestion && item.healthSummary !== item.blockReason
        ? item.healthSummary
        : null)
      || null;

    if (item.healthState === 'stalled') {
      return { tone: 'danger', icon: 'alert', label: '任务卡住', detail };
    }
    if (item.status === 'waiting_input' || item.healthState === 'waiting_user') {
      return { tone: 'warning', icon: 'alert', label: '等待补充信息', detail };
    }
    if (item.status === 'running') {
      return { tone: 'info', icon: 'route', label: '正在执行', detail };
    }
    if (item.status === 'queued' || item.status === 'accepted') {
      return { tone: 'warning', icon: 'info', label: '等待开始', detail };
    }
    if (item.status === 'completed' && detail) {
      return { tone: 'success', icon: 'check', label: '执行完成', detail };
    }
    return detail ? { tone: 'info', icon: 'info', label: '任务说明', detail } : null;
  }

  workCardClasses(item: ConversationWorkItem): Record<string, boolean> {
    return {
      'work-card--attention': item.healthState === 'attention',
      'work-card--stalled': item.healthState === 'stalled' || item.status === 'failed' || item.status === 'cancelled',
      'work-card--waiting': item.healthState === 'waiting_user' || item.status === 'waiting_input' || item.status === 'queued',
      'work-card--timed-out': item.healthState === 'timed_out' || item.status === 'timed_out',
      'work-card--child': !!item.parentWorkItemId,
    };
  }

  messageMetaLine(message: Message): string | null {
    if (message.kind === 'agent_receipt' || message.kind === 'agent_result') {
      const flow = this.agentFlowLabel(message.metadata?.fromAgentId, message.metadata?.toAgentId);
      const status = this.delegationStatusLabel(message.metadata?.delegationStatus);
      return [flow, status].filter(Boolean).join(' · ') || null;
    }
    if (message.metadata?.inboundAgentBus) {
      const flow = this.agentFlowLabel(message.metadata.requesterAgentId, message.metadata.executorAgentId);
      const summary = message.metadata.inboundSummary?.trim();
      return [flow, '后台协作', summary].filter(Boolean).join(' · ') || null;
    }
    if (message.kind === 'reminder_created') {
      const parts = [message.metadata?.scheduleText, this.formatDateTime(message.metadata?.nextRunAt)];
      return parts.filter(Boolean).join(' · ') || null;
    }
    if (message.kind === 'reminder_triggered') {
      return message.metadata?.reminderReason ? `提醒事项：${message.metadata.reminderReason}` : null;
    }
    if (message.kind === 'reminder_list' && typeof message.metadata?.count === 'number') {
      return `当前共 ${message.metadata.count} 个提醒`;
    }
    if (message.kind === 'reminder_cancelled') {
      return message.metadata?.reminderReason ? `已停止：${message.metadata.reminderReason}` : null;
    }
    if (message.kind === 'tool') {
      const toolName = message.metadata?.toolName || message.metadata?.toolKind;
      if (!toolName) return null;
      return `${toolName}${message.metadata?.success === false ? ' · 执行失败' : ''}`;
    }
    if (message.kind === 'daily_moment') {
      return '由用户主动生成';
    }
    return null;
  }

  messageSpeakerAgentId(message: Message): EntryAgentId | null {
    if (message.kind === 'agent_receipt' || message.kind === 'agent_result') {
      return message.metadata?.fromAgentId ?? null;
    }
    if (message.role === 'assistant') {
      return 'xiaoqing';
    }
    if (message.metadata?.inboundAgentBus) {
      return message.metadata.requesterAgentId ?? null;
    }
    return null;
  }

  messageSpeakerLabel(message: Message): string {
    const agentId = this.messageSpeakerAgentId(message);
    if (agentId) {
      if (message.role === 'user' && message.metadata?.inboundAgentBus) {
        return `${this.agentLabel(agentId) ?? '协作'}转达`;
      }
      return this.agentLabel(agentId) ?? '协作消息';
    }
    return message.role === 'assistant' ? '小晴' : '我';
  }

  displayedMessageContent(message: Message): string {
    if (!message.metadata?.inboundAgentBus) return message.content;

    const parts = [
      message.metadata.inboundSummary?.trim()
        ? `协作摘要：${message.metadata.inboundSummary.trim()}`
        : null,
      message.metadata.inboundUserInput?.trim()
        ? `转达内容：${message.metadata.inboundUserInput.trim()}`
        : null,
    ].filter((item): item is string => !!item);

    return parts.length ? parts.join('\n\n') : message.content;
  }

  displayedMessageContentType(message: Message): MessageContentType {
    if (message.metadata?.inboundAgentBus) return 'markdown';
    return message.contentType ?? (message.role === 'assistant' ? 'markdown' : 'text');
  }

  messageCaptureReceipt(message: Message): MessageCaptureReceipt | null {
    if (message.role !== 'assistant' || !message.metadata) return null;
    if (
      message.kind === 'tool'
      || message.kind === 'agent_receipt'
      || message.kind === 'agent_result'
      || message.kind === 'system'
      || message.kind === 'reminder_created'
      || message.kind === 'reminder_list'
      || message.kind === 'reminder_cancelled'
      || message.kind === 'reminder_triggered'
    ) {
      return null;
    }

    const captureKind = message.metadata.captureKind;
    const hasPlan = Boolean(message.metadata.planId);
    if (!captureKind && !hasPlan) return null;

    const scheduleDetail = [
      message.metadata.scheduleText,
      this.formatDateTime(message.metadata.nextRunAt),
    ].filter(Boolean).join(' · ') || null;

    if (captureKind === 'idea') {
      const ideaTitle = message.metadata.ideaTitle?.trim();
      return {
        tone: 'info',
        icon: 'sparkles',
        label: '已收进工作台',
        kindLabel: '想法',
        statusLabel: ideaStatusLabel('open'),
        entityTitle: ideaTitle ?? null,
        summary: '这条内容先收进想法区，后面再决定要不要转成待办。',
        detail: null,
      };
    }

    if (captureKind === 'todo') {
      const todoTitle = message.metadata.todoTitle?.trim();
      return {
        tone: hasPlan ? 'warning' : 'success',
        icon: hasPlan ? 'bell' : 'check',
        label: hasPlan ? '已记成待办并安排提醒' : '已记成待办',
        kindLabel: '待办',
        statusLabel: hasPlan ? executionStatusLabel('pending') : todoStatusLabel('open'),
        entityTitle: todoTitle ?? null,
        summary: hasPlan ? '我已经把这件事记成待办，并顺手挂上了提醒。' : '我已经把这件事记成待办，后面可以再送进执行。',
        detail: [message.metadata.planTitle, scheduleDetail].filter(Boolean).join(' · ') || null,
      };
    }

    return {
      tone: 'warning',
      icon: 'bell',
      label: '已进入提醒链路',
      kindLabel: '提醒',
      statusLabel: executionStatusLabel('pending'),
      entityTitle: message.metadata.planTitle?.trim() ?? null,
      summary: '这条内容已经进入提醒/调度链路。',
      detail: scheduleDetail,
    };
  }

  receiptStatusesForMessage(message: Message): ReceiptLiveStatus[] {
    const metadata = message.metadata;
    if (!metadata) return [];

    return [
      metadata.ideaId ? this.receiptLiveStatus()[`idea:${metadata.ideaId}`] : null,
      metadata.todoId ? this.receiptLiveStatus()[`todo:${metadata.todoId}`] : null,
      metadata.planId ? this.receiptLiveStatus()[`plan:${metadata.planId}`] : null,
    ].filter((item): item is ReceiptLiveStatus => !!item);
  }

  receiptLiveSummary(message: Message): string | null {
    const statuses = this.receiptStatusesForMessage(message);
    if (!statuses.length) return null;
    if (statuses.length === 1) {
      return statuses[0].detail ?? null;
    }

    const primary = statuses[statuses.length - 1];
    const secondary = statuses
      .slice(0, -1)
      .map((item) => item.label)
      .join(' · ');

    return [primary.detail, secondary ? `关联：${secondary}` : null].filter(Boolean).join(' ');
  }

  openCaptureTarget(message: Message, target: 'idea' | 'todo' | 'execution') {
    const metadata = message.metadata;
    if (!metadata) return;

    if (target === 'idea' && metadata.ideaId) {
      void this.router.navigate(['/workspace/ideas'], {
        queryParams: { ideaId: metadata.ideaId },
      });
      return;
    }

    if (target === 'todo' && metadata.todoId) {
      void this.router.navigate(['/workspace/todos'], {
        queryParams: { todoId: metadata.todoId },
      });
      return;
    }

    if (target === 'execution' && metadata.planId) {
      void this.router.navigate(['/workspace/execution'], {
        queryParams: {
          planId: metadata.planId,
          todoId: metadata.todoId ?? undefined,
        },
      });
    }
  }

  delegationStatusLabel(status?: AgentDelegationStatus | null): string | null {
    if (!status) return null;
    if (status === 'queued') return '排队中';
    if (status === 'acknowledged') return '已转达';
    if (status === 'running') return '执行中';
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'cancelled') return '已取消';
    return status;
  }

  agentLabel(agentId?: string | null): string | null {
    if (agentId === 'xiaoqin') return '小勤';
    if (agentId === 'xiaoqing') return '小晴';
    return null;
  }

  private agentFlowLabel(fromAgentId?: string | null, toAgentId?: string | null): string | null {
    const from = this.agentLabel(fromAgentId);
    const to = this.agentLabel(toAgentId);
    if (!from && !to) return null;
    if (from && to) return `${from} -> ${to}`;
    return from ?? to;
  }

  formatMessageTime(value: string): string {
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private applyMessageSnapshot(
    nextMessages: Message[],
    options: { announceSpecial?: boolean; forceScroll?: boolean } = {},
  ) {
    const previous = this.messages();
    const previousIds = new Set(previous.map((item) => item.id));
    const newMessages = nextMessages.filter((item) => !previousIds.has(item.id));
    const shouldStickBottom = options.forceScroll || this.isNearBottom();
    this.messages.set(nextMessages);
    void this.refreshReceiptLiveStatus(nextMessages);

    if (newMessages.length) {
      this.conversation.notifyListRefresh();
      if (options.announceSpecial) {
        this.announceSpecialMessages(newMessages);
      }
      if (shouldStickBottom) {
        this.scrollMessagesToBottom();
      }
    }
  }

  private async refreshReceiptLiveStatus(messages: Message[]) {
    const ideaIds = new Set<string>();
    const todoIds = new Set<string>();
    const planIds = new Set<string>();

    for (const message of messages) {
      const metadata = message.metadata;
      if (!metadata) continue;
      if (metadata.ideaId) ideaIds.add(metadata.ideaId);
      if (metadata.todoId) todoIds.add(metadata.todoId);
      if (metadata.planId) planIds.add(metadata.planId);
    }

    await Promise.all([
      ...[...ideaIds].map((id) => this.fetchIdeaReceiptStatus(id)),
      ...[...todoIds].map((id) => this.fetchTodoReceiptStatus(id)),
      ...[...planIds].map((id) => this.fetchPlanReceiptStatus(id)),
    ]);
  }

  private async fetchIdeaReceiptStatus(id: string) {
    const key = `idea:${id}`;
    if (this.receiptLiveStatus()[key] || this.receiptStatusRequests.has(key)) return;
    this.receiptStatusRequests.add(key);
    try {
      const idea = await firstValueFrom(this.ideaApi.get(id));
      const detail = idea.promotedTodo?.title
        ? `已转待办：${idea.promotedTodo.title}`
        : idea.status === 'open'
          ? '还在想法区，尚未转入待办。'
          : idea.status === 'archived'
            ? '这条想法已收起归档。'
            : '已经转入待办链路。';
      this.receiptLiveStatus.update((current) => ({
        ...current,
        [key]: {
          key,
          label: `想法 · ${ideaStatusLabel(idea.status)}`,
          tone: ideaStatusTone(idea.status),
          detail,
        },
      }));
    } catch {
      // ignore
    } finally {
      this.receiptStatusRequests.delete(key);
    }
  }

  private async fetchTodoReceiptStatus(id: string) {
    const key = `todo:${id}`;
    if (this.receiptLiveStatus()[key] || this.receiptStatusRequests.has(key)) return;
    this.receiptStatusRequests.add(key);
    try {
      const todo = await firstValueFrom(this.todoApi.get(id));
      const detail = todo.blockReason
        ? `待补充：${todo.blockReason}`
        : todo.latestTask?.status === 'failed' && todo.latestTask.errorSummary
          ? `最近执行失败：${todo.latestTask.errorSummary}`
          : todo.latestTask?.status === 'pending'
            ? '最近一次执行仍在处理中。'
            : todo.status === 'done'
              ? '这条待办已经处理完成。'
              : todo.status === 'dropped'
                ? '这条待办已被放弃。'
                : '这条待办仍可继续推进。';
      this.receiptLiveStatus.update((current) => ({
        ...current,
        [key]: {
          key,
          label: `待办 · ${todoStatusLabel(todo.status)}`,
          tone: todoStatusTone(todo.status),
          detail,
        },
      }));
    } catch {
      // ignore
    } finally {
      this.receiptStatusRequests.delete(key);
    }
  }

  private async fetchPlanReceiptStatus(id: string) {
    const key = `plan:${id}`;
    if (this.receiptLiveStatus()[key] || this.receiptStatusRequests.has(key)) return;
    this.receiptStatusRequests.add(key);
    try {
      const [plan, occurrences] = await Promise.all([
        firstValueFrom(this.planApi.get(id)),
        firstValueFrom(this.planApi.listOccurrences(id, undefined, 1)),
      ]);
      const latest = occurrences?.[0] ?? null;
      const normalized = this.normalizeExecutionStatus(plan.status, latest);
      this.receiptLiveStatus.update((current) => ({
        ...current,
        [key]: {
          key,
          label: `执行 · ${normalized.label}`,
          tone: normalized.tone,
          detail: normalized.detail,
        },
      }));
    } catch {
      // ignore
    } finally {
      this.receiptStatusRequests.delete(key);
    }
  }

  private normalizeExecutionStatus(
    planStatus: string,
    occurrence: TaskOccurrenceRecord | null,
  ): Pick<ReceiptLiveStatus, 'label' | 'tone' | 'detail'> {
    if (occurrence && this.isFailedOccurrence(occurrence)) {
      return {
        label: executionStatusLabel('failed'),
        tone: executionStatusTone('failed'),
        detail: this.readString(occurrence.resultPayload?.['error']) ?? '最近一次执行失败，仍可重试。',
      };
    }
    if (occurrence?.status === 'done') {
      return {
        label: executionStatusLabel('success'),
        tone: executionStatusTone('success'),
        detail: this.readString(occurrence.resultPayload?.['summary'])
          ?? this.readString(occurrence.resultRef)
          ?? '最近一次执行已完成。',
      };
    }
    if (occurrence?.status === 'pending' || planStatus === 'active' || planStatus === 'paused') {
      return {
        label: executionStatusLabel('pending'),
        tone: executionStatusTone('pending'),
        detail: occurrence?.scheduledAt ? `最近一次计划触发时间：${this.formatDateTime(occurrence.scheduledAt)}` : '执行仍在等待或排队中。',
      };
    }
    return {
      label: executionStatusLabel('pending'),
      tone: 'neutral',
      detail: '当前没有更新的执行结果，先保留为待确认状态。',
    };
  }

  private isFailedOccurrence(record: TaskOccurrenceRecord): boolean {
    return !!record.resultPayload
      && !Array.isArray(record.resultPayload)
      && record.resultPayload['success'] === false;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private announceSpecialMessages(messages: Message[]) {
    const latestReminder = [...messages].reverse().find((message) => message.kind === 'reminder_triggered');
    if (latestReminder) {
      const reason = latestReminder.metadata?.reminderReason || latestReminder.metadata?.summary || '新的提醒';
      this.setActivityNotice(reason, 'warning');
      return;
    }

    const latestSpecial = [...messages].reverse().find((message) => message.kind !== 'chat' && message.kind !== 'user');
    if (latestSpecial) {
      const label = this.messageKindMeta(latestSpecial.kind)?.label || '新消息';
      this.setActivityNotice(label, 'info');
    }
  }

  private setActivityNotice(text: string, tone: ActivityNotice['tone']) {
    this.activityNotice.set({ text, tone });
    this.clearActivityNoticeTimer();
    this.noticeTimer = window.setTimeout(() => this.activityNotice.set(null), 6000);
  }

  private clearActivityNoticeTimer() {
    if (this.noticeTimer !== null) {
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
  }

  private startConversationPolling(conversationId: string) {
    this.stopConversationPolling();
    this.pollHandle = window.setInterval(() => {
      if (this.loading() || this.conversationId() !== conversationId) {
        return;
      }
      void this.loadMessages(conversationId, { announceSpecial: true });
      if (!this.workItemStreamSub) {
        void this.loadWorkItems(conversationId);
        this.startWorkItemStream(conversationId);
      }
      void this.fetchSessionReflection(conversationId);
    }, 5000);
  }

  private startWorkItemStream(conversationId: string) {
    this.stopWorkItemStream();
    this.workItemStreamSub = this.conversation.streamWorkItems(conversationId).subscribe({
      next: (item) => {
        const previous = this.workItems().find((entry) => entry.id === item.id) ?? null;
        this.upsertWorkItem(item);
        const statusChanged = previous?.status !== item.status;
        const messageLinkedChanged = previous?.resultMessageId !== item.resultMessageId
          || previous?.waitingQuestion !== item.waitingQuestion;
        if (statusChanged || messageLinkedChanged) {
          void this.loadMessages(conversationId, { announceSpecial: true });
        }
      },
      error: () => {
        this.workItemStreamSub = undefined;
        void this.loadWorkItems(conversationId);
      },
    });
  }

  private stopWorkItemStream() {
    this.workItemStreamSub?.unsubscribe();
    this.workItemStreamSub = undefined;
  }

  private upsertWorkItem(item: ConversationWorkItem) {
    this.workItems.update((current) => {
      const next = [...current];
      const index = next.findIndex((entry) => entry.id === item.id);
      if (index >= 0) {
        next[index] = item;
      } else {
        next.unshift(item);
      }
      return next;
    });
  }

  private stopConversationPolling() {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private isNearBottom(): boolean {
    const element = this.messagesEl()?.nativeElement;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  }

  private scrollMessagesToBottom() {
    const element = this.messagesEl()?.nativeElement;
    if (!element) return;
    window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }

  protected formatDateTime(value?: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}
