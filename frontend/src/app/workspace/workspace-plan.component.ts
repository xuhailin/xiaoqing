import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { PlanApiService, type CreatePlanRequest, type PlanRecord, type TaskOccurrenceRecord } from '../core/services/plan.service';

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
        title="Todo / Plan"
        description="计划页先作为结构化入口，当前默认创建 noop 计划，不进入对话链。"
      />

      <div class="workspace-grid">
        <app-panel variant="workbench" class="workspace-card">
          <div class="card-header">新计划</div>

          <label class="field">
            <span>标题</span>
            <input class="ui-input" [ngModel]="title()" (ngModelChange)="title.set($event)" placeholder="例如：每周回顾本周工作" />
          </label>

          <label class="field">
            <span>说明</span>
            <textarea class="ui-textarea" rows="4" [ngModel]="description()" (ngModelChange)="description.set($event)" placeholder="补充计划说明"></textarea>
          </label>

          <label class="field">
            <span>作用域</span>
            <select class="ui-select" [ngModel]="scope()" (ngModelChange)="setScope($event)">
              <option value="system">system</option>
              <option value="chat">chat</option>
              <option value="dev">dev</option>
            </select>
          </label>

          <label class="field">
            <span>周期</span>
            <select class="ui-select" [ngModel]="recurrence()" (ngModelChange)="setRecurrence($event)">
              <option value="once">一次</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
            </select>
          </label>

          @if (recurrence() === 'once') {
            <label class="field">
              <span>执行时间</span>
              <input class="ui-input" type="datetime-local" [ngModel]="runAt()" (ngModelChange)="runAt.set($event)" />
            </label>
          } @else {
            <label class="field">
              <span>执行时间</span>
              <input class="ui-input" type="time" [ngModel]="timeOfDay()" (ngModelChange)="timeOfDay.set($event)" />
            </label>
          }

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
              <app-badge tone="info">{{ visiblePlans().length }}</app-badge>
            </div>

            @if (loading()) {
              <app-state [compact]="true" kind="loading" title="计划加载中..." />
            } @else if (!visiblePlans().length) {
              <app-state [compact]="true" title="还没有计划" description="左侧可以先创建一个结构化计划。" />
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
                        <app-badge tone="neutral" appearance="outline">{{ plan.scope }}</app-badge>
                        <app-badge tone="info" appearance="outline">{{ plan.dispatchType }}</app-badge>
                        @if (plan.nextRunAt) {
                          <span>下次：{{ formatDateTime(plan.nextRunAt) }}</span>
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
                <div class="occurrence-title">{{ plan.title || plan.description || plan.id }}</div>
                <app-badge tone="info" appearance="outline">{{ plan.recurrence }}</app-badge>
              </div>

              @if (occurrenceLoading()) {
                <app-state [compact]="true" kind="loading" title="记录加载中..." />
              } @else if (!occurrences().length) {
                <app-state [compact]="true" title="暂无触发记录" description="计划创建后，这里会显示 occurrence。" />
              } @else {
                <div class="occurrence-list">
                  @for (item of occurrences(); track item.id) {
                    <div class="ui-list-card occurrence-card">
                      <div>{{ formatDateTime(item.scheduledAt) }}</div>
                      <div class="occurrence-meta">
                        <app-badge [tone]="occurrenceTone(item.status)">{{ item.status }}</app-badge>
                        @if (item.resultRef) {
                          <span>{{ item.resultRef }}</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            } @else {
              <app-state [compact]="true" title="选择一条计划" description="右侧会显示该计划的最近 occurrence。" />
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
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      min-height: 0;
    }

    .workspace-stack {
      display: grid;
      grid-template-rows: minmax(0, 1fr) minmax(220px, 280px);
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
      line-height: var(--line-height-tight);
      color: var(--color-text);
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
      box-shadow: inset 0 0 0 1px rgba(79, 109, 245, 0.06);
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
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
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
export class WorkspacePlanComponent implements OnInit {
  private readonly plans = inject(PlanApiService);

  readonly allPlans = signal<PlanRecord[]>([]);
  readonly occurrences = signal<TaskOccurrenceRecord[]>([]);
  readonly selectedPlanId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly occurrenceLoading = signal(false);
  readonly notice = signal<string | null>(null);

  readonly title = signal('');
  readonly description = signal('');
  readonly scope = signal<'system' | 'chat' | 'dev'>('system');
  readonly recurrence = signal<'once' | 'daily' | 'weekly'>('once');
  readonly runAt = signal('');
  readonly timeOfDay = signal('09:00');
  readonly weekday = signal('1');

  readonly visiblePlans = computed(() =>
    this.allPlans().filter((plan) => plan.dispatchType !== 'notify'),
  );
  readonly selectedPlan = computed(() =>
    this.visiblePlans().find((plan) => plan.id === this.selectedPlanId()) ?? null,
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
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.plans.list());
      this.allPlans.set(list ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  async createPlan() {
    const trimmedTitle = this.title().trim();
    if (!trimmedTitle) {
      this.notice.set('请先填写计划标题。');
      return;
    }

    this.saving.set(true);
    this.notice.set(null);
    try {
      const created = await firstValueFrom(this.plans.create({
        title: trimmedTitle,
        description: this.description().trim() || trimmedTitle,
        scope: this.scope(),
        dispatchType: 'noop',
        recurrence: this.recurrence(),
        timezone: 'Asia/Shanghai',
        ...this.buildSchedulePayload(),
      }));
      this.title.set('');
      this.description.set('');
      this.runAt.set('');
      this.timeOfDay.set('09:00');
      this.weekday.set('1');
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

  setScope(value: string) {
    if (value === 'system' || value === 'chat' || value === 'dev') {
      this.scope.set(value);
    }
  }

  setRecurrence(value: string) {
    if (value === 'once' || value === 'daily' || value === 'weekly') {
      this.recurrence.set(value);
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

    return { cronExpr: `${Number(minute)} ${Number(hour)} * * ${this.weekday()}` };
  }
}
