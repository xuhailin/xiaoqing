import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { PlanApiService, type CreatePlanRequest, type PlanRecord } from '../core/services/plan.service';

@Component({
  selector: 'app-workspace-reminder',
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
        title="Reminder"
        description="直接管理提醒型计划。这里走结构化 API，不进入对话与 LLM。"
      />

      <div class="workspace-grid">
        <app-panel variant="workbench" class="workspace-card">
          <div class="card-header">新提醒</div>
          <label class="field">
            <span>提醒内容</span>
            <input class="ui-input" [ngModel]="title()" (ngModelChange)="title.set($event)" placeholder="例如：晚上六点吃饭" />
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
            <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createReminder()">
              {{ saving() ? '创建中...' : '创建提醒' }}
            </app-button>
            @if (notice()) {
              <span class="notice">{{ notice() }}</span>
            }
          </div>
        </app-panel>

        <app-panel variant="workbench" class="workspace-card">
          <div class="card-header">
            <span>提醒列表</span>
            <app-badge tone="info">{{ reminders().length }}</app-badge>
          </div>

          @if (loading()) {
            <app-state [compact]="true" kind="loading" title="提醒加载中..." />
          } @else if (!reminders().length) {
            <app-state [compact]="true" title="还没有提醒" description="在左侧直接创建一条提醒。" />
          } @else {
            <div class="item-list">
              @for (plan of reminders(); track plan.id) {
                <div class="ui-list-card item-card">
                  <div class="item-main">
                    <div class="item-title">{{ plan.title || plan.description || '未命名提醒' }}</div>
                    <div class="item-meta">
                      <app-badge [tone]="statusTone(plan.status)">{{ plan.status }}</app-badge>
                      <app-badge tone="neutral" appearance="outline">{{ recurrenceLabel(plan) }}</app-badge>
                      @if (plan.nextRunAt) {
                        <span>下次：{{ formatDateTime(plan.nextRunAt) }}</span>
                      }
                    </div>
                  </div>

                  <div class="item-actions">
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

    .item-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
      overflow: auto;
    }

    .item-card {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--workbench-card-padding);
    }

    .item-main {
      min-width: 0;
    }

    .item-title {
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

    .item-actions {
      display: flex;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    @media (max-width: 980px) {
      .workspace-page {
        padding: var(--workbench-shell-padding-mobile);
      }

      .workspace-grid {
        grid-template-columns: 1fr;
      }

      .item-card {
        flex-direction: column;
      }
    }
  `],
})
export class WorkspaceReminderComponent implements OnInit {
  private readonly plans = inject(PlanApiService);

  readonly allPlans = signal<PlanRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly notice = signal<string | null>(null);

  readonly title = signal('');
  readonly recurrence = signal<'once' | 'daily' | 'weekly'>('once');
  readonly runAt = signal('');
  readonly timeOfDay = signal('09:00');
  readonly weekday = signal('1');

  readonly reminders = computed(() =>
    this.allPlans().filter((plan) => plan.dispatchType === 'notify'),
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

  async createReminder() {
    const trimmedTitle = this.title().trim();
    if (!trimmedTitle) {
      this.notice.set('请先填写提醒内容。');
      return;
    }

    this.saving.set(true);
    this.notice.set(null);
    try {
      await firstValueFrom(this.plans.create({
        title: trimmedTitle,
        description: trimmedTitle,
        scope: 'chat',
        dispatchType: 'notify',
        recurrence: this.recurrence(),
        timezone: 'Asia/Shanghai',
        ...this.buildSchedulePayload(),
      }));
      this.title.set('');
      this.runAt.set('');
      this.timeOfDay.set('09:00');
      this.weekday.set('1');
      this.notice.set('提醒已创建。');
      await this.load();
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : '提醒创建失败');
    } finally {
      this.saving.set(false);
    }
  }

  async lifecycle(id: string, action: 'pause' | 'resume' | 'archive') {
    await firstValueFrom(this.plans.lifecycle(id, action));
    await this.load();
  }

  setRecurrence(value: string) {
    if (value === 'once' || value === 'daily' || value === 'weekly') {
      this.recurrence.set(value);
    }
  }

  recurrenceLabel(plan: PlanRecord): string {
    if (plan.recurrence === 'once') return '单次';
    if (plan.recurrence === 'daily') return '每天';
    if (plan.recurrence === 'weekly') return '每周';
    if (plan.recurrence === 'weekday') return '工作日';
    return plan.recurrence;
  }

  statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
    if (status === 'active') return 'success';
    if (status === 'paused') return 'warning';
    if (status === 'archived') return 'neutral';
    return 'neutral';
  }

  formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { hour12: false });
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
