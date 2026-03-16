import { Component, OnInit, OnDestroy, signal, inject, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { ConversationService, ConversationItem } from '../core/services/conversation.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [DatePipe, AppBadgeComponent, AppButtonComponent, AppStateComponent],
  template: `
    <div class="conv-list">
      <app-button class="new-btn" variant="primary" size="sm" [stretch]="true" (click)="createNew()">
        + 新对话
      </app-button>

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
          <div class="conv-meta">
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
          title="暂无对话"
          description="从这里创建新对话，或切回主区继续当前会话。"
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
    .conv-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      padding-bottom: var(--space-2);
    }

    .new-btn {
      width: 100%;
      flex-shrink: 0;
    }

    .conv-item {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      cursor: pointer;
    }

    .conv-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-1);
    }

    .conv-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .conv-count {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      margin-left: var(--space-2);
      flex-shrink: 0;
    }

    .conv-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
  `],
})
export class ConversationListComponent implements OnInit, OnDestroy {
  private conversationService = inject(ConversationService);
  private router = inject(Router);
  private refreshSub?: Subscription;

  conversations = signal<ConversationItem[]>([]);
  loading = signal(false);
  summarizing = signal<string | null>(null);
  deleting = signal<string | null>(null);
  activeId = signal<string | null>(null);
  contextMenuConvId = signal<string | null>(null);
  contextMenuPos = signal({ x: 0, y: 0 });

  ngOnInit() {
    this.load();
    this.refreshSub = this.conversationService.refreshList$.subscribe(() => this.load());
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.conversationService.list().toPromise();
      this.conversations.set(list ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  async createNew() {
    const res = await this.conversationService.create().toPromise();
    if (res?.id) {
      await this.load();
      this.router.navigate(['/chat', res.id]);
    }
  }

  open(id: string) {
    this.activeId.set(id);
    this.router.navigate(['/chat', id]);
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
        this.router.navigate(['/chat']);
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
}
