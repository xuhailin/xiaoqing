import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SystemOverviewService } from '../core/services/system-overview.service';
import { TodoApiService, type TodoRecord, type TodoStatus } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

@Component({
  selector: 'app-workspace-todo',
  standalone: true,
  imports: [
    FormsModule,
    AppBadgeComponent,
    AppButtonComponent,
    AppPageHeaderComponent,
    AppPanelComponent,
    AppStateComponent,
  ],
  template: `
    <div class="workspace-page">
      <app-page-header
        title="待办"
        description="这里放用户自己的事项、承诺和需要跟进的内容，执行只是它的下游动作。"
      />

      <div class="workspace-grid">
        <app-panel variant="workbench" class="workspace-card">
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
          <app-panel variant="workbench" class="workspace-card">
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
              <app-state [compact]="true" title="还没有待办" description="左侧可以先记下一条需要跟进的事项。" />
            } @else {
              <div class="item-list">
                @for (todo of visibleTodos(); track todo.id) {
                  <div
                    class="ui-list-card item-card"
                    [class.is-active]="selectedTodoId() === todo.id"
                    (click)="selectedTodoId.set(todo.id)"
                  >
                    <div class="item-main">
                      <div class="item-title">{{ todo.title || todo.description || '未命名待办' }}</div>
                      <div class="item-meta">
                        <app-badge [tone]="statusTone(todo.status)">{{ todo.status }}</app-badge>
                        @if (todo.dueAt) {
                          <span>截止：{{ formatDateTime(todo.dueAt) }}</span>
                        }
                        @if (todo.sourceIdea) {
                          <span>来自想法：{{ todo.sourceIdea.title || todo.sourceIdea.id }}</span>
                        }
                        @if (todo.latestTask) {
                          <span>最新执行：{{ todo.latestTask.status }}</span>
                        }
                        @if (todo.latestTask?.errorSummary) {
                          <span>失败原因：{{ todo.latestTask?.errorSummary }}</span>
                        }
                        @if (todo.blockReason) {
                          <span>待补充：{{ todo.blockReason }}</span>
                        }
                      </div>
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

          <app-panel variant="workbench" class="workspace-card">
            <div class="card-header">执行入口</div>
            @if (selectedTodo(); as todo) {
              <div class="detail-block">
                <div class="detail-title">{{ todo.title || todo.description || todo.id }}</div>
                <div class="detail-meta">
                  <app-badge [tone]="statusTone(todo.status)">{{ todo.status }}</app-badge>
                  @if (todo.latestExecutionPlan) {
                    <app-badge tone="info" appearance="outline">{{ todo.latestExecutionPlan.dispatchType }}</app-badge>
                  }
                  @if (todo.latestTask) {
                    <span>最近执行：{{ formatDateTime(todo.latestTask.scheduledAt) }}</span>
                  }
                </div>
                @if (todo.sourceIdea) {
                  <div class="detail-links">
                    <app-button variant="ghost" size="xs" (click)="openIdea(todo.sourceIdea.id)">
                      查看来源想法
                    </app-button>
                  </div>
                }
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
                  {{ taskSaving() ? '提交中...' : '转为执行任务' }}
                </app-button>
                @if (todo.latestExecutionPlan) {
                  <app-button variant="ghost" size="sm" (click)="openExecution(todo)">
                    查看执行
                  </app-button>
                }
                @if (taskNotice()) {
                  <span class="notice">{{ taskNotice() }}</span>
                }
              </div>

              @if (todo.latestTask) {
                <div class="task-card" [class.task-card--highlight]="highlightedTaskId() === todo.latestTask.id">
                  <div class="detail-meta">
                    <app-badge tone="neutral" appearance="outline">{{ todo.latestTask.status }}</app-badge>
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
                        {{ taskSaving() ? '重试中...' : '重试执行' }}
                      </app-button>
                    </div>
                  }
                  @if (todo.latestTask.resultPayload) {
                    <pre class="payload-block">{{ formatJson(todo.latestTask.resultPayload) }}</pre>
                  }
                </div>
              } @else {
                <app-state [compact]="true" title="还没有执行记录" description="这里先只做手动把待办送入现有 Task 执行链。" />
              }
            } @else {
              <app-state [compact]="true" title="选择一条待办" description="右侧会显示它的执行入口和最近的执行结果。" />
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
    }

    .item-card {
      width: 100%;
      padding: var(--workbench-card-padding);
      text-align: left;
    }

    .item-card.is-active {
      border-color: var(--color-primary);
      box-shadow: inset 0 0 0 1px rgba(79, 109, 245, 0.08);
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
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .task-card,
    .detail-block {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .task-card--highlight {
      border-radius: var(--radius-lg);
      padding: var(--space-3);
      background: rgba(242, 246, 255, 0.72);
      border: 1px solid rgba(79, 109, 245, 0.12);
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
    }
  `],
})
export class WorkspaceTodoComponent implements OnInit, OnDestroy {
  private readonly todoApi = inject(TodoApiService);
  private readonly systemOverview = inject(SystemOverviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private querySub?: { unsubscribe(): void };

  readonly todos = signal<TodoRecord[]>([]);
  readonly selectedTodoId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly taskSaving = signal(false);
  readonly highlightedTaskId = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly taskNotice = signal<string | null>(null);

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
      this.syncSelectedTodo();
    });
    await Promise.all([this.load(), this.loadCapabilities()]);
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.todoApi.list());
      this.todos.set(list ?? []);
      const selectedTodoId = this.selectedTodoId();
      if (selectedTodoId && !this.todos().some((todo) => todo.id === selectedTodoId)) {
        this.selectedTodoId.set(null);
      } else {
        this.syncSelectedTodo();
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
    if (status === 'open') return 'info';
    if (status === 'blocked') return 'warning';
    if (status === 'done') return 'success';
    if (status === 'failed') return 'danger';
    return 'neutral';
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

  openExecution(todo: TodoRecord) {
    const planId = todo.latestExecutionPlan?.id;
    if (!planId) return;
    void this.router.navigate(['/workspace/execution'], {
      queryParams: { planId },
    });
  }

  openIdea(ideaId?: string | null) {
    if (!ideaId) return;
    void this.router.navigate(['/workspace/ideas'], {
      queryParams: { ideaId },
    });
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
    if (this.statusFilter() === 'all' || this.statusFilter() === selectedTodo.status) return;
    this.statusFilter.set(selectedTodo.status);
  }
}
