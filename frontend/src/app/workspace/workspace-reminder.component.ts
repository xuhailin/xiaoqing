import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { ConversationService } from '../core/services/conversation.service';
import { PlanApiService, type CreatePlanRequest, type PlanRecord } from '../core/services/plan.service';

@Component({
  selector: 'app-workspace-reminder',
  standalone: true,
  imports: [
    FormsModule,
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
  ],
  template: `
    <div class="ui-page-shell rm">
      <!-- 顶部栏 -->
      <header class="rm-topbar">
        <div class="rm-topbar__brand">
          <h1 class="rm-topbar__title">提醒</h1>
          <p class="rm-topbar__subtitle">定时提醒，让小晴在合适的时间提醒你</p>
        </div>
        <div class="rm-topbar__actions">
          <app-button
            [variant]="showCreateForm() ? 'primary' : 'ghost'"
            size="sm"
            (click)="toggleCreateForm()"
          >
            @if (showCreateForm()) {
              <app-icon name="x" size="0.85rem" />
              <span>收起</span>
            } @else {
              <app-icon name="plus" size="0.85rem" />
              <span>新建</span>
            }
          </app-button>
        </div>
      </header>

      <!-- 折叠创建表单 -->
      @if (showCreateForm()) {
        <div class="rm-create">
          <div class="rm-create__form">
            <input
              class="ui-input rm-create__input"
              [ngModel]="title()"
              (ngModelChange)="title.set($event)"
              placeholder="提醒内容，例如：晚上六点吃饭"
            />
            <div class="rm-create__options">
              <select class="ui-select ui-select--sm" [ngModel]="recurrence()" (ngModelChange)="setRecurrence($event)">
                <option value="once">一次</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
              </select>
              @if (recurrence() === 'once') {
                <input
                  class="ui-input ui-input--sm"
                  type="datetime-local"
                  [ngModel]="runAt()"
                  (ngModelChange)="runAt.set($event)"
                />
              } @else {
                <input
                  class="ui-input ui-input--sm"
                  type="time"
                  [ngModel]="timeOfDay()"
                  (ngModelChange)="timeOfDay.set($event)"
                />
              }
              @if (recurrence() === 'weekly') {
                <select class="ui-select ui-select--sm" [ngModel]="weekday()" (ngModelChange)="weekday.set($event)">
                  @for (option of weekdayOptions; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              }
              <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createReminder()">
                {{ saving() ? '创建中...' : '创建' }}
              </app-button>
            </div>
            @if (notice()) {
              <span class="rm-create__notice">{{ notice() }}</span>
            }
          </div>
        </div>
      }

      <!-- 主区：提醒列表 -->
      <main class="rm-main">
        @if (loading()) {
          <div class="rm-loading">
            <app-icon name="sparkles" size="0.9rem" />
            <span>加载中...</span>
          </div>
        } @else if (!reminders().length) {
          <div class="rm-empty">
            <div class="rm-empty__icon">
              <app-icon name="bell" size="1.5rem" />
            </div>
            <h2 class="rm-empty__title">还没有提醒</h2>
            <p class="rm-empty__desc">点上方「新建」创建一条提醒，小晴会在设定的时间提醒你。</p>
          </div>
        } @else {
          <div class="rm-list">
            @for (plan of reminders(); track plan.id) {
              <div class="rm-item" [class.rm-item--paused]="plan.status === 'paused'">
                <div class="rm-item__main">
                  <div class="rm-item__header">
                    <span class="rm-item__title">{{ plan.title || plan.description || '未命名提醒' }}</span>
                    <app-badge [tone]="statusTone(plan.status)" size="sm">{{ statusLabel(plan.status) }}</app-badge>
                  </div>
                  <div class="rm-item__meta">
                    <span class="rm-item__recurrence">
                      <app-icon name="route" size="0.7rem" />
                      {{ recurrenceLabel(plan) }}
                    </span>
                    @if (plan.nextRunAt) {
                      <span class="rm-item__next">
                        下次：{{ formatDateTime(plan.nextRunAt) }}
                      </span>
                    }
                  </div>
                </div>
                <div class="rm-item__actions">
                  @if (plan.status === 'active') {
                    <app-button variant="ghost" size="xs" (click)="lifecycle(plan.id, 'pause')">暂停</app-button>
                  } @else if (plan.status === 'paused') {
                    <app-button variant="ghost" size="xs" (click)="lifecycle(plan.id, 'resume')">恢复</app-button>
                  }
                  <app-button variant="ghost" size="xs" (click)="lifecycle(plan.id, 'archive')">归档</app-button>
                </div>
              </div>
            }
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    /* ═══════════════════════════════════════════════════════════════
       顶部栏
    ═══════════════════════════════════════════════════════════════ */
    .rm-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .rm-topbar__brand {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }

    .rm-topbar__title {
      margin: 0;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .rm-topbar__subtitle {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    /* ═══════════════════════════════════════════════════════════════
       创建表单（折叠式）
    ═══════════════════════════════════════════════════════════════ */
    .rm-create {
      flex-shrink: 0;
      padding: var(--space-3);
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border-light);
    }

    .rm-create__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .rm-create__input {
      flex: 1;
    }

    .rm-create__options {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .rm-create__notice {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    /* ═══════════════════════════════════════════════════════════════
       主区：提醒列表
    ═══════════════════════════════════════════════════════════════ */
    .rm-main {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-1) 0;
    }

    .rm-loading {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-4);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    /* 空态 */
    .rm-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-8);
      text-align: center;
    }

    .rm-empty__icon {
      width: 4rem;
      height: 4rem;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--space-3);
      background: var(--color-primary-light);
      border-radius: 50%;
      color: var(--color-primary);
    }

    .rm-empty__title {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .rm-empty__desc {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      max-width: 20rem;
    }

    /* 列表 */
    .rm-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    /* 列表项 - 轻量化卡片风格 */
    .rm-item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border-light);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .rm-item:hover {
      border-color: var(--color-border);
    }

    .rm-item--paused {
      opacity: 0.65;
    }

    .rm-item__main {
      flex: 1;
      min-width: 0;
    }

    .rm-item__header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-1);
    }

    .rm-item__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .rm-item__meta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .rm-item__recurrence {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .rm-item__next {
      color: var(--color-text-secondary);
    }

    .rm-item__actions {
      display: flex;
      gap: var(--space-1);
      flex-shrink: 0;
    }

    /* ═══════════════════════════════════════════════════════════════
       辅助
    ═══════════════════════════════════════════════════════════════ */
    .ui-select--sm,
    .ui-input--sm {
      font-size: var(--font-size-sm);
      padding: var(--space-1) var(--space-2);
    }

    /* ═══════════════════════════════════════════════════════════════
       响应式
    ═══════════════════════════════════════════════════════════════ */
    @media (max-width: 960px) {
      .rm {
        padding: var(--space-2) var(--space-3);
      }

      .rm-topbar__subtitle {
        display: none;
      }

      .rm-create__options {
        flex-direction: column;
        align-items: stretch;
      }

      .rm-item {
        flex-direction: column;
      }

      .rm-item__actions {
        margin-top: var(--space-2);
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border-light);
      }
    }
  `],
})
export class WorkspaceReminderComponent implements OnInit {
  private readonly plans = inject(PlanApiService);
  private readonly conversations = inject(ConversationService);

  readonly allPlans = signal<PlanRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly notice = signal<string | null>(null);
  readonly showCreateForm = signal(false);

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

  toggleCreateForm() {
    this.showCreateForm.update((v) => !v);
    this.notice.set(null);
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
      const currentConv = await firstValueFrom(this.conversations.getOrCreateCurrent('xiaoqing'));
      await firstValueFrom(this.plans.create({
        title: trimmedTitle,
        description: trimmedTitle,
        scope: 'chat',
        dispatchType: 'notify',
        recurrence: this.recurrence(),
        timezone: 'Asia/Shanghai',
        conversationId: currentConv.id,
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

  statusLabel(status: string): string {
    if (status === 'active') return '运行中';
    if (status === 'paused') return '已暂停';
    if (status === 'archived') return '已归档';
    return status;
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
