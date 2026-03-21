import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SystemOverviewService } from '../core/services/system-overview.service';
import { TodoApiService, type TodoRecord, type TodoStatus } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { WorkspaceArrivalNoticeComponent } from '../shared/ui/workspace-arrival-notice.component';
import {
  WorkspaceRelationSummaryComponent,
  type WorkspaceRelationSummaryItem,
} from '../shared/ui/workspace-relation-summary.component';
import { executionStatusLabel, executionStatusTone, ideaStatusLabel, ideaStatusTone, todoStatusLabel, todoStatusTone } from '../shared/workbench-status.utils';

@Component({
  selector: 'app-workspace-todo',
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
        <app-panel variant="workbench" class="workspace-card workspace-card--form">
          <div class="card-header">新增待办</div>

          <label class="field">
            <span>标题</span>
            <input class="ui-input" [ngModel]="title()" (ngModelChange)="title.set($event)" placeholder="例如：周五前整理回归测试问题" />
          </label>

          <label class="field">
            <span>说明</span>
            <textarea class="ui-textarea" rows="5" [ngModel]="description()" (ngModelChange)="description.set($event)" placeholder="补充背景或执行边界"></textarea>
          </label>

          <label class="field">
            <span>截止时间（可选）</span>
            <input class="ui-input" type="datetime-local" [ngModel]="dueAt()" (ngModelChange)="dueAt.set($event)" />
          </label>

          <div class="form-actions">
            <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createTodo()">
              {{ saving() ? '创建中...' : '创建待办' }}
            </app-button>
            @if (notice()) {
              <span class="notice">{{ notice() }}</span>
            }
          </div>
        </app-panel>

        <div class="workspace-stack">
          <app-panel variant="workbench" class="workspace-card workspace-card--list">
            <div class="card-header">
              <span>待办列表</span>
              <div class="card-toolbar">
                <select class="ui-select ui-select--compact" [ngModel]="statusFilter()" (ngModelChange)="setStatusFilter($event)">
                  <option value="open">进行中</option>
                  <option value="blocked">待补充</option>
                  <option value="done">已完成</option>
                  <option value="dropped">已放弃</option>
                  <option value="all">全部</option>
                </select>
                <app-badge tone="info">{{ visibleTodos().length }}</app-badge>
              </div>
            </div>

            @if (loading()) {
              <app-state [compact]="true" kind="loading" title="待办加载中..." />
            } @else if (!visibleTodos().length) {
              <app-state [compact]="true" title="当前筛选下还没有待办" [description]="emptyStateDescription()" />
            } @else {
              <div class="item-list">
                @for (todo of visibleTodos(); track todo.id) {
                  <div
                    class="ui-list-card item-card"
                    [class.is-active]="selectedTodoId() === todo.id"
                    [attr.data-todo-id]="todo.id"
                    (click)="selectedTodoId.set(todo.id)"
                  >
                    <div class="item-main">
                      <div class="item-title">{{ todo.title || todo.description || '未命名待办' }}</div>
                      <div class="item-meta">
                        <app-badge [tone]="statusTone(todo.status)">{{ statusLabel(todo.status) }}</app-badge>
                        @if (todo.dueAt) {
                          <span>截止：{{ formatDateTime(todo.dueAt) }}</span>
                        }
                        @if (todo.blockReason) {
                          <span>待补充：{{ todo.blockReason }}</span>
                        }
                      </div>
                      <app-workspace-relation-summary
                        [items]="todoRelationItems(todo)"
                        (action)="handleTodoRelationAction($event, todo)"
                      />
                    </div>

                    <div class="item-actions" (click)="$event.stopPropagation()">
                      @if (todo.status === 'open' || todo.status === 'blocked') {
                        <app-button variant="success" size="xs" (click)="setStatus(todo.id, 'done')">完成</app-button>
                        <app-button variant="ghost" size="xs" (click)="setStatus(todo.id, 'dropped')">放弃</app-button>
                        @if (todo.status === 'blocked') {
                          <app-button variant="ghost" size="xs" (click)="setStatus(todo.id, 'open')">继续处理</app-button>
                        }
                      } @else {
                        <app-button variant="ghost" size="xs" (click)="setStatus(todo.id, 'open')">恢复</app-button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </app-panel>

          <app-panel variant="workbench" class="workspace-card workspace-card--execution">
            <div class="card-header">执行入口</div>
            @if (selectedTodo(); as todo) {
              <div class="detail-block detail-block--hero">
                <div class="detail-title">{{ todo.title || todo.description || todo.id }}</div>
                <div class="detail-meta">
                  <app-badge [tone]="statusTone(todo.status)">{{ statusLabel(todo.status) }}</app-badge>
                  @if (todo.latestExecutionPlan) {
                    <app-badge tone="info" appearance="outline">{{ todo.latestExecutionPlan.dispatchType }}</app-badge>
                  }
                  @if (todo.latestTask) {
                    <span>最近执行：{{ formatDateTime(todo.latestTask.scheduledAt) }}</span>
                  }
                </div>
                <app-workspace-relation-summary
                  [title]="'关联关系'"
                  [items]="todoRelationItems(todo)"
                  (action)="handleTodoRelationAction($event, todo)"
                />
                @if (todo.blockReason) {
                  <div class="task-error">{{ todo.blockReason }}</div>
                }
              </div>

              <div class="field-row">
                <label class="field">
                  <span>能力</span>
                  <select class="ui-select" [ngModel]="capability()" (ngModelChange)="capability.set($event)">
                    <option value="">请选择能力</option>
                    @for (item of capabilityOptions(); track item) {
                      <option [value]="item">{{ item }}</option>
                    }
                  </select>
                </label>
              </div>

              <label class="field">
                <span>参数 JSON（可选）</span>
                <textarea class="ui-textarea" rows="4" [ngModel]="paramsJson()" (ngModelChange)="paramsJson.set($event)" placeholder='例如：{"city":"Shanghai"}'></textarea>
              </label>

              <div class="form-actions">
                <app-button variant="primary" size="sm" [disabled]="taskSaving()" (click)="createTask(todo)">
                  {{ taskSaving() ? '提交中...' : '送去执行' }}
                </app-button>
                @if (todo.latestExecutionPlan) {
                  <app-button variant="ghost" size="sm" (click)="openExecution(todo)">
                    看执行
                  </app-button>
                }
                @if (taskNotice()) {
                  <span class="notice">{{ taskNotice() }}</span>
                }
              </div>

              @if (todo.latestTask) {
                <div
                  class="task-card"
                  [class.task-card--highlight]="highlightedTaskId() === todo.latestTask.id"
                  [attr.data-task-id]="todo.latestTask.id"
                >
                  <div class="detail-meta">
                    <app-badge [tone]="executionTone(todo.latestTask.status)" appearance="outline">{{ executionLabel(todo.latestTask.status) }}</app-badge>
                    @if (todo.latestTask.action) {
                      <span>{{ todo.latestTask.action }}</span>
                    }
                    @if (todo.latestTask.resultRef) {
                      <span>{{ todo.latestTask.resultRef }}</span>
                    }
                  </div>
                  @if (todo.latestTask.errorSummary) {
                    <div class="task-error">{{ todo.latestTask.errorSummary }}</div>
                  }
                  @if (latestTaskSummary(todo); as taskSummary) {
                    <div class="task-summary">{{ taskSummary }}</div>
                  }
                  @if (todo.latestTask.action) {
                    <div class="detail-links">
                      <app-button variant="ghost" size="xs" [disabled]="taskSaving()" (click)="retryLatestTask(todo)">
                        {{ taskSaving() ? '重试中...' : '再次执行' }}
                      </app-button>
                    </div>
                  }
                  @if (todo.latestTask.resultPayload) {
                    <pre class="payload-block">{{ formatJson(todo.latestTask.resultPayload) }}</pre>
                  }
                </div>
              } @else {
                <app-state [compact]="true" title="还没有执行记录" description="这里会显示这条待办最近一次进入执行链后的结果。" />
              }
            } @else {
              <app-state [compact]="true" title="选择一条待办" description="右侧会显示它的关系摘要、执行入口和最近结果。" />
            }
          </app-panel>
        </div>
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
      background: var(--bg-page, var(--color-bg));
    }

    .workspace-grid {
      display: grid;
      grid-template-columns: minmax(320px, 400px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      min-height: 0;
    }

    .workspace-stack {
      display: grid;
      grid-template-rows: minmax(0, 1fr) minmax(280px, 360px);
      gap: var(--workbench-section-gap);
      min-height: 0;
    }

    .workspace-card {
      gap: var(--space-3);
      min-height: 0;
    }

    .workspace-card--form,
    .workspace-card--list {
      box-shadow: var(--workbench-surface-shadow);
    }

    .workspace-card--execution {
      box-shadow:
        0 18px 34px rgba(79, 109, 245, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.5);
    }

    .card-header,
    .card-toolbar,
    .form-actions,
    .item-actions,
    .detail-meta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .card-header {
      justify-content: space-between;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .field,
    .field-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .field-row > .field {
      flex: 1 1 0;
      min-width: 0;
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
      padding-right: var(--space-1);
    }

    .item-card {
      width: 100%;
      padding: var(--workbench-card-padding);
      text-align: left;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: var(--space-3);
      position: relative;
    }

    .item-card.is-active {
      border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border));
      box-shadow: var(--color-list-card-active-shadow);
      background: color-mix(in srgb, var(--sidebar-card-background-active) 72%, transparent);
    }

    .item-card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 12px;
      bottom: 12px;
      width: 3px;
      border-radius: var(--radius-pill);
      background: transparent;
      transition: background var(--transition-fast);
    }

    .item-card:hover::before,
    .item-card.is-active::before {
      background: var(--color-primary);
    }

    .item-title,
    .detail-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: var(--space-2) 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    .item-main {
      min-width: 0;
    }

    .task-card,
    .detail-block {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .detail-block--hero {
      padding: var(--workbench-card-padding);
      border: 1px solid var(--color-surface-highlight-border);
      border-radius: var(--workbench-card-radius);
      background:
        linear-gradient(180deg, rgba(79, 109, 245, 0.04), rgba(79, 109, 245, 0.015)),
        var(--workbench-surface-gradient-soft);
      box-shadow: var(--color-surface-highlight-shadow);
    }

    .task-card--highlight {
      border-radius: var(--workbench-card-radius);
      padding: var(--workbench-card-padding);
      background:
        linear-gradient(180deg, rgba(79, 109, 245, 0.045), rgba(79, 109, 245, 0.015)),
        var(--color-surface-highlight);
      border: 1px solid var(--color-surface-highlight-border);
      box-shadow: var(--color-surface-highlight-shadow);
    }

    @media (prefers-reduced-motion: no-preference) {
      .item-card.is-active,
      .task-card--highlight {
        animation: workbenchArrivalPulse 700ms ease-out;
      }
    }

    .detail-links {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .task-error {
      font-size: var(--font-size-xs);
      color: var(--color-error);
    }

    .task-summary {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.6;
    }

    .payload-block {
      margin: var(--space-2) 0 0;
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-muted);
      color: var(--color-text-secondary);
      font-size: 11px;
      line-height: 1.5;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .ui-select--compact {
      min-width: 120px;
    }

    @media (prefers-reduced-motion: no-preference) {
      .item-card {
        transition:
          border-color var(--transition-fast),
          background var(--transition-fast),
          box-shadow var(--transition-fast),
          transform var(--transition-fast);
      }

      .item-card:hover {
        transform: translateY(-1px);
      }
    }

    @media (max-width: 980px) {
      .workspace-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .workspace-grid {
        grid-template-columns: 1fr;
      }

      .workspace-stack {
        grid-template-rows: auto auto;
      }

      .item-card {
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
        box-shadow: var(--color-surface-highlight-shadow);
      }
    }
  `],
})
export class WorkspaceTodoComponent implements OnInit, OnDestroy {
  private readonly todoApi = inject(TodoApiService);
  private readonly systemOverview = inject(SystemOverviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private querySub?: { unsubscribe(): void };
  private arrivalNoticeTimer: number | null = null;

  readonly todos = signal<TodoRecord[]>([]);
  readonly selectedTodoId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly taskSaving = signal(false);
  readonly highlightedTaskId = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly taskNotice = signal<string | null>(null);
  readonly arrivalNotice = signal<string | null>(null);

  readonly title = signal('');
  readonly description = signal('');
  readonly dueAt = signal('');
  readonly statusFilter = signal<'all' | TodoStatus>('open');
  readonly capability = signal('');
  readonly paramsJson = signal('');
  readonly capabilityOptions = signal<string[]>([]);

  readonly visibleTodos = computed(() => {
    const filter = this.statusFilter();
    return this.todos().filter((todo) => filter === 'all' || todo.status === filter);
  });
  readonly selectedTodo = computed(() =>
    this.visibleTodos().find((todo) => todo.id === this.selectedTodoId())
    ?? this.todos().find((todo) => todo.id === this.selectedTodoId())
    ?? null,
  );

  async ngOnInit() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const todoId = params.get('todoId');
      this.selectedTodoId.set(todoId);
      this.highlightedTaskId.set(null);
      this.syncSelectedTodo();
    });
    await Promise.all([this.load(), this.loadCapabilities()]);
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    this.clearArrivalNotice();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.todoApi.list());
      this.todos.set(list ?? []);
      const selectedTodoId = this.selectedTodoId();
      if (selectedTodoId && !this.todos().some((todo) => todo.id === selectedTodoId)) {
        this.selectedTodoId.set(null);
        this.highlightedTaskId.set(null);
      } else {
        this.syncSelectedTodo();
        this.announceArrival();
      }
    } finally {
      this.loading.set(false);
    }
  }

  async createTodo() {
    if (!this.title().trim() && !this.description().trim()) {
      this.notice.set('至少写一点标题或说明。');
      return;
    }

    this.saving.set(true);
    this.notice.set(null);
    try {
      const created = await firstValueFrom(this.todoApi.create({
        title: this.title().trim() || undefined,
        description: this.description().trim() || undefined,
        dueAt: this.dueAt() || undefined,
      }));
      this.title.set('');
      this.description.set('');
      this.dueAt.set('');
      this.notice.set('待办已创建。');
      await this.load();
      if (created?.id) {
        this.selectedTodoId.set(created.id);
      }
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : '创建失败');
    } finally {
      this.saving.set(false);
    }
  }

  async setStatus(id: string, status: TodoStatus) {
    await firstValueFrom(this.todoApi.update(id, { status }));
    await this.load();
  }

  async createTask(todo: TodoRecord) {
    const capability = this.capability().trim();
    if (!capability) {
      this.taskNotice.set('请选择一个能力。');
      return;
    }

    const params = this.parseParams();
    if (!params) {
      return;
    }

    this.taskSaving.set(true);
    this.taskNotice.set(null);
    try {
      const res = await firstValueFrom(this.todoApi.createTask(todo.id, { capability, params }));
      this.paramsJson.set('');
      this.taskNotice.set('已送入执行队列。');
      this.highlightedTaskId.set(res?.todo?.latestTask?.id ?? null);
      await this.load();
    } catch (error) {
      this.taskNotice.set(error instanceof Error ? error.message : '提交执行失败');
    } finally {
      this.taskSaving.set(false);
    }
  }

  async retryLatestTask(todo: TodoRecord) {
    const latestTask = todo.latestTask;
    if (!latestTask?.action) {
      this.taskNotice.set('当前没有可重试的执行能力。');
      return;
    }

    this.taskSaving.set(true);
    this.taskNotice.set(null);
    try {
      const res = await firstValueFrom(this.todoApi.createTask(todo.id, {
        capability: latestTask.action,
        params: latestTask.params ?? {},
      }));
      this.taskNotice.set('已重新送入执行队列。');
      this.highlightedTaskId.set(res?.todo?.latestTask?.id ?? null);
      await this.load();
    } catch (error) {
      this.taskNotice.set(error instanceof Error ? error.message : '重试执行失败');
    } finally {
      this.taskSaving.set(false);
    }
  }

  setStatusFilter(value: string) {
    if (value === 'all' || value === 'open' || value === 'blocked' || value === 'done' || value === 'dropped') {
      this.statusFilter.set(value);
    }
  }

  statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    return todoStatusTone(status);
  }

  statusLabel(status: string): string {
    return todoStatusLabel(status);
  }

  executionTone(status: string) {
    return executionStatusTone(status);
  }

  executionLabel(status: string) {
    return executionStatusLabel(status);
  }

  formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  formatJson(value: unknown) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  latestTaskSummary(todo: TodoRecord): string | null {
    const latestTask = todo.latestTask;
    if (!latestTask) return null;
    if (latestTask.errorSummary) return latestTask.errorSummary;
    if (latestTask.status === 'pending') return '等待执行中。';
    return this.readString(latestTask.resultRef)
      ?? this.readString(latestTask.resultPayload?.['summary'])
      ?? '最近一次执行已完成。';
  }

  emptyStateDescription(): string {
    if (this.statusFilter() === 'blocked') {
      return '当前没有待补充信息的待办。';
    }
    if (this.statusFilter() === 'done') {
      return '当前还没有已完成的待办。';
    }
    if (this.statusFilter() === 'dropped') {
      return '当前还没有已放弃的待办。';
    }
    return '左侧可以先记下一条需要继续推进的事项。';
  }

  todoRelationItems(todo: TodoRecord): WorkspaceRelationSummaryItem[] {
    const items: WorkspaceRelationSummaryItem[] = [];
    if (todo.sourceIdea) {
      items.push({
        key: 'idea',
        label: '来自想法',
        title: todo.sourceIdea.title || todo.sourceIdea.id,
        detail: todo.sourceIdea.status === 'promoted' ? '对应想法已经推进成待办。' : '这条待办是从想法区继续推进出来的。',
        badge: ideaStatusLabel(todo.sourceIdea.status),
        tone: ideaStatusTone(todo.sourceIdea.status),
        actionLabel: '去想法',
        icon: 'sparkles',
      });
    }
    if (todo.latestExecutionPlan) {
      items.push({
        key: 'execution',
        label: '最近执行',
        title: todo.latestExecutionPlan.title || todo.latestExecutionPlan.id,
        detail: todo.latestTask?.errorSummary
          ? `失败原因：${todo.latestTask.errorSummary}`
          : todo.latestTask
            ? `状态：${this.executionLabel(todo.latestTask.status)}`
            : '已经创建执行入口，等待后续结果。',
        meta: todo.latestTask?.scheduledAt ? `触发时间：${this.formatDateTime(todo.latestTask.scheduledAt)}` : null,
        badge: this.executionLabel(todo.latestTask?.status || todo.latestExecutionPlan.status),
        tone: this.executionTone(todo.latestTask?.status || todo.latestExecutionPlan.status),
        actionLabel: '看执行',
        icon: 'route',
      });
    }
    return items;
  }

  openExecution(todo: TodoRecord) {
    const planId = todo.latestExecutionPlan?.id;
    if (!planId) return;
    void this.router.navigate(['/workspace/execution'], {
      queryParams: {
        planId,
        todoId: todo.id,
        taskId: todo.latestTask?.id ?? undefined,
      },
    });
  }

  openIdea(ideaId?: string | null) {
    if (!ideaId) return;
    void this.router.navigate(['/workspace/ideas'], {
      queryParams: { ideaId },
    });
  }

  handleTodoRelationAction(action: string, todo: TodoRecord) {
    if (action === 'idea') {
      this.openIdea(todo.sourceIdea?.id);
      return;
    }
    if (action === 'execution') {
      this.openExecution(todo);
    }
  }

  private async loadCapabilities() {
    try {
      const systemSelf = await firstValueFrom(this.systemOverview.getSystemSelf());
      const options = (systemSelf?.capabilities ?? [])
        .map((item) => item.name)
        .filter((item): item is string => !!item)
        .sort((a, b) => a.localeCompare(b));
      this.capabilityOptions.set(options);
    } catch {
      this.capabilityOptions.set([]);
    }
  }

  private parseParams(): Record<string, unknown> | null {
    const raw = this.paramsJson().trim();
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        this.taskNotice.set('参数需要是 JSON 对象。');
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      this.taskNotice.set('参数 JSON 解析失败。');
      return null;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private syncSelectedTodo() {
    const selectedTodoId = this.selectedTodoId();
    if (!selectedTodoId) return;
    const selectedTodo = this.todos().find((todo) => todo.id === selectedTodoId);
    if (!selectedTodo) return;
    this.highlightedTaskId.set(selectedTodo.latestTask?.id ?? null);
    if (this.statusFilter() === 'all' || this.statusFilter() === selectedTodo.status) return;
    this.statusFilter.set(selectedTodo.status);
    this.scrollIntoView(`[data-todo-id="${selectedTodo.id}"]`);
    if (selectedTodo.latestTask?.id) {
      this.scrollIntoView(`[data-task-id="${selectedTodo.latestTask.id}"]`, 160);
    }
  }

  private announceArrival() {
    const selectedTodo = this.selectedTodo();
    if (!selectedTodo) return;
    const taskSummary = selectedTodo.latestTask ? '最近执行结果已前置显示。' : '这条待办当前还没有执行记录。';
    this.setArrivalNotice(`已定位到待办“${selectedTodo.title || selectedTodo.description || selectedTodo.id}”。${taskSummary}`);
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
