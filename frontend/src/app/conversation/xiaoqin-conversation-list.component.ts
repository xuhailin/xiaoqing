import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CollaborationThreadItem,
  ConversationItem,
  ConversationService,
  EntryAgentId,
  Message,
  MessageKind,
} from '../core/services/conversation.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent, type AppIconName } from '../shared/ui/app-icon.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

@Component({
  selector: 'app-xiaoqin-conversation-list',
  standalone: true,
  imports: [DatePipe, AppBadgeComponent, AppButtonComponent, AppIconComponent, AppStateComponent],
  template: `
    <div class="conv-list ui-scrollbar">
      <app-button class="new-btn" variant="primary" size="sm" [stretch]="true" (click)="createNew()">
        <app-icon name="plus" size="0.9rem" />
        <span>和小勤新开一段</span>
      </app-button>

      <section class="conv-section conv-section--collaboration">
        <div class="conv-section__header">
          <div class="conv-section__title">转给小晴的协作记录</div>
          <div class="conv-section__desc">小勤转达给小晴的后台线程会收在这里。</div>
        </div>

        @if (!loading() && collaborationThreads().length === 0) {
          <app-state
            [compact]="true"
            title="还没有协作记录"
            description="当小勤把消息转给小晴时，这里会自动出现可回看的线程。"
          />
        }

        @for (thread of collaborationThreads(); track thread.id) {
          <div class="conv-item conv-item--collaboration ui-list-card" [class.is-active]="thread.id === activeId()"
            (click)="openCollaborationThread(thread)"
            (contextmenu)="onContextMenu($event, thread.id)">
            <div class="conv-header">
              <span class="conv-title">{{ collaborationTitle(thread) }}</span>
              <span class="conv-count">{{ thread.messageCount }} 条</span>
            </div>
            @if (thread.latestMessage) {
              <div class="conv-preview">
                <span class="conv-preview-icon">
                  <app-icon [name]="kindIcon(thread.latestMessage.kind)" size="0.9rem" />
                </span>
                <span class="conv-preview-text">{{ previewText(thread.latestMessage) }}</span>
              </div>
            }
            <div class="conv-meta">
              <app-badge tone="info" appearance="outline">协作</app-badge>
              <app-badge tone="neutral" appearance="outline">
                {{ entryAgentLabel(thread.requesterAgentId || 'xiaoqin') }} -> 小晴
              </app-badge>
              @if (thread.latestMessage && isSpecialKind(thread.latestMessage.kind)) {
                <app-badge [tone]="kindTone(thread.latestMessage.kind)" appearance="outline">
                  {{ kindLabel(thread.latestMessage.kind) }}
                </app-badge>
              }
            </div>
          </div>
        }
      </section>

      @if (loading()) {
        <app-state [compact]="true" kind="loading" title="加载中..." />
      }

      @for (c of conversations(); track c.id) {
        <div class="conv-item ui-list-card" [class.is-active]="c.id === activeId()"
          (click)="open(c.id)"
          (contextmenu)="onContextMenu($event, c.id)">
          <div class="conv-header">
            <span class="conv-title">{{ c.title || formatDate(c.createdAt) }}</span>
            <span class="conv-count">{{ c.messageCount }} 条</span>
          </div>
          @if (c.latestMessage) {
            <div class="conv-preview">
              <span class="conv-preview-icon">
                <app-icon [name]="kindIcon(c.latestMessage.kind)" size="0.9rem" />
              </span>
              <span class="conv-preview-text">{{ previewText(c.latestMessage) }}</span>
            </div>
          }
          <div class="conv-meta">
            <app-badge [tone]="entryAgentTone(c.entryAgentId)" appearance="outline">
              {{ entryAgentLabel(c.entryAgentId) }}
            </app-badge>
            @if (c.activeReminderCount > 0) {
              <app-badge tone="warning">
                <app-icon name="bell" size="0.8rem" />
                <span>{{ c.activeReminderCount }} 个提醒</span>
              </app-badge>
            }
            @if (c.latestMessage && isSpecialKind(c.latestMessage.kind)) {
              <app-badge [tone]="kindTone(c.latestMessage.kind)" appearance="outline">
                {{ kindLabel(c.latestMessage.kind) }}
              </app-badge>
            }
            @if (c.summarizedAt) {
              <app-badge tone="success" [title]="'总结于 ' + (c.summarizedAt | date:'yyyy-MM-dd HH:mm')">
                已总结
              </app-badge>
            } @else {
              <app-badge tone="neutral" appearance="outline">未总结</app-badge>
            }
          </div>
        </div>
      }

      @if (!loading() && conversations().length === 0) {
        <app-state
          [compact]="true"
          title="暂无和小勤的前台对话"
          description="这里单独只展示小勤前台会话；协作线程放在上面单独看。"
        />
      }
    </div>

    @if (contextMenuConvId()) {
      <div class="context-menu ui-context-menu" [style.left.px]="contextMenuPos().x" [style.top.px]="contextMenuPos().y"
        (click)="$event.stopPropagation()">
        <button class="context-menu-item ui-context-menu__item" (click)="onResummarizeFromMenu()"
          [disabled]="summarizing() === contextMenuConvId()">
          {{ summarizing() === contextMenuConvId() ? '总结中...' : '重新总结' }}
        </button>
        <button class="context-menu-item ui-context-menu__item ui-context-menu__item--danger" (click)="onDeleteFromMenu()"
          [disabled]="deleting() === contextMenuConvId()">
          {{ deleting() === contextMenuConvId() ? '删除中...' : '删除' }}
        </button>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
    }

    .conv-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      overflow-y: scroll;
      overflow-x: hidden;
      scrollbar-gutter: stable;
      scrollbar-width: thin;
      scrollbar-color: var(--color-border-strong, var(--color-border)) transparent;
      flex: 1;
      min-height: 0;
      padding: 0 var(--space-1) var(--space-1);
      background: transparent;
    }

    .conv-list::-webkit-scrollbar {
      width: 8px;
    }

    .conv-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .conv-list::-webkit-scrollbar-thumb {
      background: var(--color-border-strong, var(--color-border));
      border-radius: 999px;
    }

    .new-btn {
      width: 100%;
      flex-shrink: 0;
      margin: 0;
    }

    .conv-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .conv-section__header {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0 var(--space-1);
    }

    .conv-section__title {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      letter-spacing: 0.02em;
    }

    .conv-section__desc {
      font-size: var(--font-size-xxs);
      color: var(--color-text-muted);
      line-height: 1.5;
    }

    .conv-item {
      padding: var(--space-3);
      cursor: pointer;
      position: relative;
      overflow: hidden;
      border: 1px solid var(--conversation-card-border);
      border-radius: 18px;
      background: var(--conversation-card-bg);
      box-shadow: var(--conversation-card-shadow);
      backdrop-filter: blur(12px);
      min-height: max-content;
    }

    .conv-item::before {
      content: '';
      position: absolute;
      left: 0;
      top: var(--space-3);
      bottom: var(--space-3);
      width: 3px;
      border-radius: var(--radius-pill);
      background: transparent;
      transition: background var(--transition-fast);
    }

    .conv-item.is-active::before {
      background: var(--color-primary);
    }

    .conv-item.is-active {
      border-color: var(--conversation-card-active-border);
      background: var(--conversation-card-active-bg);
      box-shadow: var(--conversation-card-active-shadow);
    }

    .conv-item:hover {
      border-color: var(--conversation-card-hover-border);
      background: var(--conversation-card-hover-bg);
      box-shadow: var(--conversation-card-hover-shadow);
    }

    .conv-item--collaboration {
      border-style: dashed;
    }

    .conv-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .conv-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      flex: 1;
      min-width: 0;
      line-height: 1.5;
    }

    .conv-count {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      margin-left: var(--space-2);
      flex-shrink: 0;
    }

    .conv-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1);
    }

    .conv-preview {
      margin-bottom: var(--space-2);
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }

    .conv-preview-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 1rem;
      color: var(--color-text-muted);
    }

    .conv-preview-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
})
export class XiaoqinConversationListComponent implements OnInit, OnDestroy {
  private conversationService = inject(ConversationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private refreshSub?: Subscription;
  private routeSub?: Subscription;

  conversations = signal<ConversationItem[]>([]);
  collaborationThreads = signal<CollaborationThreadItem[]>([]);
  loading = signal(false);
  summarizing = signal<string | null>(null);
  deleting = signal<string | null>(null);
  activeId = signal<string | null>(null);
  contextMenuConvId = signal<string | null>(null);
  contextMenuPos = signal({ x: 0, y: 0 });

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      this.activeId.set(params.get('id'));
      void this.load();
    });
    this.refreshSub = this.conversationService.refreshList$.subscribe(() => void this.load());
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.refreshSub?.unsubscribe();
  }

  async load() {
    this.loading.set(true);
    try {
      const [list, collaborationThreads] = await Promise.all([
        this.conversationService.list().toPromise(),
        this.conversationService.getCollaborationThreads('xiaoqin').toPromise(),
      ]);
      this.conversations.set((list ?? []).filter((item) => item.entryAgentId === 'xiaoqin'));
      this.collaborationThreads.set(collaborationThreads ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  async createNew() {
    const res = await this.conversationService.create('xiaoqin').toPromise();
    if (res?.id) {
      await this.load();
      this.router.navigate(['/chat', res.id], { queryParams: { entryAgentId: 'xiaoqin' } });
    }
  }

  open(id: string) {
    this.activeId.set(id);
    this.router.navigate(['/chat', id], { queryParams: { entryAgentId: 'xiaoqin' } });
  }

  openCollaborationThread(thread: CollaborationThreadItem) {
    this.activeId.set(thread.id);
    this.router.navigate(['/chat', thread.id], { queryParams: { entryAgentId: 'xiaoqin' } });
  }

  @HostListener('document:click') closeContextMenuOnClick() {
    this.contextMenuConvId.set(null);
  }

  onContextMenu(event: MouseEvent, id: string) {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuPos.set({ x: event.clientX, y: event.clientY });
    this.contextMenuConvId.set(id);
  }

  async onResummarizeFromMenu() {
    const id = this.contextMenuConvId();
    if (!id) return;
    this.contextMenuConvId.set(null);
    if (!confirm('确定要重新总结该对话？将根据当前消息重新生成总结与记忆。')) return;
    await this.resummarize(id);
  }

  async onDeleteFromMenu() {
    const id = this.contextMenuConvId();
    if (!id) return;
    this.contextMenuConvId.set(null);
    if (!confirm('确定删除该对话？关联的记忆也会一并删除，不可恢复。')) return;
    await this.deleteConv(id);
  }

  async resummarize(id: string, event?: Event) {
    if (event) event.stopPropagation();
    this.summarizing.set(id);
    try {
      await this.conversationService.summarize(id).toPromise();
      this.conversationService.notifyListRefresh();
      await this.load();
    } finally {
      this.summarizing.set(null);
    }
  }

  async deleteConv(id: string, event?: Event) {
    if (event) event.stopPropagation();
    this.deleting.set(id);
    try {
      await this.conversationService.delete(id).toPromise();
      if (this.activeId() === id) {
        this.activeId.set(null);
        this.router.navigate(['/chat'], { queryParams: { entryAgentId: 'xiaoqin' } });
      }
      await this.load();
    } finally {
      this.deleting.set(null);
    }
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  previewText(message: Message): string {
    const prefix = this.previewPrefix(message);
    const content = message.metadata?.summary?.trim()
      || message.metadata?.inboundSummary?.trim()
      || message.metadata?.inboundUserInput?.trim()
      || message.content.trim();
    return `${prefix}${content}`.slice(0, 46) + (`${prefix}${content}`.length > 46 ? '…' : '');
  }

  kindIcon(kind: MessageKind): AppIconName {
    if (kind === 'agent_receipt') return 'route';
    if (kind === 'agent_result') return 'sparkles';
    if (kind === 'reminder_triggered' || kind === 'reminder_created' || kind === 'reminder_list' || kind === 'reminder_cancelled') {
      return 'bell';
    }
    if (kind === 'tool') return 'tool';
    if (kind === 'system') return 'info';
    if (kind === 'daily_moment') return 'sparkles';
    return 'message';
  }

  kindLabel(kind: MessageKind): string {
    if (kind === 'agent_receipt') return '代理回执';
    if (kind === 'agent_result') return '代理结果';
    if (kind === 'reminder_triggered') return '到点提醒';
    if (kind === 'reminder_created') return '提醒已设';
    if (kind === 'reminder_list') return '提醒列表';
    if (kind === 'reminder_cancelled') return '提醒已取消';
    if (kind === 'tool') return '工具';
    if (kind === 'system') return '系统';
    if (kind === 'daily_moment') return '今日日记';
    return '对话';
  }

  kindTone(kind: MessageKind): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (kind === 'agent_receipt') return 'info';
    if (kind === 'agent_result') return 'success';
    if (kind === 'reminder_triggered' || kind === 'reminder_created' || kind === 'reminder_list' || kind === 'reminder_cancelled') {
      return 'warning';
    }
    if (kind === 'tool' || kind === 'daily_moment') return 'info';
    if (kind === 'system') return 'neutral';
    return 'neutral';
  }

  isSpecialKind(kind: MessageKind): boolean {
    return kind !== 'user' && kind !== 'chat';
  }

  entryAgentLabel(entryAgentId: EntryAgentId): string {
    return entryAgentId === 'xiaoqin' ? '小勤' : '小晴';
  }

  entryAgentTone(entryAgentId: EntryAgentId): 'neutral' | 'info' {
    return entryAgentId === 'xiaoqin' ? 'info' : 'neutral';
  }

  collaborationTitle(thread: CollaborationThreadItem): string {
    const latest = thread.latestMessage;
    const summary = latest?.metadata?.summary?.trim()
      || latest?.metadata?.inboundSummary?.trim()
      || latest?.metadata?.inboundUserInput?.trim();
    return summary || '来自小勤的协作线程';
  }

  private previewPrefix(message: Message): string {
    if (message.metadata?.inboundAgentBus) {
      return `${this.entryAgentLabel(message.metadata.requesterAgentId ?? 'xiaoqin')}：`;
    }
    return message.role === 'user' ? '我：' : '';
  }
}
