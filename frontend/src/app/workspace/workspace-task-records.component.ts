import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlanApiService, type PlanRecord, type TaskOccurrenceRecord } from '../core/services/plan.service';
import { TodoApiService } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

@Component({
  selector: 'app-workspace-task-records',
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
        title="执行"
        description="统一查看系统执行链里的 TaskOccurrence 流水，先保持现有执行层不变。"
      />

      <app-panel variant="workbench" class="workspace-card workspace-card--filters">
        <div class="card-header">筛选条件</div>

        <div class="filter-grid">
          <label class="field">
            <span>开始时间</span>
            <input class="ui-input" type="datetime-local" [ngModel]="from()" (ngModelChange)="from.set($event)" />
          </label>

          <label class="field">
            <span>结束时间</span>
            <input class="ui-input" type="datetime-local" [ngModel]="to()" (ngModelChange)="to.set($event)" />
          </label>

          <label class="field">
            <span>计划</span>
            <select class="ui-select" [ngModel]="planId()" (ngModelChange)="planId.set($event)">
              <option value="">全部计划</option>
              @for (plan of plans(); track plan.id) {
                <option [value]="plan.id">{{ plan.title || plan.description || plan.id }}</option>
              }
            </select>
          </label>

          <label class="field">
            <span>状态</span>
            <select class="ui-select" [ngModel]="statusFilter()" (ngModelChange)="setStatusFilter($event)">
              <option value="all">全部</option>
              <option value="pending">待处理</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
            </select>
          </label>
        </div>

        <div class="form-actions">
          <app-button variant="primary" size="sm" [disabled]="loading()" (click)="loadRecords()">
            {{ loading() ? '加载中...' : '刷新记录' }}
          </app-button>
          <span class="notice">默认展示最近 7 天到未来 7 天的触发记录。</span>
          @if (actionNotice()) {
            <span class="notice">{{ actionNotice() }}</span>
          }
        </div>
      </app-panel>

      <app-panel variant="workbench" class="workspace-card workspace-card--list">
        <div class="card-header">
          <span>执行记录</span>
          <app-badge tone="info">{{ visibleRecords().length }}</app-badge>
        </div>

        @if (loading()) {
          <app-state [compact]="true" kind="loading" title="任务记录加载中..." />
        } @else if (!visibleRecords().length) {
          <app-state [compact]="true" title="当前筛选范围内没有记录" [description]="emptyStateDescription()" />
        } @else {
          <div class="record-list">
            @for (record of visibleRecords(); track record.id) {
              <div class="ui-list-card record-card" [class.record-card--highlight]="highlightedRecordId() === record.id">
                <div class="record-main">
                  <div class="record-title">
                    {{ record.plan?.title || planTitle(record.planId) || record.planId }}
                  </div>
                  <div class="record-meta">
                    <span>{{ formatDateTime(record.scheduledAt) }}</span>
                    <app-badge [tone]="statusTone(record)">{{ recordStatusLabel(record) }}</app-badge>
                    <app-badge tone="neutral" appearance="outline">{{ record.mode }}</app-badge>
                    <span>{{ record.action || record.plan?.dispatchType || 'unknown' }}</span>
                    @if (record.plan?.dispatchType) {
                      <app-badge tone="info" appearance="outline">{{ record.plan?.dispatchType }}</app-badge>
                    }
                  </div>
                  @if (record.plan?.sourceTodoId) {
                    <div class="record-source">
                      <span>来源待办：{{ record.plan?.sourceTodo?.title || record.plan?.sourceTodoId }}</span>
                      <app-badge tone="success" appearance="outline" size="sm">Todo</app-badge>
                    </div>
                  }
                </div>

                @if (record.resultRef) {
                  <div class="record-result-ref">{{ record.resultRef }}</div>
                }

                @if (recordSummary(record); as summary) {
                  <div class="record-summary">{{ summary }}</div>
                }

                @if (record.plan?.sourceTodoId) {
                  <div class="record-actions">
                    <app-button variant="ghost" size="xs" (click)="openTodo(record.plan?.sourceTodoId)">去待办</app-button>
                    @if (record.action) {
                      <app-button variant="ghost" size="xs" (click)="retryRecord(record)">重试执行</app-button>
                    }
                  </div>
                }

                @if (record.resultPayload) {
                  <pre class="payload-block">{{ formatJson(record.resultPayload) }}</pre>
                }
              </div>
            }
          </div>
        }
      </app-panel>
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

    .workspace-card {
      gap: var(--space-3);
      min-height: 0;
    }

    .workspace-card--list {
      flex: 1 1 auto;
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

    .filter-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .notice {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .record-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
      overflow: auto;
    }

    .record-card {
      padding: var(--workbench-card-padding);
    }

    .record-card--highlight {
      border-color: var(--color-primary);
      box-shadow: var(--color-surface-highlight-shadow);
      background: var(--color-surface-highlight);
    }

    .record-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .record-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .record-source {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .record-result-ref {
      margin-top: var(--space-3);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .record-summary {
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.6;
    }

    .record-actions {
      margin-top: var(--space-2);
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .payload-block {
      margin: var(--space-3) 0 0;
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

    @media (max-width: 980px) {
      .workspace-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .filter-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class WorkspaceTaskRecordsComponent implements OnInit, OnDestroy {
  private readonly planApi = inject(PlanApiService);
  private readonly todoApi = inject(TodoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private querySub?: { unsubscribe(): void };

  readonly plans = signal<PlanRecord[]>([]);
  readonly records = signal<TaskOccurrenceRecord[]>([]);
  readonly loading = signal(false);
  readonly actionNotice = signal<string | null>(null);
  readonly highlightedRecordId = signal<string | null>(null);
  readonly from = signal(this.defaultDateTimeInput(-7));
  readonly to = signal(this.defaultDateTimeInput(7));
  readonly planId = signal('');
  readonly statusFilter = signal<'all' | 'pending' | 'success' | 'failed'>('all');

  readonly planLookup = computed(() =>
    new Map(this.plans().map((plan) => [plan.id, plan.title || plan.description || plan.id])),
  );
  readonly visibleRecords = computed(() => {
    const filter = this.statusFilter();
    return this.records().filter((record) => {
      if (filter === 'all') return true;
      if (filter === 'failed') return this.isFailedRecord(record);
      if (filter === 'success') return record.status === 'done' && !this.isFailedRecord(record);
      return record.status === 'pending';
    });
  });

  async ngOnInit() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.planId.set(params.get('planId') ?? '');
    });
    await this.loadPlans();
    await this.loadRecords();
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
  }

  async loadPlans() {
    const list = await firstValueFrom(this.planApi.list());
    this.plans.set(list ?? []);
  }

  async loadRecords() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.planApi.listTaskOccurrences({
        from: this.toIsoString(this.from()),
        to: this.toIsoString(this.to()),
        planId: this.planId() || undefined,
      }));
      this.records.set(list ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  setStatusFilter(value: string) {
    if (value === 'all' || value === 'pending' || value === 'success' || value === 'failed') {
      this.statusFilter.set(value);
    }
  }

  planTitle(planId: string) {
    return this.planLookup().get(planId) ?? null;
  }

  statusTone(record: TaskOccurrenceRecord): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (this.isFailedRecord(record)) return 'danger';
    if (record.status === 'done') return 'success';
    if (record.status === 'pending') return 'info';
    if (record.status === 'skipped') return 'warning';
    if (record.status === 'rescheduled') return 'neutral';
    return 'neutral';
  }

  recordStatusLabel(record: TaskOccurrenceRecord): string {
    return this.isFailedRecord(record) ? 'failed' : record.status;
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

  recordSummary(record: TaskOccurrenceRecord): string | null {
    if (this.isFailedRecord(record)) {
      return this.readString(record.resultPayload?.['error']) ?? '执行失败，等待重新处理。';
    }
    if (record.status === 'pending') {
      return '等待执行中。';
    }
    return this.readString(record.resultRef)
      ?? this.readString(record.resultPayload?.['summary'])
      ?? '执行完成。';
  }

  emptyStateDescription(): string {
    if (this.statusFilter() === 'failed') {
      return '当前时间范围里还没有失败记录。';
    }
    if (this.statusFilter() === 'pending') {
      return '当前时间范围里还没有待处理记录。';
    }
    if (this.statusFilter() === 'success') {
      return '当前时间范围里还没有成功记录。';
    }
    return '可以调整时间范围或计划条件后再查看。';
  }

  private isFailedRecord(record: TaskOccurrenceRecord): boolean {
    return !!record.resultPayload
      && !Array.isArray(record.resultPayload)
      && record.resultPayload['success'] === false;
  }

  openTodo(todoId?: string | null) {
    if (!todoId) return;
    void this.router.navigate(['/workspace/todos'], {
      queryParams: { todoId },
    });
  }

  async retryRecord(record: TaskOccurrenceRecord) {
    const todoId = record.plan?.sourceTodoId;
    const action = record.action;
    if (!todoId || !action) {
      this.actionNotice.set('这条记录暂时不能直接重试。');
      return;
    }

    try {
      const res = await firstValueFrom(this.todoApi.createTask(todoId, {
        capability: action,
        params: record.params ?? {},
      }));
      this.actionNotice.set('已重新送入执行队列。');
      this.statusFilter.set('all');
      this.highlightedRecordId.set(res?.todo?.latestTask?.id ?? null);
      await this.loadRecords();
    } catch (error) {
      this.actionNotice.set(error instanceof Error ? error.message : '重试执行失败');
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private defaultDateTimeInput(dayOffset: number) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setSeconds(0, 0);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private toIsoString(value: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString();
  }
}
