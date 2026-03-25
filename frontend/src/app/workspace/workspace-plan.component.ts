import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  PlanApiService,
  type CreatePlanRequest,
  type PlanDispatchType,
  type PlanRecord,
  type TaskOccurrenceRecord,
} from '../core/services/plan.service';
import { ConversationService } from '../core/services/conversation.service';
import { SystemOverviewService } from '../core/services/system-overview.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';

type PlanFormDispatchType = 'notify' | 'action' | 'noop';
type DispatchFilter = 'all' | PlanDispatchType;

@Component({
  selector: 'app-workspace-plan',
  standalone: true,
  imports: [
    FormsModule,
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
  ],
  template: `
    <div class="ui-page-shell pl">
      <!-- 顶部栏 -->
      <header class="pl-topbar">
        <div class="pl-topbar__brand">
          <h1 class="pl-topbar__title">调度</h1>
          <p class="pl-topbar__subtitle">管理自动执行的任务和提醒</p>
        </div>
        <div class="pl-topbar__actions">
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
        <div class="pl-create">
          <div class="pl-create__form">
            <div class="pl-create__row">
              <input
                class="ui-input"
                [ngModel]="title()"
                (ngModelChange)="title.set($event)"
                placeholder="标题，例如：工作日晚间提醒收工"
              />
            </div>
            <div class="pl-create__row">
              <select class="ui-select ui-select--sm" [ngModel]="dispatchType()" (ngModelChange)="setDispatchType($event)">
                <option value="notify">仅提醒</option>
                <option value="action">执行能力</option>
                <option value="noop">noop</option>
              </select>
              <select class="ui-select ui-select--sm" [ngModel]="scope()" (ngModelChange)="setScope($event)">
                <option value="chat">chat</option>
                <option value="system">system</option>
                <option value="dev">dev</option>
              </select>
              <select class="ui-select ui-select--sm" [ngModel]="recurrence()" (ngModelChange)="setRecurrence($event)">
                <option value="once">一次</option>
                <option value="daily">每天</option>
                <option value="weekday">工作日</option>
                <option value="weekly">每周</option>
              </select>
            </div>
            @if (dispatchType() === 'action') {
              <div class="pl-create__row">
                <select class="ui-select ui-select--sm" [ngModel]="capability()" (ngModelChange)="capability.set($event)">
                  <option value="">选择能力</option>
                  @for (item of capabilityOptions(); track item) {
                    <option [value]="item">{{ item }}</option>
                  }
                </select>
                <input
                  class="ui-input ui-input--sm"
                  [ngModel]="actionParamsJson()"
                  (ngModelChange)="actionParamsJson.set($event)"
                  placeholder='参数 JSON（可选）'
                />
              </div>
            }
            <div class="pl-create__row">
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
                @if (recurrence() === 'weekly') {
                  <select class="ui-select ui-select--sm" [ngModel]="weekday()" (ngModelChange)="weekday.set($event)">
                    @for (option of weekdayOptions; track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                }
              }
              <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createPlan()">
                {{ saving() ? '创建中...' : '创建' }}
              </app-button>
            </div>
            @if (notice()) {
              <span class="pl-create__notice">{{ notice() }}</span>
            }
          </div>
        </div>
      }

      <!-- 主体：列表 + 触发记录 -->
      <div class="pl-body">
        <!-- 左侧：安排列表 -->
        <main class="pl-main">
          <div class="pl-main__header">
            <h2 class="pl-main__title">自动安排</h2>
            <div class="pl-main__filter">
              <select
                class="ui-select ui-select--sm"
                [ngModel]="dispatchFilter()"
                (ngModelChange)="setDispatchFilter($event)"
              >
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
            <div class="pl-loading">
              <app-icon name="sparkles" size="0.9rem" />
              <span>加载中...</span>
            </div>
          } @else if (!visiblePlans().length) {
            <div class="pl-empty">
              <div class="pl-empty__icon">
                <app-icon name="calendarCheck" size="1.5rem" />
              </div>
              <h3 class="pl-empty__title">还没有安排</h3>
              <p class="pl-empty__desc">点上方「新建」创建自动执行的安排。</p>
            </div>
          } @else {
            <div class="pl-list">
              @for (plan of visiblePlans(); track plan.id) {
                <div
                  class="pl-item"
                  [class.pl-item--active]="selectedPlanId() === plan.id"
                  [class.pl-item--paused]="plan.status === 'paused'"
                  (click)="selectPlan(plan.id)"
                >
                  <div class="pl-item__main">
                    <div class="pl-item__header">
                      <span class="pl-item__title">{{ plan.title || plan.description || '未命名安排' }}</span>
                      <app-badge [tone]="statusTone(plan.status)" size="sm">{{ statusLabel(plan.status) }}</app-badge>
                    </div>
                    <div class="pl-item__meta">
                      <app-badge [tone]="dispatchTone(plan.dispatchType)" appearance="outline" size="sm">
                        {{ plan.dispatchType }}
                      </app-badge>
                      <app-badge tone="neutral" appearance="outline" size="sm">{{ plan.scope }}</app-badge>
                      @if (plan.nextRunAt) {
                        <span class="pl-item__next">下次：{{ formatDateTime(plan.nextRunAt) }}</span>
                      }
                      @if (planActionLabel(plan); as actionLabel) {
                        <span>{{ actionLabel }}</span>
                      }
                    </div>
                  </div>
                  <div class="pl-item__actions" (click)="$event.stopPropagation()">
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

        <!-- 右侧：触发记录 -->
        <aside class="pl-aux">
          <h3 class="pl-aux__title">最近触发</h3>
          <div class="pl-aux__content">
            @if (selectedPlan(); as plan) {
              <div class="pl-aux__selected">
                <div class="pl-aux__selected-title">{{ plan.title || plan.description || plan.id }}</div>
                <div class="pl-aux__selected-meta">
                  <app-badge [tone]="dispatchTone(plan.dispatchType)" appearance="outline" size="sm">
                    {{ plan.dispatchType }}
                  </app-badge>
                  <app-badge tone="neutral" appearance="outline" size="sm">{{ plan.recurrence }}</app-badge>
                </div>
              </div>

              @if (occurrenceLoading()) {
                <div class="pl-aux__loading">加载中...</div>
              } @else if (!occurrences().length) {
                <div class="pl-aux__empty">
                  <p>暂无触发记录</p>
                  <span>安排创建后，这里会显示最近的执行记录</span>
                </div>
              } @else {
                <div class="pl-aux__list">
                  @for (item of occurrences(); track item.id) {
                    <div class="pl-occ">
                      <div class="pl-occ__marker pl-occ__marker--{{ occurrenceTone(item.status) }"></div>
                      <div class="pl-occ__body">
                        <div class="pl-occ__head">
                          <span class="pl-occ__time">{{ formatDateTime(item.scheduledAt) }}</span>
                          <app-badge [tone]="occurrenceTone(item.status)" appearance="outline" size="sm">
                            {{ item.status }}
                          </app-badge>
                        </div>
                        <div class="pl-occ__meta">
                          <span>{{ item.action || plan.dispatchType }}</span>
                          @if (item.resultRef) {
                            <span>{{ item.resultRef }}</span>
                          }
                        </div>
                        @if (item.resultPayload) {
                          <details class="pl-occ__payload">
                            <summary>详情</summary>
                            <pre>{{ formatJson(item.resultPayload) }}</pre>
                          </details>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            } @else {
              <div class="pl-aux__placeholder">
                <app-icon name="info" size="1rem" />
                <p>选择一条安排查看触发记录</p>
              </div>
            }
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }

      /* ═══════════════════════════════════════════════════════════════
         顶部栏
      ═══════════════════════════════════════════════════════════════ */
      .pl-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--color-border-light);
      }

      .pl-topbar__brand {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
      }

      .pl-topbar__title {
        margin: 0;
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
      }

      .pl-topbar__subtitle {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }

      .pl-topbar__actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      /* ═══════════════════════════════════════════════════════════════
         创建表单（折叠式）
      ═══════════════════════════════════════════════════════════════ */
      .pl-create {
        flex-shrink: 0;
        padding: var(--space-3);
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-border-light);
      }

      .pl-create__form {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .pl-create__row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      .pl-create__notice {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      /* ═══════════════════════════════════════════════════════════════
         主体布局
      ═══════════════════════════════════════════════════════════════ */
      .pl-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 280px;
        gap: var(--space-3);
        flex: 1;
        min-height: 0;
      }

      /* 主区 */
      .pl-main {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .pl-main__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        margin-bottom: var(--space-2);
      }

      .pl-main__title {
        margin: 0;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
      }

      .pl-main__filter {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .pl-loading {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-4);
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
      }

      /* 空态 */
      .pl-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8);
        text-align: center;
      }

      .pl-empty__icon {
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

      .pl-empty__title {
        margin: 0 0 var(--space-2);
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
      }

      .pl-empty__desc {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }

      /* 列表 */
      .pl-list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .pl-item {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border-light);
        cursor: pointer;
        transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
      }

      .pl-item:hover {
        border-color: var(--color-border);
      }

      .pl-item--active {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 20%, transparent);
      }

      .pl-item--paused {
        opacity: 0.65;
      }

      .pl-item__main {
        flex: 1;
        min-width: 0;
      }

      .pl-item__header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-1);
      }

      .pl-item__title {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
      }

      .pl-item__meta {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .pl-item__next {
        color: var(--color-text-secondary);
      }

      .pl-item__actions {
        display: flex;
        gap: var(--space-1);
        flex-shrink: 0;
      }

      /* ═══════════════════════════════════════════════════════════════
         辅助区
      ═══════════════════════════════════════════════════════════════ */
      .pl-aux {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-border-light);
        overflow: hidden;
      }

      .pl-aux__title {
        margin: 0;
        padding: var(--space-3);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border-light);
        flex-shrink: 0;
      }

      .pl-aux__content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--space-3);
      }

      .pl-aux__selected {
        padding-bottom: var(--space-3);
        margin-bottom: var(--space-3);
        border-bottom: 1px solid var(--color-border-light);
      }

      .pl-aux__selected-title {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
        margin-bottom: var(--space-1);
      }

      .pl-aux__selected-meta {
        display: flex;
        gap: var(--space-2);
      }

      .pl-aux__loading {
        padding: var(--space-3);
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        text-align: center;
      }

      .pl-aux__empty {
        padding: var(--space-4);
        text-align: center;
      }

      .pl-aux__empty p {
        margin: 0 0 var(--space-1);
        font-size: var(--font-size-sm);
        color: var(--color-text);
      }

      .pl-aux__empty span {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .pl-aux__placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-4);
        text-align: center;
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .pl-aux__list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      /* 触发记录时间线 */
      .pl-occ {
        display: flex;
        gap: var(--space-2);
      }

      .pl-occ__marker {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 0.35rem;
        background: var(--color-border);
      }

      .pl-occ__marker--success { background: var(--color-success); }
      .pl-occ__marker--warning { background: var(--color-warning); }
      .pl-occ__marker--danger { background: var(--color-error); }
      .pl-occ__marker--info { background: var(--color-primary); }
      .pl-occ__marker--neutral { background: var(--color-text-muted); }

      .pl-occ__body {
        flex: 1;
        min-width: 0;
      }

      .pl-occ__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-1);
      }

      .pl-occ__time {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
      }

      .pl-occ__meta {
        display: flex;
        gap: var(--space-2);
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .pl-occ__payload {
        margin-top: var(--space-2);
        font-size: 0.65rem;
      }

      .pl-occ__payload summary {
        cursor: pointer;
        color: var(--color-text-muted);
      }

      .pl-occ__payload pre {
        margin: var(--space-1) 0 0;
        padding: var(--space-2);
        background: var(--color-bg);
        border-radius: var(--radius-sm);
        font-size: 0.6rem;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 6rem;
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
        .pl {
          padding: var(--space-2) var(--space-3);
        }

        .pl-topbar__subtitle {
          display: none;
        }

        .pl-body {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 1fr) minmax(200px, 300px);
        }

        .pl-create__row {
          flex-direction: column;
          align-items: stretch;
        }

        .pl-item {
          flex-direction: column;
        }

        .pl-item__actions {
          margin-top: var(--space-2);
          padding-top: var(--space-2);
          border-top: 1px solid var(--color-border-light);
        }
      }
    `,
  ],
})
export class WorkspacePlanComponent implements OnInit {
  private readonly plans = inject(PlanApiService);
  private readonly systemOverview = inject(SystemOverviewService);
  private readonly conversations = inject(ConversationService);

