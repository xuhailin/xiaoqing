import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IdeaApiService, type IdeaRecord } from '../core/services/idea.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { WorkspaceArrivalNoticeComponent } from '../shared/ui/workspace-arrival-notice.component';
import {
  WorkspaceRelationSummaryComponent,
  type WorkspaceRelationSummaryItem,
} from '../shared/ui/workspace-relation-summary.component';
import { ideaStatusLabel, ideaStatusTone, todoStatusLabel, todoStatusTone } from '../shared/workbench-status.utils';

@Component({
  selector: 'app-workspace-idea',
  standalone: true,
  imports: [
    FormsModule,
    AppBadgeComponent,
    AppButtonComponent,
    AppPanelComponent,
    AppStateComponent,
    WorkspaceArrivalNoticeComponent,
    WorkspaceRelationSummaryComponent,
  ],
  template: `
    <div class="workspace-page">
      <app-workspace-arrival-notice [text]="arrivalNotice()" />
      <div class="workspace-grid">
        <app-panel variant="workbench" class="workspace-card">
          <div class="card-header">记录想法</div>

          <label class="field">
            <span>标题</span>
            <input class="ui-input" [ngModel]="title()" (ngModelChange)="title.set($event)" placeholder="例如：以后可以做个关系地图" />
          </label>

          <label class="field">
            <span>内容</span>
            <textarea class="ui-textarea" rows="8" [ngModel]="content()" (ngModelChange)="content.set($event)" placeholder="把想法、灵感或暂时不执行的计划先记下来"></textarea>
          </label>

          <div class="form-actions">
            <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createIdea()">
              {{ saving() ? '记录中...' : '记下来' }}
            </app-button>
            @if (notice()) {
              <span class="notice">{{ notice() }}</span>
            }
          </div>
        </app-panel>

        <app-panel variant="workbench" class="workspace-card">
          <div class="card-header">
            <span>想法列表</span>
            <app-badge tone="info">{{ visibleIdeas().length }}</app-badge>
          </div>

          <div class="filter-row">
            <select class="ui-select ui-select--compact" [ngModel]="statusFilter()" (ngModelChange)="setStatusFilter($event)">
              <option value="open">进行中</option>
              <option value="promoted">已转待办</option>
              <option value="archived">已归档</option>
              <option value="all">全部</option>
            </select>
          </div>

          @if (loading()) {
            <app-state [compact]="true" kind="loading" title="想法加载中..." />
          } @else if (!visibleIdeas().length) {
            <app-state [compact]="true" title="当前筛选下还没有可显示的想法" [description]="emptyStateDescription()" />
          } @else {
            <div class="item-list">
              @for (idea of visibleIdeas(); track idea.id) {
                <div class="ui-list-card item-card" [class.is-active]="selectedIdeaId() === idea.id" [attr.data-idea-id]="idea.id">
                  <div class="item-main">
                    <div class="item-title">{{ idea.title || firstLine(idea.content) }}</div>
                    <div class="item-content">{{ idea.content }}</div>
                    <div class="item-meta">
                      <app-badge [tone]="statusTone(idea.status)">{{ statusLabel(idea.status) }}</app-badge>
                      <span>{{ formatDateTime(idea.updatedAt) }}</span>
                    </div>
                    <app-workspace-relation-summary
                      [items]="ideaRelationItems(idea)"
                      (action)="handleRelationAction($event, idea)"
                    />
                  </div>

                  <div class="item-actions">
                    @if (idea.status === 'open') {
                      <app-button variant="secondary" size="xs" (click)="promote(idea)">转待办</app-button>
                      <app-button variant="ghost" size="xs" (click)="archive(idea.id)">归档</app-button>
                    }
                    @if (idea.promotedTodoId) {
                      <app-button variant="ghost" size="xs" (click)="openTodo(idea.promotedTodoId)">去待办</app-button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </app-panel>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .workspace-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
      min-height: 100%;
    }

    .workspace-grid {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      min-height: 0;
    }

    .workspace-card {
      gap: var(--space-3);
      min-height: 0;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .form-actions,
    .filter-row,
    .item-actions {
      display: flex;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .notice {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .item-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
      overflow: auto;
    }

    .item-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--workbench-card-padding);
    }

    .item-card.is-active {
      border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
      background: color-mix(in srgb, var(--color-surface-highlight) 65%, transparent);
      box-shadow: 0 12px 24px rgba(79, 109, 245, 0.08);
    }

    @media (prefers-reduced-motion: no-preference) {
      .item-card.is-active {
        animation: workbenchArrivalPulse 700ms ease-out;
      }
    }

    .item-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .item-content {
      margin-top: var(--space-2);
      font-size: var(--font-size-sm);
      line-height: 1.6;
      color: var(--color-text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: var(--space-2) 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .ui-select--compact {
      min-width: 120px;
    }

    @media (max-width: 980px) {
      .workspace-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .workspace-grid {
        grid-template-columns: 1fr;
      }
    }

    @keyframes workbenchArrivalPulse {
      0% {
        box-shadow: 0 0 0 rgba(79, 109, 245, 0);
      }
      35% {
        box-shadow: 0 0 0 6px rgba(79, 109, 245, 0.12);
      }
      100% {
        box-shadow: 0 12px 24px rgba(79, 109, 245, 0.08);
      }
    }
  `],
})
export class WorkspaceIdeaComponent implements OnInit, OnDestroy {
  private readonly ideasApi = inject(IdeaApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private querySub?: { unsubscribe(): void };
  private arrivalNoticeTimer: number | null = null;

  readonly ideas = signal<IdeaRecord[]>([]);
  readonly selectedIdeaId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly notice = signal<string | null>(null);
  readonly arrivalNotice = signal<string | null>(null);

  readonly title = signal('');
  readonly content = signal('');
  readonly statusFilter = signal<'all' | 'open' | 'promoted' | 'archived'>('open');

  readonly visibleIdeas = computed(() => {
    const filter = this.statusFilter();
    return this.ideas().filter((idea) => filter === 'all' || idea.status === filter);
  });

  async ngOnInit() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const ideaId = params.get('ideaId');
      this.selectedIdeaId.set(ideaId);
      this.syncSelectedIdea();
    });
    await this.load();
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    this.clearArrivalNotice();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.ideasApi.list());
      this.ideas.set(list ?? []);
      this.syncSelectedIdea();
      this.announceArrival();
    } finally {
      this.loading.set(false);
    }
  }

  async createIdea() {
    if (!this.title().trim() && !this.content().trim()) {
      this.notice.set('至少写一点标题或内容。');
      return;
    }

    this.saving.set(true);
    this.notice.set(null);
    try {
      await firstValueFrom(this.ideasApi.create({
        title: this.title().trim() || undefined,
        content: this.content().trim() || undefined,
      }));
      this.title.set('');
      this.content.set('');
      this.notice.set('想法已记下。');
      await this.load();
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : '记录失败');
    } finally {
      this.saving.set(false);
    }
  }

  async promote(idea: IdeaRecord) {
    await firstValueFrom(this.ideasApi.promote(idea.id, {}));
    await this.load();
  }

  async archive(id: string) {
    await firstValueFrom(this.ideasApi.update(id, { status: 'archived' }));
    await this.load();
  }

  setStatusFilter(value: string) {
    if (value === 'all' || value === 'open' || value === 'promoted' || value === 'archived') {
      this.statusFilter.set(value);
    }
  }

  statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    return ideaStatusTone(status);
  }

  statusLabel(status: string): string {
    return ideaStatusLabel(status);
  }

  firstLine(content: string) {
    return content.trim().split('\n')[0] || '未命名想法';
  }

  emptyStateDescription() {
    if (this.statusFilter() === 'promoted') {
      return '还没有已经转入待办的想法。';
    }
    if (this.statusFilter() === 'archived') {
      return '这里还没有归档内容。';
    }
    return '先把灵感记下来，后面再决定是否推进成待办。';
  }

  openTodo(todoId?: string | null) {
    if (!todoId) return;
    void this.router.navigate(['/workspace/todos'], {
      queryParams: { todoId },
    });
  }

  private syncSelectedIdea() {
    const selectedIdeaId = this.selectedIdeaId();
    if (!selectedIdeaId) return;
    const selectedIdea = this.ideas().find((idea) => idea.id === selectedIdeaId);
    if (!selectedIdea) return;
    this.scrollIntoView(`[data-idea-id="${selectedIdea.id}"]`);
    if (this.statusFilter() === 'all' || this.statusFilter() === selectedIdea.status) return;
    this.statusFilter.set(selectedIdea.status);
  }

  formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  ideaRelationItems(idea: IdeaRecord): WorkspaceRelationSummaryItem[] {
    if (!idea.promotedTodo) {
      return [];
    }
    return [{
      key: 'todo',
      label: '已转待办',
      title: idea.promotedTodo.title || idea.promotedTodo.id,
      detail: idea.promotedTodo.dueAt ? `截止：${this.formatDateTime(idea.promotedTodo.dueAt)}` : '已从想法区推进到待办区。',
      badge: todoStatusLabel(idea.promotedTodo.status),
      tone: todoStatusTone(idea.promotedTodo.status),
      actionLabel: '去待办',
      icon: 'check',
    }];
  }

  handleRelationAction(action: string, idea: IdeaRecord) {
    if (action === 'todo') {
      this.openTodo(idea.promotedTodoId);
    }
  }

  private announceArrival() {
    const selectedIdea = this.ideas().find((idea) => idea.id === this.selectedIdeaId());
    if (!selectedIdea) return;
    this.setArrivalNotice(`已定位到想法“${selectedIdea.title || this.firstLine(selectedIdea.content)}”。`);
  }

  private setArrivalNotice(text: string) {
    this.arrivalNotice.set(text);
    this.clearArrivalNotice();
    this.arrivalNoticeTimer = window.setTimeout(() => {
      this.arrivalNotice.set(null);
      this.arrivalNoticeTimer = null;
    }, 2800);
  }

  private clearArrivalNotice() {
    if (this.arrivalNoticeTimer !== null) {
      window.clearTimeout(this.arrivalNoticeTimer);
      this.arrivalNoticeTimer = null;
    }
  }

  private scrollIntoView(selector: string, delay = 40) {
    window.setTimeout(() => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return;
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, delay);
  }
}
