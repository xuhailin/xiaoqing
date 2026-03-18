import { Component, OnInit, OnDestroy, signal, inject, viewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  ConversationService,
  Message,
  MessageKind,
  DebugMeta,
  TraceStep,
  WorldState,
} from '../core/services/conversation.service';
import { JsonPipe, DOCUMENT, NgClass } from '@angular/common';
import { PersonaService, EvolutionChange } from '../core/services/persona.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { MessageContentComponent } from './message-content.component';

type MessageDebugEntry = {
  debugMeta: DebugMeta | null;
  traceSteps: TraceStep[];
  openclawUsed: boolean;
};

type ActivityNotice = {
  tone: 'info' | 'success' | 'warning' | 'danger';
  text: string;
};

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [JsonPipe, NgClass, AppBadgeComponent, AppButtonComponent, MessageContentComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy {
  private conversation = inject(ConversationService);
  private personaService = inject(PersonaService);
  private route = inject(ActivatedRoute);
  private document = inject(DOCUMENT);
  private routeSub?: Subscription;
  private pollHandle: number | null = null;
  private noticeTimer: number | null = null;

  private inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('inputEl');
  private messagesEl = viewChild<ElementRef<HTMLDivElement>>('messagesEl');

  conversationId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  inputText = signal('');
  loading = signal(false);
  error = signal<string | null>(null);
  activityNotice = signal<ActivityNotice | null>(null);

  injectedMemories = signal<Array<{ id: string; type: string; content: string }>>([]);
  worldState = signal<WorldState | null>(null);
  messageDebugState = signal<Record<string, MessageDebugEntry>>({});
  expandedTraceMessageId = signal<string | null>(null);
  activeDebugMessageId = signal<string | null>(null);
  copyDebugFeedback = signal<string | null>(null);

  evolveSuggestion = signal<EvolutionChange[] | null>(null);
  evolveConfirming = signal(false);
  evolveResult = signal<string | null>(null);

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe((params) => {
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
    this.stopConversationPolling();
    // 切换对话时重置所有通知/状态
    this.evolveResult.set(null);
    this.evolveSuggestion.set(null);
    this.injectedMemories.set([]);
    this.worldState.set(null);
    this.activityNotice.set(null);
    this.resetMessageDebugState();
    await this.loadMessages(id, { forceScroll: true });
    await this.fetchWorldState(id);
    this.startConversationPolling(id);
    this.checkPendingEvolution();
  }

  private async loadCurrent() {
    this.error.set(null);
    this.resetMessageDebugState();
    try {
      const res = await this.conversation.getOrCreateCurrent().toPromise();
      if (res?.id) {
        this.conversationId.set(res.id);
        await this.loadMessages(res.id, { forceScroll: true });
        await this.fetchWorldState(res.id);
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
      const res = await this.conversation.sendMessage(cid, text).toPromise();
      if (res) {
        this.applyMessageSnapshot(
          [...this.messages(), res.userMessage, res.assistantMessage],
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
        await this.fetchWorldState(cid);
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
      'message--kind-tool': message.kind === 'tool',
      'message--kind-system': message.kind === 'system',
      'message--kind-daily-moment': message.kind === 'daily_moment',
      'message--kind-reminder-created': message.kind === 'reminder_created',
      'message--kind-reminder-list': message.kind === 'reminder_list',
      'message--kind-reminder-cancelled': message.kind === 'reminder_cancelled',
      'message--kind-reminder-triggered': message.kind === 'reminder_triggered',
    };
  }

  messageKindTone(kind: MessageKind): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (kind === 'reminder_triggered' || kind === 'reminder_created' || kind === 'reminder_list' || kind === 'reminder_cancelled') {
      return 'warning';
    }
    if (kind === 'tool' || kind === 'daily_moment') return 'info';
    if (kind === 'system') return 'neutral';
    return 'neutral';
  }

  messageKindLabel(kind: MessageKind): string | null {
    if (kind === 'reminder_created') return '🔔 提醒已设置';
    if (kind === 'reminder_list') return '🔔 提醒列表';
    if (kind === 'reminder_cancelled') return '🔔 提醒已取消';
    if (kind === 'reminder_triggered') return '🔔 到点提醒';
    if (kind === 'tool') return '🛠 工具结果';
    if (kind === 'system') return 'ℹ 系统提示';
    if (kind === 'daily_moment') return '✦ 今日日记';
    return null;
  }

  messageMetaLine(message: Message): string | null {
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
      return message.metadata?.triggerMode === 'accept_suggestion' ? '由轻提示接续生成' : '由对话自然生成';
    }
    return null;
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

  private announceSpecialMessages(messages: Message[]) {
    const latestReminder = [...messages].reverse().find((message) => message.kind === 'reminder_triggered');
    if (latestReminder) {
      const reason = latestReminder.metadata?.reminderReason || latestReminder.metadata?.summary || '新的提醒';
      this.setActivityNotice(`🔔 ${reason}`, 'warning');
      return;
    }

    const latestSpecial = [...messages].reverse().find((message) => message.kind !== 'chat' && message.kind !== 'user');
    if (latestSpecial) {
      const label = this.messageKindLabel(latestSpecial.kind) || '新消息';
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
    }, 15000);
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

  private formatDateTime(value?: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}