  readonly allPlans = signal<PlanRecord[]>([]);
  readonly occurrences = signal<TaskOccurrenceRecord[]>([]);
  readonly selectedPlanId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly occurrenceLoading = signal(false);
  readonly notice = signal<string | null>(null);
  readonly showCreateForm = signal(false);

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
  readonly selectedPlan = computed(
    () =>
      this.visiblePlans().find((plan) => plan.id === this.selectedPlanId()) ??
      this.allPlans().find((plan) => plan.id === this.selectedPlanId()) ??
      null,
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

  toggleCreateForm() {
    this.showCreateForm.update((v) => !v);
    this.notice.set(null);
  }

  async createPlan() {
    const trimmedTitle = this.title().trim();
    const trimmedDescription = this.description().trim();
    if (!trimmedTitle && !trimmedDescription) {
      this.notice.set('请至少填写标题或说明。');
      return;
    }

    const dispatchType = this.dispatchType();
    const request: CreatePlanRequest = {
      title: trimmedTitle || trimmedDescription,
      description: trimmedDescription || trimmedTitle,
      scope: this.scope(),
      dispatchType,
      recurrence: this.recurrence(),
      timezone: 'Asia/Shanghai',
      ...this.buildSchedulePayload(),
    };

    if (dispatchType === 'notify') {
      const currentConv = await firstValueFrom(this.conversations.getOrCreateCurrent('xiaoqing'));
      request.conversationId = currentConv.id;
    }

    if (dispatchType === 'action') {
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
      this.notice.set('安排已创建。');
      await this.load();
      if (created?.id) {
        await this.selectPlan(created.id);
      }
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : '安排创建失败');
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

  statusLabel(status: string): string {
    if (status === 'active') return '运行中';
    if (status === 'paused') return '已暂停';
    if (status === 'archived') return '已归档';
    return status;
  }

  dispatchTone(
    dispatchType: PlanDispatchType,
  ): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
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
    const payloadAction =
      typeof plan.actionPayload?.['capability'] === 'string'
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
    if (
      value === 'all' ||
      value === 'notify' ||
      value === 'action' ||
      value === 'dev_run' ||
      value === 'noop'
    ) {
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
