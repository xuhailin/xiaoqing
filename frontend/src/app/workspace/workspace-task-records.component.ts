import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlanApiService, type PlanRecord, type TaskOccurrenceRecord } from '../core/services/plan.service';
import { TodoApiService } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { WorkspaceArrivalNoticeComponent } from '../shared/ui/workspace-arrival-notice.component';
import {
  WorkspaceRelationSummaryComponent,
  type WorkspaceRelationSummaryItem,
} from '../shared/ui/workspace-relation-summary.component';
import { executionStatusLabel, executionStatusTone } from '../shared/workbench-status.utils';

@Component({
  selector: 'app-workspace-task-records',
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
            {{ loading() ? '加载中...' : '刷新列表' }}
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

        @if (focusedPlanSummary(); as summary) {
          <div class="focus-card">
            <div class="focus-card__header">
              <div>
                <div class="focus-card__eyebrow">当前定位</div>
                <div class="focus-card__title">{{ summary.title }}</div>
              </div>
              <div class="focus-card__badges">
                <app-badge [tone]="summary.tone">{{ summary.status }}</app-badge>
                @if (summary.dispatchType) {
                  <app-badge tone="info" appearance="outline">{{ summary.dispatchType }}</app-badge>
                }
              </div>
            </div>
            @if (summary.detail) {
              <div class="focus-card__summary">{{ summary.detail }}</div>
            }
            <app-workspace-relation-summary
              [embedded]="false"
              [items]="summary.relations"
              (action)="handleFocusedPlanAction($event)"
            />
          </div>
        }

        @if (loading()) {
          <app-state [compact]="true" kind="loading" title="任务记录加载中..." />
        } @else if (!visibleRecords().length) {
          <app-state [compact]="true" title="当前筛选范围内没有记录" [description]="emptyStateDescription()" />
        } @else {
          <div class="record-list">
            @for (record of visibleRecords(); track record.id) {
              <div class="ui-list-card record-card" [class.record-card--highlight]="highlightedRecordId() === record.id" [attr.data-record-id]="record.id">
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
                  <app-workspace-relation-summary
                    [items]="recordRelationItems(record)"
                    (action)="handleRecordRelationAction($event, record)"
                  />
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
                      <app-button variant="ghost" size="xs" (click)="retryRecord(record)">再次执行</app-button>
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

    .focus-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--workbench-card-padding);
      border: 1px solid var(--color-surface-highlight-border);
      border-radius: var(--workbench-card-radius);
      background:
        linear-gradient(180deg, rgba(79, 109, 245, 0.04), rgba(79, 109, 245, 0.015)),
        var(--workbench-surface-gradient-soft);
      box-shadow: var(--color-surface-highlight-shadow);
    }

    .focus-card__header,
    .focus-card__badges {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .focus-card__eyebrow {
      font-size: 11px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .focus-card__title {
      margin-top: 0.2rem;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .focus-card__summary {
      font-size: var(--font-size-sm);
      line-height: 1.6;
      color: var(--color-text-secondary);
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
      border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border));
      box-shadow: 0 12px 24px rgba(79, 109, 245, 0.08);
      background: color-mix(in srgb, var(--color-surface-highlight) 72%, transparent);
    }

    @media (prefers-reduced-motion: no-preference) {
      .record-card--highlight {
        animation: workbenchArrivalPulse 700ms ease-out;
      }
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
export class WorkspaceTaskRecordsComponent implements OnInit, OnDestroy {
  private readonly planApi = inject(PlanApiService);
  private readonly todoApi = inject(TodoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private querySub?: { unsubscribe(): void };
  private arrivalNoticeTimer: number | null = null;

  readonly plans = signal<PlanRecord[]>([]);
  readonly records = signal<TaskOccurrenceRecord[]>([]);
  readonly loading = signal(false);
  readonly actionNotice = signal<string | null>(null);
  readonly arrivalNotice = signal<string | null>(null);
  readonly highlightedRecordId = signal<string | null>(null);
  readonly from = signal(this.defaultDateTimeInput(-7));
  readonly to = signal(this.defaultDateTimeInput(7));
  readonly planId = signal('');
  readonly sourceTodoId = signal('');
  readonly focusTaskId = signal('');
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
  readonly focusedPlanSummary = computed(() => {
    const currentPlanId = this.planId();
    if (!currentPlanId) return null;

    const currentPlan = this.plans().find((plan) => plan.id === currentPlanId) ?? null;
    const latestRecord = this.records().find((record) => record.planId === currentPlanId) ?? null;
    const title = currentPlan?.title || currentPlan?.description || latestRecord?.plan?.title || currentPlanId;
    const status = latestRecord
      ? this.recordStatusLabel(latestRecord)
      : currentPlan?.status === 'archived'
        ? executionStatusLabel('archived')
        : executionStatusLabel('pending');
    const tone = latestRecord ? this.statusTone(latestRecord) : currentPlan?.status === 'active' ? 'warning' : 'neutral';
    const detail = latestRecord
      ? this.recordSummary(latestRecord)
      : currentPlan?.nextRunAt
        ? `下次计划时间：${this.formatDateTime(currentPlan.nextRunAt)}`
        : '这条执行链还没有新的结果。';
    const relations = latestRecord ? this.recordRelationItems(latestRecord) : [];
    return {
      title,
      status,
      tone,
      detail,
      dispatchType: currentPlan?.dispatchType ?? latestRecord?.plan?.dispatchType ?? null,
      relations,
    };
  });

  async ngOnInit() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.planId.set(params.get('planId') ?? '');
      this.sourceTodoId.set(params.get('todoId') ?? '');
      this.focusTaskId.set(params.get('taskId') ?? '');
      this.statusFilter.set('all');
    });
    await this.loadPlans();
    await this.loadRecords();
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    this.clearArrivalNotice();
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
      this.syncHighlightRecord();
      this.announceArrival();
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
    return executionStatusLabel(this.isFailedRecord(record) ? 'failed' : record.status);
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

  recordRelationItems(record: TaskOccurrenceRecord): WorkspaceRelationSummaryItem[] {
    if (!record.plan?.sourceTodoId) {
      return [];
    }
    return [{
      key: 'todo',
      label: '来源待办',
      title: record.plan.sourceTodo?.title || record.plan.sourceTodoId,
      detail: record.action ? `执行能力：${record.action}` : '这次执行来自待办推进。',
      meta: record.plan.dispatchType ? `派发方式：${record.plan.dispatchType}` : null,
      badge: 'todo',
      tone: 'success',
      actionLabel: '去待办',
      icon: 'check',
    }];
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

  handleFocusedPlanAction(action: string) {
    if (action === 'todo') {
      this.openTodo(this.currentSourceTodoId());
    }
  }

  handleRecordRelationAction(action: string, record: TaskOccurrenceRecord) {
    if (action === 'todo') {
      this.openTodo(record.plan?.sourceTodoId);
    }
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

  private syncHighlightRecord() {
    const focusTaskId = this.focusTaskId();
    if (focusTaskId && this.records().some((record) => record.id === focusTaskId)) {
      this.highlightedRecordId.set(focusTaskId);
      this.scrollIntoView(`[data-record-id="${focusTaskId}"]`);
      return;
    }
    const currentPlanId = this.planId();
    if (!currentPlanId) {
      this.highlightedRecordId.set(null);
      return;
    }
    const latestRecord = this.records().find((record) => record.planId === currentPlanId) ?? null;
    this.highlightedRecordId.set(latestRecord?.id ?? null);
    if (latestRecord?.id) {
      this.scrollIntoView(`[data-record-id="${latestRecord.id}"]`);
    }
  }

  private currentSourceTodoId(): string | null {
    return this.sourceTodoId()
      || this.records().find((record) => record.planId === this.planId())?.plan?.sourceTodoId
      || null;
  }

  private announceArrival() {
    const summary = this.focusedPlanSummary();
    if (!summary) return;
    const suffix = this.highlightedRecordId()
      ? '已自动定位到最近相关记录。'
      : '当前显示这条执行链的整体摘要。';
    this.setArrivalNotice(`已定位到执行“${summary.title}”。${suffix}`);
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

  private scrollIntoView(selector: string, delay = 60) {
    window.setTimeout(() => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return;
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, delay);
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
