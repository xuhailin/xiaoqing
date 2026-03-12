import { Component, OnInit, OnDestroy, signal, inject, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { ConversationService, ConversationItem } from '../core/services/conversation.service';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="conv-list">
      <button class="btn btn--primary btn--sm new-btn" (click)="createNew()">+ 新对话</button>

      @if (loading()) {
        <div class="loading">加载中...</div>
      }

      @for (c of conversations(); track c.id) {
        <div class="conv-item" [class.active]="c.id === activeId()"
          (click)="open(c.id)"
          (contextmenu)="onContextMenu($event, c.id)">
          <div class="conv-header">
            <span class="conv-title">{{ c.title || formatDate(c.createdAt) }}</span>
            <span class="conv-count">{{ c.messageCount }} 条</span>
          </div>
          <div class="conv-meta">
            @if (c.summarizedAt) {
              <span class="badge badge--done" [title]="'总结于 ' + (c.summarizedAt | date:'yyyy-MM-dd HH:mm')">已总结</span>
            } @else {
              <span class="badge badge--none">未总结</span>
            }
          </div>
        </div>
      }

      @if (!loading() && conversations().length === 0) {
        <div class="empty">暂无对话</div>
      }
    </div>

    @if (contextMenuConvId()) {
      <div class="context-menu" [style.left.px]="contextMenuPos().x" [style.top.px]="contextMenuPos().y"
        (click)="$event.stopPropagation()">
        <button class="context-menu-item" (click)="onResummarizeFromMenu()"
          [disabled]="summarizing() === contextMenuConvId()">
          {{ summarizing() === contextMenuConvId() ? '总结中...' : '重新总结' }}
        </button>
        <button class="context-menu-item context-menu-item--danger" (click)="onDeleteFromMenu()"
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
    }

    .new-btn {
      width: 100%;
      flex-shrink: 0;
    }

    .conv-item {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      cursor: pointer;
      border: 1px solid transparent;
      transition: all var(--transition-fast);
    }

    .conv-item:hover {
      background: var(--color-primary-light, rgba(92, 103, 242, 0.06));
    }

    .conv-item.active {
      background: var(--color-surface);
      border-color: var(--color-primary);
      box-shadow: var(--shadow-sm);
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

    .badge {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: var(--radius-sm);
      font-weight: var(--font-weight-medium);
    }

    .badge--done {
      background: rgba(34, 197, 94, 0.12);
      color: #16a34a;
    }

    .badge--none {
      background: var(--color-bg);
      color: var(--color-text-secondary);
    }

    .context-menu {
      position: fixed;
      z-index: 1000;
      min-width: 120px;
      padding: var(--space-1);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
    }

    .context-menu-item {
      display: block;
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      font-size: var(--font-size-sm);
      font-family: var(--font-family);
      color: var(--color-text);
      text-align: left;
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .context-menu-item:hover:not(:disabled) {
      background: var(--color-bg);
    }

    .context-menu-item:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .context-menu-item--danger {
      color: var(--color-error);
    }

    .context-menu-item--danger:hover:not(:disabled) {
      background: var(--color-error-bg);
    }

    .loading, .empty {
      text-align: center;
      padding: var(--space-4);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
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
