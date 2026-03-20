import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PlanApiService, type CreatePlanRequest, type PlanDispatchType, type PlanRecord, type TaskOccurrenceRecord } from '../core/services/plan.service';
import { SystemOverviewService } from '../core/services/system-overview.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

type PlanFormDispatchType = 'notify' | 'action' | 'noop';
type DispatchFilter = 'all' | PlanDispatchType;

@Component({
  selector: 'app-workspace-plan',
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
        title="计划"
        description="统一管理提醒、执行计划和 noop 规则，全部基于同一个 Plan 模型。"
      />

      <div class="workspace-grid">
        <app-panel variant="workbench" class="workspace-card">
          <div class="card-header">新计划</div>

          <label class="field">
            <span>标题</span>
            <input class="ui-input" [ngModel]="title()" (ngModelChange)="title.set($event)" placeholder="例如：工作日晚间提醒收工" />
          </label>

          <label class="field">
            <span>说明</span>
            <textarea class="ui-textarea" rows="4" [ngModel]="description()" (ngModelChange)="description.set($event)" placeholder="补充计划说明"></textarea>
          </label>

          <div class="field-row">
            <label class="field">
              <span>类型</span>
              <select class="ui-select" [ngModel]="dispatchType()" (ngModelChange)="setDispatchType($event)">
                <option value="notify">仅提醒</option>
                <option value="action">执行能力</option>
                <option value="noop">noop</option>
              </select>
            </label>

            <label class="field">
              <span>作用域</span>
              <select class="ui-select" [ngModel]="scope()" (ngModelChange)="setScope($event)">
                <option value="chat">chat</option>
                <option value="system">system</option>
                <option value="dev">dev</option>
              </select>
            </label>
          </div>

          @if (dispatchType() === 'action') {
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

              <label class="field">
                <span>模式</span>
                <input class="ui-input" value="execute" disabled />
              </label>
            </div>

            <label class="field">
              <span>参数 JSON（可选）</span>
              <textarea
                class="ui-textarea"
                rows="4"
                [ngModel]="actionParamsJson()"
                (ngModelChange)="actionParamsJson.set($event)"
                placeholder='例如：{"city":"Shanghai"}'
              ></textarea>
            </label>
          }

          <label class="field">
            <span>周期</span>
            <select class="ui-select" [ngModel]="recurrence()" (ngModelChange)="setRecurrence($event)">
              <option value="once">一次</option>
              <option value="daily">每天</option>
              <option value="weekday">工作日</option>
              <option value="weekly">每周</option>
            </select>
          </label>

          @if (recurrence() === 'once') {
            <label class="field">
              <span>执行时间</span>
              <input class="ui-input" type="datetime-local" [ngModel]="runAt()" (ngModelChange)="runAt.set($event)" />
            </label>
          } @else {
            <div class="field-row">
              <label class="field">
                <span>执行时间</span>
                <input class="ui-input" type="time" [ngModel]="timeOfDay()" (ngModelChange)="timeOfDay.set($event)" />
              </label>

              @if (recurrence() === 'weekly') {
                <label class="field">
                  <span>星期</span>
                  <select class="ui-select" [ngModel]="weekday()" (ngModelChange)="weekday.set($event)">
                    @for (option of weekdayOptions; track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                </label>
              }
            </div>
          }

          <div class="form-actions">
            <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createPlan()">
              {{ saving() ? '创建中...' : '创建计划' }}
            </app-button>
            @if (notice()) {
              <span class="notice">{{ notice() }}</span>
            }
          </div>
        </app-panel>

        <div class="workspace-stack">
          <app-panel variant="workbench" class="workspace-card">
            <div class="card-header">
              <span>计划列表</span>
              <div class="card-toolbar">
                <select class="ui-select ui-select--compact" [ngModel]="dispatchFilter()" (ngModelChange)="setDispatchFilter($event)">
                  <option value="all">全部</option>
                  <option value="notify">notify</option>
                  <option value="action">action</option>
                  <option value="dev_run">dev_run</option>
                  <option value="noop">noop</option>
                </select>
                <app-badge tone="info">{{ visiblePlans().length }}</app-badge>
              </div>
            </div>

            @if (loading()) {
              <app-state [compact]="true" kind="loading" title="计划加载中..." />
            } @else if (!visiblePlans().length) {
              <app-state [compact]="true" title="还没有计划" description="左侧可以直接创建提醒型、执行型或 noop 计划。" />
            } @else {
              <div class="item-list">
                @for (plan of visiblePlans(); track plan.id) {
                  <div
                    class="ui-list-card item-card"
                    [class.is-active]="selectedPlanId() === plan.id"
                    (click)="selectPlan(plan.id)"
                  >
                    <div class="item-main">
                      <div class="item-title">{{ plan.title || plan.description || '未命名计划' }}</div>
                      <div class="item-meta">
                        <app-badge [tone]="statusTone(plan.status)">{{ plan.status }}</app-badge>
                        <app-badge [tone]="dispatchTone(plan.dispatchType)" appearance="outline">{{ plan.dispatchType }}</app-badge>
                        <app-badge tone="neutral" appearance="outline">{{ plan.scope }}</app-badge>
                        @if (plan.nextRunAt) {
                          <span>下次：{{ formatDateTime(plan.nextRunAt) }}</span>
                        }
                        @if (planActionLabel(plan); as actionLabel) {
                          <span>能力：{{ actionLabel }}</span>
                        }
                      </div>
                    </div>

                    <div class="item-actions" (click)="$event.stopPropagation()">
                      @if (plan.status === 'active') {
                        <app-button variant="ghost" size="xs" (click)="lifecycle(plan.id, 'pause')">暂停</app-button>
                      } @else if (plan.status === 'paused') {
                        <app-button variant="ghost" size="xs" (click)="lifecycle(plan.id, 'resume')">恢复</app-button>
                      }
                      <app-button variant="danger" size="xs" (click)="lifecycle(plan.id, 'archive')">归档</app-button>
                    </div>
                  </div>
                }
              </div>
            }
          </app-panel>

          <app-panel variant="workbench" class="workspace-card">
            <div class="card-header">最近触发记录</div>
            @if (selectedPlan(); as plan) {
              <div class="occurrence-header">
                <div>
                  <div class="occurrence-title">{{ plan.title || plan.description || plan.id }}</div>
                  <div class="occurrence-meta">
                    <app-badge [tone]="dispatchTone(plan.dispatchType)" appearance="outline">{{ plan.dispatchType }}</app-badge>
                    <app-badge tone="neutral" appearance="outline">{{ plan.recurrence }}</app-badge>
                  </div>
                </div>
              </div>

              @if (occurrenceLoading()) {
                <app-state [compact]="true" kind="loading" title="记录加载中..." />
              } @else if (!occurrences().length) {
                <app-state [compact]="true" title="暂无触发记录" description="计划创建后，这里会显示最近的 TaskOccurrence。" />
              } @else {
                <div class="occurrence-list">
                  @for (item of occurrences(); track item.id) {
                    <div class="ui-list-card occurrence-card">
                      <div class="occurrence-row">
                        <div>
                          <div class="occurrence-title">{{ formatDateTime(item.scheduledAt) }}</div>
                          <div class="occurrence-meta">
                            <app-badge [tone]="occurrenceTone(item.status)">{{ item.status }}</app-badge>
                            <app-badge tone="neutral" appearance="outline">{{ item.mode }}</app-badge>
                            <span>{{ item.action || plan.dispatchType }}</span>
                            @if (item.resultRef) {
                              <span>{{ item.resultRef }}</span>
                            }
                          </div>
                        </div>
                      </div>

                      @if (item.resultPayload) {
                        <pre class="payload-block">{{ formatJson(item.resultPayload) }}</pre>
                      }
                    </div>
                  }
                </div>
              }
            } @else {
              <app-state [compact]="true" title="选择一条计划" description="右侧会显示该计划最近的 TaskOccurrence。" />
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
      grid-template-rows: minmax(0, 1fr) minmax(260px, 320px);
      gap: var(--workbench-section-gap);
      min-height: 0;
    }

    .workspace-card {
      gap: var(--space-3);
      min-height: 0;
    }

    .card-header,
    .card-toolbar,
    .occurrence-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .card-header {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: var(--line-height-tight);
      color: var(--color-text);
    }

    .field,
    .field-row {
      display: flex;
      gap: var(--space-3);
    }

    .field {
      flex-direction: column;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .field-row > .field {
      flex: 1 1 0;
      min-width: 0;
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

    .item-list,
    .occurrence-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
      overflow: auto;
    }

    .item-card,
    .occurrence-card {
      width: 100%;
      padding: var(--workbench-card-padding);
      text-align: left;
    }

    .item-card.is-active {
      border-color: var(--color-primary);
      box-shadow: inset 0 0 0 1px rgba(79, 109, 245, 0.08);
    }

    .item-main {
      min-width: 0;
    }

    .item-title,
    .occurrence-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .item-meta,
    .occurrence-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .item-actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .occurrence-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
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

      .field-row,
      .card-header,
      .card-toolbar,
      .occurrence-row {
        align-items: stretch;
        flex-direction: column;
      }
    }
  `],
})
export class WorkspacePlanComponent implements OnInit {
  private readonly plans = inject(PlanApiService);
  private readonly systemOverview = inject(SystemOverviewService);

  readonly allPlans = signal<PlanRecord[]>([]);
  readonly occurrences = signal<TaskOccurrenceRecord[]>([]);
  readonly selectedPlanId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly occurrenceLoading = signal(false);
  readonly notice = signal<string | null>(null);

  readonly capabilityOptions = signal<string[]>([]);

  readonly title = signal('');
  readonly description = signal('');
  readonly scope = signal<'system' | 'chat' | 'dev'>('chat');
  readonly dispatchType = signal<PlanFormDispatchType>('notify');
  readonly capability = signal('');
  readonly actionParamsJson = signal('');
  readonly recurrence = signal<'once' | 'daily' | 'weekday' | 'weekly'>('once');
  readonly runAt = signal('');
  readonly timeOfDay = signal('09:00');
  readonly weekday = signal('1');
  readonly dispatchFilter = signal<DispatchFilter>('all');

  readonly visiblePlans = computed(() => {
    const filter = this.dispatchFilter();
    return this.allPlans().filter((plan) => filter === 'all' || plan.dispatchType === filter);
  });
  readonly selectedPlan = computed(() =>
    this.visiblePlans().find((plan) => plan.id === this.selectedPlanId())
    ?? this.allPlans().find((plan) => plan.id === this.selectedPlanId())
    ?? null,
  );

  protected readonly weekdayOptions = [
    { value: '1', label: '周一' },
    { value: '2', label: '周二' },
    { value: '3', label: '周三' },
    { value: '4', label: '周四' },
    { value: '5', label: '周五' },
    { value: '6', label: '周六' },
    { value: '0', label: '周日' },
  ];

  async ngOnInit() {
    await Promise.all([this.load(), this.loadCapabilities()]);
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.plans.list());
      this.allPlans.set(list ?? []);
      const selectedPlanId = this.selectedPlanId();
      if (selectedPlanId && !this.allPlans().some((plan) => plan.id === selectedPlanId)) {
        this.selectedPlanId.set(null);
        this.occurrences.set([]);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async createPlan() {
    const trimmedTitle = this.title().trim();
    const trimmedDescription = this.description().trim();
    if (!trimmedTitle && !trimmedDescription) {
      this.notice.set('请至少填写标题或说明。');
      return;
    }

    const request: CreatePlanRequest = {
      title: trimmedTitle || trimmedDescription,
      description: trimmedDescription || trimmedTitle,
      scope: this.scope(),
      dispatchType: this.dispatchType(),
      recurrence: this.recurrence(),
      timezone: 'Asia/Shanghai',
      ...this.buildSchedulePayload(),
    };

    if (this.dispatchType() === 'action') {
      const capability = this.capability().trim();
      if (!capability) {
        this.notice.set('请选择要执行的能力。');
        return;
      }

      const params = this.parseActionParams();
      if (!params) {
        return;
      }

      request.actionPayload = {
        capability,
        params,
      };
      request.taskTemplates = [
        {
          action: capability,
          params,
          mode: 'execute',
        },
      ];
    }

    this.saving.set(true);
    this.notice.set(null);
    try {
      const created = await firstValueFrom(this.plans.create(request));
      this.resetForm();
      this.notice.set('计划已创建。');
      await this.load();
      if (created?.id) {
        await this.selectPlan(created.id);
      }
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : '计划创建失败');
    } finally {
      this.saving.set(false);
    }
  }

  async selectPlan(planId: string) {
    this.selectedPlanId.set(planId);
    this.occurrenceLoading.set(true);
    try {
      const list = await firstValueFrom(this.plans.listOccurrences(planId));
      this.occurrences.set(list ?? []);
    } finally {
      this.occurrenceLoading.set(false);
    }
  }

  async lifecycle(id: string, action: 'pause' | 'resume' | 'archive') {
    await firstValueFrom(this.plans.lifecycle(id, action));
    await this.load();
    if (this.selectedPlanId() === id) {
      await this.selectPlan(id);
    }
  }

  statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (status === 'active') return 'success';
    if (status === 'paused') return 'warning';
    if (status === 'archived') return 'neutral';
    return 'neutral';
  }

  dispatchTone(dispatchType: PlanDispatchType): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (dispatchType === 'notify') return 'info';
    if (dispatchType === 'action') return 'success';
    if (dispatchType === 'dev_run') return 'warning';
    return 'neutral';
  }

  occurrenceTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (status === 'done') return 'success';
    if (status === 'pending') return 'info';
    if (status === 'skipped') return 'warning';
    if (status === 'rescheduled') return 'neutral';
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

  planActionLabel(plan: PlanRecord): string | null {
    const templateAction = plan.taskTemplates?.[0]?.action;
    const payloadAction = typeof plan.actionPayload?.['capability'] === 'string'
      ? plan.actionPayload['capability']
      : null;
    return templateAction ?? payloadAction;
  }

  setScope(value: string) {
    if (value === 'system' || value === 'chat' || value === 'dev') {
      this.scope.set(value);
    }
  }

  setDispatchType(value: string) {
    if (value === 'notify' || value === 'action' || value === 'noop') {
      this.dispatchType.set(value);
      if (value !== 'action') {
        this.capability.set('');
        this.actionParamsJson.set('');
      }
    }
  }

  setDispatchFilter(value: string) {
    if (value === 'all' || value === 'notify' || value === 'action' || value === 'dev_run' || value === 'noop') {
      this.dispatchFilter.set(value);
    }
  }

  setRecurrence(value: string) {
    if (value === 'once' || value === 'daily' || value === 'weekday' || value === 'weekly') {
      this.recurrence.set(value);
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

  private parseActionParams(): Record<string, unknown> | null {
    const raw = this.actionParamsJson().trim();
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        this.notice.set('能力参数需要是 JSON 对象。');
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      this.notice.set('能力参数 JSON 解析失败。');
      return null;
    }
  }

  private buildSchedulePayload(): Partial<CreatePlanRequest> {
    if (this.recurrence() === 'once') {
      return this.runAt() ? { runAt: this.runAt() } : {};
    }

    const [hour, minute] = this.timeOfDay().split(':');
    if (!hour || !minute) {
      return {};
    }

    if (this.recurrence() === 'daily') {
      return { cronExpr: `${Number(minute)} ${Number(hour)} * * *` };
    }

    if (this.recurrence() === 'weekday') {
      return { cronExpr: `${Number(minute)} ${Number(hour)} * * 1-5` };
    }

    return { cronExpr: `${Number(minute)} ${Number(hour)} * * ${this.weekday()}` };
  }

  private resetForm() {
    this.title.set('');
    this.description.set('');
    this.dispatchType.set('notify');
    this.capability.set('');
    this.actionParamsJson.set('');
    this.runAt.set('');
    this.timeOfDay.set('09:00');
    this.weekday.set('1');
  }
}
