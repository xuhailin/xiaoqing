import { Component, OnInit, OnDestroy, signal, inject, viewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ConversationService, Message, DebugMeta, TraceStep, WorldState } from '../core/services/conversation.service';
import { JsonPipe } from '@angular/common';
import { PersonaService, EvolutionChange } from '../core/services/persona.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [JsonPipe, AppBadgeComponent, AppButtonComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy {
  private conversation = inject(ConversationService);
  private personaService = inject(PersonaService);
  private route = inject(ActivatedRoute);
  private routeSub?: Subscription;

  private inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('inputEl');

  conversationId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  inputText = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  injectedMemories = signal<Array<{ id: string; type: string; content: string }>>([]);
  worldState = signal<WorldState | null>(null);
  debugMeta = signal<DebugMeta | null>(null);
  showDebugPanel = signal(false);
  openclawUsed = signal(false);

  // ── Trace ──────────────────────────────────────────────
  traceSteps = signal<TraceStep[]>([]);
  showTraceDetail = signal(false);

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
    // 切换对话时重置所有通知/状态
    this.evolveResult.set(null);
    this.evolveSuggestion.set(null);
    this.injectedMemories.set([]);
    this.worldState.set(null);
    this.debugMeta.set(null);
    this.traceSteps.set([]);
    this.showDebugPanel.set(false);
    this.showTraceDetail.set(false);
    await this.loadMessages(id);
    await this.fetchWorldState(id);
    this.checkPendingEvolution();
  }

  private async loadCurrent() {
    this.error.set(null);
    try {
      const res = await this.conversation.getOrCreateCurrent().toPromise();
      if (res?.id) {
        this.conversationId.set(res.id);
        await this.loadMessages(res.id);
        await this.fetchWorldState(res.id);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : '获取会话失败');
    }
  }

  private async loadMessages(cid: string) {
    try {
      const list = await this.conversation.getMessages(cid).toPromise();
      this.messages.set(list ?? []);
    } catch {
      this.messages.set([]);
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
        this.messages.update((m) => [
          ...m,
          res.userMessage,
          res.assistantMessage,
        ]);
        this.inputText.set('');
        const el = this.inputEl();
        if (el) el.nativeElement.value = '';
        if (res.injectedMemories) {
          this.injectedMemories.set(res.injectedMemories);
        }
        this.debugMeta.set(res.debugMeta ?? null);
        this.openclawUsed.set(!!res.openclawUsed);
        this.traceSteps.set(res.trace ?? []);
        this.showTraceDetail.set(false);
        this.conversation.notifyListRefresh();
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

  toggleDebugPanel() {
    this.showDebugPanel.update((v) => !v);
  }

  toggleTraceDetail() {
    this.showTraceDetail.update((v) => !v);
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
}
