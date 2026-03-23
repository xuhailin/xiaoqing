import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlanApiService, type TaskOccurrenceRecord } from '../core/services/plan.service';
import { SystemOverviewService } from '../core/services/system-overview.service';
import { TodoApiService, type TodoRecord, type TodoStatus } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { WorkspaceArrivalNoticeComponent } from '../shared/ui/workspace-arrival-notice.component';
import {
  WorkspaceRelationSummaryComponent,
  type WorkspaceRelationSummaryItem,
} from '../shared/ui/workspace-relation-summary.component';
import {
  executionStatusLabel,
  executionStatusTone,
  ideaStatusLabel,
  ideaStatusTone,
  todoStatusLabel,
  todoStatusTone,
  type UiTone,
} from '../shared/workbench-status.utils';

interface TodoAiWorkProjection {
  todoId: string;
  planId: string | null;
  taskId: string | null;
  title: string;
  statusLabel: string;
  tone: UiTone;
  summary: string | null;
  whenText: string | null;
  actionLabel: string | null;
  sortKey: number;
}

@Component({
  selector: 'app-workspace-todo',
  standalone: true,
  imports: [
    FormsModule,
    AppBadgeComponent,
    AppButtonComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
    AppStateComponent,
    WorkspaceArrivalNoticeComponent,
    WorkspaceRelationSummaryComponent,
  ],
  template: `
    <div class="workspace-page">
      <app-workspace-arrival-notice [text]="arrivalNotice()" />
      <div class="workspace-grid">
        <app-panel variant="workbench" class="workspace-card workspace-card--form">
          <app-section-header class="workspace-section-header" title="新增事项" />

          <label class="field">
            <span>标题</span>
            <input
              class="ui-input"
              [ngModel]="title()"
              (ngModelChange)="title.set($event)"
              placeholder="例如：周五前整理回归测试问题"
            />
          </label>

          <label class="field">
            <span>说明</span>
            <textarea
              class="ui-textarea"
              rows="5"
              [ngModel]="description()"
              (ngModelChange)="description.set($event)"
              placeholder="补充背景或执行边界"
            ></textarea>
          </label>

          <label class="field">
            <span>截止时间（可选）</span>
            <input
              class="ui-input"
              type="datetime-local"
              [ngModel]="dueAt()"
              (ngModelChange)="dueAt.set($event)"
            />
          </label>

          <div class="form-actions">
            <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createTodo()">
              {{ saving() ? '创建中...' : '创建事项' }}
            </app-button>
            @if (notice()) {
              <span class="notice">{{ notice() }}</span>
            }
          </div>
        </app-panel>

        <div class="workspace-stack">
          <app-panel variant="workbench" class="workspace-card workspace-card--list">
            <app-section-header class="workspace-section-header" title="你的事项">
              <div actions class="card-toolbar">
                <select
                  class="ui-select ui-select--compact"
                  [ngModel]="statusFilter()"
                  (ngModelChange)="setStatusFilter($event)"
                >
                  <option value="open">进行中</option>
                  <option value="blocked">待补充</option>
                  <option value="done">已完成</option>
                  <option value="dropped">已放弃</option>
                  <option value="all">全部</option>
                </select>
                <app-badge tone="info">{{ visibleTodos().length }}</app-badge>
              </div>
            </app-section-header>
            <div class="section-note">
              这里保留你的事项与承诺本身。小晴是否接手、是否在执行、有没有结果，会在下面单独展示。
            </div>

            @if (loading()) {
              <app-state [compact]="true" kind="loading" title="事项加载中..." />
            } @else if (!visibleTodos().length) {
              <app-state
                [compact]="true"
                title="当前筛选下还没有事项"
                [description]="emptyStateDescription()"
              />
            } @else {
              <div class="item-list">
                @for (todo of visibleTodos(); track todo.id) {
                  <div
                    class="ui-list-card item-card"
                    [class.is-active]="selectedTodoId() === todo.id"
                    [attr.data-todo-id]="todo.id"
                    (click)="selectTodo(todo.id)"
                  >
                    <div class="item-main">
                      <div class="item-title">
                        {{ todo.title || todo.description || '未命名事项' }}
                      </div>
                      <div class="item-meta">
                        <app-badge [tone]="statusTone(todo.status)">{{
                          statusLabel(todo.status)
                        }}</app-badge>
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
                        <app-button variant="success" size="xs" (click)="setStatus(todo.id, 'done')"
                          >完成</app-button
                        >
                        <app-button
                          variant="ghost"
                          size="xs"
                          (click)="setStatus(todo.id, 'dropped')"
                          >放弃</app-button
                        >
                        @if (todo.status === 'blocked') {
                          <app-button variant="ghost" size="xs" (click)="setStatus(todo.id, 'open')"
                            >继续处理</app-button
                          >
                        }
                      } @else {
                        <app-button variant="ghost" size="xs" (click)="setStatus(todo.id, 'open')"
                          >恢复</app-button
                        >
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </app-panel>

          <app-panel variant="workbench" class="workspace-card workspace-card--ai-work">
            <app-section-header class="workspace-section-header" title="小晴承接">
              <app-badge actions tone="info">{{ aiWorkItems().length }}</app-badge>
            </app-section-header>
            <div class="section-note">
              这里展示小晴已经接手、正在执行或等待你补充信息的推进视图。它不是“待办列表”的另一个状态，而是另一层对象。
            </div>

            @if (!aiWorkItems().length) {
              <app-state
                [compact]="true"
                title="小晴还没有接手中的事项"
                description="当你把事项送进执行，或已有事项形成执行链路后，会出现在这里。"
              />
            } @else {
              <div class="item-list">
                @for (item of aiWorkItems(); track item.todoId) {
                  <div
                    class="ui-list-card item-card item-card--work"
                    [class.is-active]="selectedTodoId() === item.todoId"
                    [attr.data-ai-todo-id]="item.todoId"
                    (click)="selectTodo(item.todoId)"
                  >
                    <div class="item-main">
                      <div class="item-title">{{ item.title }}</div>
                      <div class="item-meta">
                        <app-badge [tone]="item.tone">{{ item.statusLabel }}</app-badge>
                        @if (item.actionLabel) {
                          <span>{{ item.actionLabel }}</span>
                        }
                        @if (item.whenText) {
                          <span>{{ item.whenText }}</span>
                        }
                      </div>
                      @if (item.summary) {
                        <div class="task-summary">{{ item.summary }}</div>
                      }
                    </div>

                    <div class="item-actions" (click)="$event.stopPropagation()">
                      @if (item.planId && todoById(item.todoId); as workTodo) {
                        <app-button variant="ghost" size="xs" (click)="openExecution(workTodo)"
                          >看流水</app-button
                        >
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </app-panel>

          <app-panel variant="workbench" class="workspace-card workspace-card--execution">
            <app-section-header class="workspace-section-header" title="事项详情" />
            @if (selectedTodo(); as todo) {
              <div class="detail-block detail-block--hero">
                <div class="detail-title">{{ todo.title || todo.description || todo.id }}</div>
                <div class="detail-meta">
                  <app-badge tone="neutral" appearance="outline">事项</app-badge>
                  <app-badge [tone]="statusTone(todo.status)">{{
                    statusLabel(todo.status)
                  }}</app-badge>
                  @if (selectedAiWorkItem(); as work) {
                    <app-badge [tone]="work.tone" appearance="outline"
                      >小晴 · {{ work.statusLabel }}</app-badge
                    >
                  }
                  @if (todo.dueAt) {
                    <span>截止：{{ formatDateTime(todo.dueAt) }}</span>
                  }
                  @if (todo.latestExecutionPlan) {
                    <span>执行链：{{ todo.latestExecutionPlan.dispatchType }}</span>
                  }
                </div>
                <app-workspace-relation-summary
                  [title]="'关联关系'"
                  [items]="todoRelationItems(todo)"
                  (action)="handleTodoRelationAction($event, todo)"
                />
                @if (todo.blockReason) {
                  <div class="task-error">当前卡点：{{ todo.blockReason }}</div>
                }
              </div>

              <div class="detail-section">
                <div class="detail-section-title">执行入口</div>
                <div class="section-note">
                  从这里把事项交给小晴处理。入口和结果共享同一个详情上下文，不再割裂。
                </div>

                <div class="field-row">
                  <label class="field">
                    <span>能力</span>
                    <select
                      class="ui-select"
                      [ngModel]="capability()"
                      (ngModelChange)="capability.set($event)"
                    >
                      <option value="">请选择能力</option>
                      @for (item of capabilityOptions(); track item) {
                        <option [value]="item">{{ item }}</option>
                      }
                    </select>
                  </label>
                </div>

                <label class="field">
                  <span>参数 JSON（可选）</span>
                  <textarea
                    class="ui-textarea"
                    rows="4"
                    [ngModel]="paramsJson()"
                    (ngModelChange)="paramsJson.set($event)"
                    placeholder='例如：{"city":"Shanghai"}'
                  ></textarea>
                </label>

                <div class="form-actions">
                  <app-button
                    variant="primary"
                    size="sm"
                    [disabled]="taskSaving()"
                    (click)="createTask(todo)"
                  >
                    {{ taskSaving() ? '提交中...' : '交给小晴' }}
                  </app-button>
                  @if (todo.latestExecutionPlan) {
                    <app-button variant="ghost" size="sm" (click)="openExecution(todo)">
                      看流水
                    </app-button>
                  }
                  @if (todo.latestTask?.action) {
                    <app-button
                      variant="ghost"
                      size="sm"
                      [disabled]="taskSaving()"
                      (click)="retryLatestTask(todo)"
                    >
                      {{ taskSaving() ? '重试中...' : '再次执行' }}
                    </app-button>
                  }
                  @if (taskNotice()) {
                    <span class="notice">{{ taskNotice() }}</span>
                  }
                </div>
              </div>

              <div class="detail-section">
                <div class="detail-section-title">最近结果</div>
                <div class="section-note">
                  这里展示这条事项最近的执行反馈。用户事项状态和执行状态不再混写在同一层里。
                </div>

                @if (selectedOccurrencesLoading()) {
                  <app-state [compact]="true" kind="loading" title="结果加载中..." />
                } @else if (selectedOccurrences().length) {
                  <div class="result-list">
                    @for (occurrence of selectedOccurrences(); track occurrence.id) {
                      <div
                        class="task-card"
                        [class.task-card--highlight]="highlightedTaskId() === occurrence.id"
                        [attr.data-task-id]="occurrence.id"
                      >
                        <div class="detail-meta">
                          <app-badge [tone]="occurrenceTone(occurrence)" appearance="outline">{{
                            occurrenceStatusLabel(occurrence)
                          }}</app-badge>
                          @if (occurrence.action) {
                            <span>{{ occurrence.action }}</span>
                          }
                          <span>{{ formatDateTime(occurrence.scheduledAt) }}</span>
                          @if (occurrence.resultRef) {
                            <span>{{ occurrence.resultRef }}</span>
                          }
                        </div>
                        @if (occurrenceSummary(occurrence); as summary) {
                          <div class="task-summary">{{ summary }}</div>
                        }
                        @if (occurrence.resultPayload) {
                          <pre class="payload-block">{{
                            formatJson(occurrence.resultPayload)
                          }}</pre>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <app-state
                    [compact]="true"
                    title="还没有执行结果"
                    description="把这条事项送进执行后，结果会显示在这里。"
                  />
                }
              </div>
            } @else {
              <app-state
                [compact]="true"
                title="选择一条事项"
                description="这里会显示它的关系摘要、执行入口和最近结果。"
              />
            }
          </app-panel>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
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
        grid-template-rows: minmax(0, 1fr) minmax(220px, 280px) minmax(320px, 1fr);
        gap: var(--workbench-section-gap);
        min-height: 0;
      }

      .workspace-card {
        gap: var(--space-4);
        min-height: 0;
      }

      .workspace-card--form,
      .workspace-card--list {
        box-shadow: var(--workbench-surface-shadow);
      }

      .workspace-section-header {
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--color-border-light);
      }

      .card-toolbar,
      .form-actions,
      .item-actions,
      .detail-meta {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
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

      .section-note {
        font-size: var(--font-size-xs);
        line-height: 1.6;
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
        border-color: var(--color-surface-highlight-border);
        box-shadow: var(--color-surface-highlight-shadow);
        background: var(--color-surface-highlight);
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

      .detail-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border-light);
      }

      .detail-section-title {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }

      .detail-block--hero {
        padding: var(--workbench-card-padding);
        border: 1px solid var(--color-surface-highlight-border);
        border-radius: var(--workbench-card-radius);
        background: var(--color-surface-highlight);
        box-shadow: var(--color-surface-highlight-shadow);
      }

      .task-card--highlight {
        border-radius: var(--workbench-card-radius);
        padding: var(--workbench-card-padding);
        background: var(--color-surface-highlight);
        border: 1px solid var(--color-surface-highlight-border);
        box-shadow: var(--color-surface-highlight-shadow);
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

      .result-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .payload-block {
        margin: var(--space-2) 0 0;
        padding: var(--space-3);
        border-radius: var(--radius-md);
        background: var(--color-surface-muted);
        color: var(--color-text-secondary);
        font-size: var(--font-size-xxs);
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
          grid-template-rows: auto auto auto;
        }

        .item-card {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class WorkspaceTodoComponent implements OnInit, OnDestroy {
  private readonly todoApi = inject(TodoApiService);
  private readonly planApi = inject(PlanApiService);
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
  readonly selectedOccurrences = signal<TaskOccurrenceRecord[]>([]);
  readonly selectedOccurrencesLoading = signal(false);

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
  readonly selectedTodo = computed(
    () =>
      this.visibleTodos().find((todo) => todo.id === this.selectedTodoId()) ??
      this.todos().find((todo) => todo.id === this.selectedTodoId()) ??
      null,
  );
  readonly aiWorkItems = computed<TodoAiWorkProjection[]>(() =>
    this.todos()
      .map((todo) => this.toAiWorkItem(todo))
      .filter((item): item is TodoAiWorkProjection => !!item)
      .sort((a, b) => b.sortKey - a.sortKey),
  );
  readonly selectedAiWorkItem = computed(
    () => this.aiWorkItems().find((item) => item.todoId === this.selectedTodoId()) ?? null,
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
        this.selectedOccurrences.set([]);
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
      const created = await firstValueFrom(
        this.todoApi.create({
          title: this.title().trim() || undefined,
          description: this.description().trim() || undefined,
          dueAt: this.dueAt() || undefined,
        }),
      );
      this.title.set('');
      this.description.set('');
      this.dueAt.set('');
      this.notice.set('事项已创建。');
      await this.load();
      if (created?.id) {
        this.selectTodo(created.id);
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
      const res = await firstValueFrom(
        this.todoApi.createTask(todo.id, {
          capability: latestTask.action,
          params: latestTask.params ?? {},
        }),
      );
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
    if (
      value === 'all' ||
      value === 'open' ||
      value === 'blocked' ||
      value === 'done' ||
      value === 'dropped'
    ) {
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

  selectTodo(todoId: string) {
    this.selectedTodoId.set(todoId);
    this.syncSelectedTodo();
    this.announceArrival();
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
    return (
      this.readString(latestTask.resultRef) ??
      this.readString(latestTask.resultPayload?.['summary']) ??
      '最近一次执行已完成。'
    );
  }

  emptyStateDescription(): string {
    if (this.statusFilter() === 'blocked') {
      return '当前没有待补充信息的事项。';
    }
    if (this.statusFilter() === 'done') {
      return '当前还没有已完成的事项。';
    }
    if (this.statusFilter() === 'dropped') {
      return '当前还没有已放弃的事项。';
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
        detail:
          todo.sourceIdea.status === 'promoted'
            ? '对应想法已经推进成事项。'
            : '这条事项是从想法区继续推进出来的。',
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
        meta: todo.latestTask?.scheduledAt
          ? `触发时间：${this.formatDateTime(todo.latestTask.scheduledAt)}`
          : null,
        badge: this.executionLabel(todo.latestTask?.status || todo.latestExecutionPlan.status),
        tone: this.executionTone(todo.latestTask?.status || todo.latestExecutionPlan.status),
        actionLabel: '看执行',
        icon: 'route',
      });
    }
    return items;
  }

  todoById(todoId: string): TodoRecord | null {
    return this.todos().find((todo) => todo.id === todoId) ?? null;
  }

  occurrenceTone(record: TaskOccurrenceRecord): UiTone {
    if (this.isFailedOccurrence(record)) return 'danger';
    if (record.status === 'done') return 'success';
    if (record.status === 'pending') return 'info';
    if (record.status === 'skipped') return 'warning';
    return 'neutral';
  }

  occurrenceStatusLabel(record: TaskOccurrenceRecord): string {
    return executionStatusLabel(this.isFailedOccurrence(record) ? 'failed' : record.status);
  }

  occurrenceSummary(record: TaskOccurrenceRecord): string | null {
    if (this.isFailedOccurrence(record)) {
      return this.readString(record.resultPayload?.['error']) ?? '执行失败，等待重新处理。';
    }
    if (record.status === 'pending') {
      return '等待执行中。';
    }
    return (
      this.readString(record.resultRef) ??
      this.readString(record.resultPayload?.['summary']) ??
      '执行完成。'
    );
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
    if (!selectedTodoId) {
      this.selectedOccurrences.set([]);
      return;
    }
    const selectedTodo = this.todos().find((todo) => todo.id === selectedTodoId);
    if (!selectedTodo) {
      this.selectedOccurrences.set([]);
      return;
    }
    this.highlightedTaskId.set(selectedTodo.latestTask?.id ?? null);
    void this.loadSelectedOccurrences(selectedTodo.latestExecutionPlan?.id ?? null);
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
    const taskSummary = selectedTodo.latestTask
      ? '右侧会同时显示执行入口和最近结果。'
      : '这条事项当前还没有执行记录。';
    this.setArrivalNotice(
      `已定位到事项“${selectedTodo.title || selectedTodo.description || selectedTodo.id}”。${taskSummary}`,
    );
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

  private async loadSelectedOccurrences(planId: string | null) {
    if (!planId) {
      this.selectedOccurrences.set([]);
      return;
    }

    this.selectedOccurrencesLoading.set(true);
    try {
      const list = await firstValueFrom(this.planApi.listOccurrences(planId, undefined, 6));
      this.selectedOccurrences.set(list ?? []);
    } finally {
      this.selectedOccurrencesLoading.set(false);
    }
  }

  private toAiWorkItem(todo: TodoRecord): TodoAiWorkProjection | null {
    if (!todo.latestExecutionPlan && !todo.latestTask) {
      return null;
    }

    const latestTask = todo.latestTask;
    const title = todo.title || todo.description || todo.id;
    const actionLabel = latestTask?.action || todo.latestExecutionPlan?.dispatchType || null;
    const updatedAt =
      latestTask?.scheduledAt || todo.latestExecutionPlan?.nextRunAt || todo.updatedAt;

    if (latestTask?.status === 'pending') {
      return {
        todoId: todo.id,
        planId: todo.latestExecutionPlan?.id ?? null,
        taskId: latestTask.id,
        title,
        statusLabel: '执行中',
        tone: 'info',
        summary: actionLabel ? `正在执行：${actionLabel}` : '小晴正在推进这条事项。',
        whenText: latestTask.scheduledAt
          ? `开始：${this.formatDateTime(latestTask.scheduledAt)}`
          : null,
        actionLabel,
        sortKey: this.dateWeight(updatedAt) + 3_000_000_000_000,
      };
    }

    if (todo.status === 'blocked' || latestTask?.errorSummary) {
      return {
        todoId: todo.id,
        planId: todo.latestExecutionPlan?.id ?? null,
        taskId: latestTask?.id ?? null,
        title,
        statusLabel: '待你补充',
        tone: 'warning',
        summary: latestTask?.errorSummary || todo.blockReason || '还缺少继续推进所需的信息。',
        whenText: updatedAt ? `更新：${this.formatDateTime(updatedAt)}` : null,
        actionLabel,
        sortKey: this.dateWeight(updatedAt) + 2_000_000_000_000,
      };
    }

    if (latestTask?.status === 'done') {
      return {
        todoId: todo.id,
        planId: todo.latestExecutionPlan?.id ?? null,
        taskId: latestTask.id,
        title,
        statusLabel: '最近完成',
        tone: 'success',
        summary: this.latestTaskSummary(todo),
        whenText: latestTask.scheduledAt
          ? `完成：${this.formatDateTime(latestTask.scheduledAt)}`
          : null,
        actionLabel,
        sortKey: this.dateWeight(updatedAt) + 1_000_000_000_000,
      };
    }

    return {
      todoId: todo.id,
      planId: todo.latestExecutionPlan?.id ?? null,
      taskId: latestTask?.id ?? null,
      title,
      statusLabel: '已接手',
      tone: 'neutral',
      summary: '已经挂上执行链路，等待后续推进。',
      whenText: todo.latestExecutionPlan?.nextRunAt
        ? `下次：${this.formatDateTime(todo.latestExecutionPlan.nextRunAt)}`
        : null,
      actionLabel,
      sortKey: this.dateWeight(updatedAt),
    };
  }

  private isFailedOccurrence(record: TaskOccurrenceRecord): boolean {
    return (
      !!record.resultPayload &&
      !Array.isArray(record.resultPayload) &&
      record.resultPayload['success'] === false
    );
  }

  private dateWeight(value?: string | null): number {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
}
