import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IdeaApiService, type IdeaRecord, type IdeaStatus } from '../core/services/idea.service';
import { PlanApiService, type TaskOccurrenceRecord } from '../core/services/plan.service';
import { SystemOverviewService } from '../core/services/system-overview.service';
import { TodoApiService, type TodoRecord, type TodoStatus } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
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

type WorkbenchStage = 'spark' | 'active' | 'waiting' | 'done' | 'archived';

interface WorkbenchItem {
  type: 'idea' | 'todo';
  id: string;
  title: string;
  subtitle: string | null;
  stage: WorkbenchStage;
  statusLabel: string;
  statusTone: UiTone;
  dueAt: string | null;
  createdAt: string;
  raw: IdeaRecord | TodoRecord;
  aiWork: {
    label: string;
    tone: UiTone;
    nextRunAt: string | null;
    actionLabel: string | null;
  } | null;
}

type CreateMode = 'idea' | 'todo' | null;
type OverlayMode = 'schedule' | 'logs' | null;

@Component({
  selector: 'app-workbench-page',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
    AppPageHeaderComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
    AppStateComponent,
    WorkspaceRelationSummaryComponent,
  ],
  template: `
    <div class="wb">
      <!-- warm-tech：header 更亲和、视觉权重轻于下方任务流 -->
      <app-page-header
        eyebrow="工作台"
        title="把事情摊开来说"
        description="从轻记录到交给小晴推进，灵感与事项的状态都会跟在这里——不用记路径，扫一眼就知道进行到哪了。"
      >
        <div actions class="wb-header-actions">
          <app-button variant="ghost" size="sm" (click)="toggleCreate('idea')">
            <app-icon name="lightbulb" size="0.85rem" />
            <span>新想法</span>
          </app-button>
          <app-button variant="primary" size="sm" (click)="toggleCreate('todo')">
            <app-icon name="check" size="0.85rem" />
            <span>新事项</span>
          </app-button>
          <span class="wb-header-actions__sep" aria-hidden="true"></span>
          <app-button variant="ghost" size="sm" (click)="openOverlay('schedule')" title="查看调度规则与自动安排">
            <app-icon name="calendarCheck" size="0.85rem" />
            <span>调度</span>
          </app-button>
          <app-button variant="ghost" size="sm" (click)="openOverlay('logs')" title="查看全局执行流水">
            <app-icon name="route" size="0.85rem" />
            <span>日志</span>
          </app-button>
        </div>
      </app-page-header>

      <!-- Inline create form -->
      @if (createMode()) {
        <div class="wb-create-form">
          <app-panel variant="subtle" padding="lg" class="wb-create-panel">
            <app-section-header
              [title]="createMode() === 'idea' ? '记录想法' : '新增事项'"
            >
              <app-button actions variant="ghost" size="sm" (click)="toggleCreate(null)">收起</app-button>
            </app-section-header>

            @if (createMode() === 'idea') {
              <label class="field">
                <span>标题</span>
                <input
                  class="ui-input"
                  [ngModel]="ideaTitle()"
                  (ngModelChange)="ideaTitle.set($event)"
                  placeholder="例如：以后可以做个关系地图"
                />
              </label>
              <label class="field">
                <span>内容</span>
                <textarea
                  class="ui-textarea"
                  rows="4"
                  [ngModel]="ideaContent()"
                  (ngModelChange)="ideaContent.set($event)"
                  placeholder="把想法、灵感或暂时不执行的计划先记下来"
                ></textarea>
              </label>
              <div class="form-actions">
                <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createIdea()">
                  {{ saving() ? '记录中...' : '记下来' }}
                </app-button>
                @if (createNotice()) {
                  <span class="notice">{{ createNotice() }}</span>
                }
              </div>
            }

            @if (createMode() === 'todo') {
              <label class="field">
                <span>标题</span>
                <input
                  class="ui-input"
                  [ngModel]="todoTitle()"
                  (ngModelChange)="todoTitle.set($event)"
                  placeholder="例如：周五前整理回归测试问题"
                />
              </label>
              <label class="field">
                <span>说明</span>
                <textarea
                  class="ui-textarea"
                  rows="3"
                  [ngModel]="todoDescription()"
                  (ngModelChange)="todoDescription.set($event)"
                  placeholder="补充背景或执行边界"
                ></textarea>
              </label>
              <label class="field">
                <span>截止时间（可选）</span>
                <input
                  class="ui-input"
                  type="datetime-local"
                  [ngModel]="todoDueAt()"
                  (ngModelChange)="todoDueAt.set($event)"
                />
              </label>
              <div class="form-actions">
                <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createTodo()">
                  {{ saving() ? '创建中...' : '创建事项' }}
                </app-button>
                @if (createNotice()) {
                  <span class="notice">{{ createNotice() }}</span>
                }
              </div>
            }
          </app-panel>
        </div>
      }

      <!-- Main: status filter | task list | detail -->
      <div class="wb-main">
        <nav class="wb-filter-nav ui-scrollbar" aria-label="按状态筛选">
          @for (nav of stageFilterNav(); track nav.key) {
            <button
              type="button"
              class="wb-filter-nav__item"
              [class.wb-filter-nav__item--active]="stageFilter() === nav.key"
              (click)="setStageFilter(nav.key)"
            >
              <span class="wb-filter-nav__label">{{ nav.label }}</span>
              <span class="wb-filter-nav__badge">{{ nav.count }}</span>
            </button>
          }
        </nav>

        <div class="wb-list-column">
          @if (showListLayoutToggle()) {
            <div class="wb-list__toolbar" role="group" aria-label="列表展示方式">
              <button
                type="button"
                class="wb-list__layout-btn"
                [class.wb-list__layout-btn--active]="listLayoutMode() === 'grouped'"
                (click)="listLayoutMode.set('grouped')"
              >
                按状态分组
              </button>
              <button
                type="button"
                class="wb-list__layout-btn"
                [class.wb-list__layout-btn--active]="listLayoutMode() === 'flat'"
                (click)="listLayoutMode.set('flat')"
              >
                单一列表
              </button>
            </div>
          }

          <div
            class="wb-list ui-scrollbar"
            [class.wb-list--with-toolbar]="showListLayoutToggle()"
          >
            @if (loading()) {
              <div class="wb-warm-placeholder wb-warm-placeholder--compact">
                <app-icon name="sparkles" size="0.9rem" />
                <span>正在把你的事情流对齐，稍等片刻。</span>
              </div>
            } @else if (!filteredItems().length) {
              <div class="wb-warm-placeholder">
                <app-icon name="lightbulb" size="1rem" />
                <div class="wb-warm-placeholder__copy">
                  <p class="wb-warm-placeholder__title">{{ listEmptyTitle() }}</p>
                  <p class="wb-warm-placeholder__desc">{{ listEmptyDescription() }}</p>
                </div>
              </div>
            } @else if (displayGroups(); as groups) {
              @for (group of groups; track group.stage) {
                <div class="wb-group">
                  <div class="wb-group__header">
                    <span class="wb-group__label">{{ group.label }}</span>
                    <span class="wb-group__count">{{ group.items.length }}</span>
                  </div>
                  @for (item of group.items; track item.id + '-' + item.type) {
                    <ng-container
                      [ngTemplateOutlet]="taskRow"
                      [ngTemplateOutletContext]="{ $implicit: item }"
                    />
                  }
                </div>
              }
            } @else {
              @for (item of displayFlatItems(); track item.id + '-' + item.type) {
                <ng-container
                  [ngTemplateOutlet]="taskRow"
                  [ngTemplateOutletContext]="{ $implicit: item }"
                />
              }
            }
          </div>
        </div>

        <ng-template #taskRow let-item>
          <button
            type="button"
            class="wb-item"
            [class.wb-item--active]="selectedId() === item.id && selectedType() === item.type"
            [class.wb-item--idea]="item.type === 'idea'"
            (click)="selectItem(item)"
          >
            <span class="wb-item__icon" aria-hidden="true">
              <app-icon [name]="item.type === 'idea' ? 'lightbulb' : 'check'" size="0.8rem" />
            </span>
            <span class="wb-item__body">
              <span class="wb-item__title">{{ item.title }}</span>
              <span class="wb-item__meta">
                @if (item.aiWork) {
                  <app-badge [tone]="item.aiWork.tone" appearance="outline" size="sm">{{ item.aiWork.label }}</app-badge>
                }
                @if (item.dueAt) {
                  <span class="wb-item__due">{{ formatDate(item.dueAt) }}</span>
                }
              </span>
            </span>
          </button>
        </ng-template>

        <!-- Right: detail panel -->
        <div class="wb-detail ui-scrollbar">
          @if (selectedIdea(); as idea) {
            <app-panel variant="workbench" padding="lg" class="wb-detail-panel">
              <div class="wb-detail__hero">
                <div class="wb-detail__type">
                  <app-icon name="lightbulb" size="0.85rem" />
                  <span>想法</span>
                </div>
                <h2 class="wb-detail__title">{{ idea.title || '未命名想法' }}</h2>
                <div class="wb-detail__status-row">
                  <app-badge [tone]="ideaTone(idea.status)">{{ ideaLabel(idea.status) }}</app-badge>
                  <span class="wb-detail__time">{{ formatDateTime(idea.createdAt) }}</span>
                </div>
              </div>

              <div class="wb-detail__section">
                <div class="wb-detail__content-text">{{ idea.content }}</div>
              </div>

              @if (idea.promotedTodo) {
                <div class="wb-detail__section">
                  <div class="wb-detail__section-title">关联事项</div>
                  <app-workspace-relation-summary
                    [items]="ideaRelationItems(idea)"
                    (action)="handleIdeaRelationAction($event, idea)"
                  />
                </div>
              }

              <div class="wb-detail__actions">
                @if (idea.status === 'open') {
                  <app-button variant="primary" size="sm" [disabled]="saving()" (click)="promoteIdea(idea)">
                    {{ saving() ? '转换中...' : '转为事项' }}
                  </app-button>
                  <app-button variant="ghost" size="sm" (click)="archiveIdea(idea)">归档</app-button>
                }
                @if (idea.status === 'archived') {
                  <app-button variant="ghost" size="sm" (click)="reopenIdea(idea)">恢复</app-button>
                }
                @if (detailNotice()) {
                  <span class="notice">{{ detailNotice() }}</span>
                }
              </div>
            </app-panel>
          } @else if (selectedTodoRecord(); as todo) {
            <app-panel variant="workbench" padding="lg" class="wb-detail-panel">
              <div class="wb-detail__hero">
                <div class="wb-detail__type">
                  <app-icon name="check" size="0.85rem" />
                  <span>事项</span>
                </div>
                <h2 class="wb-detail__title">{{ todo.title || todo.description || '未命名事项' }}</h2>
                <div class="wb-detail__status-row">
                  <app-badge [tone]="todoTone(todo.status)">{{ todoLabel(todo.status) }}</app-badge>
                  @if (selectedAiWork(); as ai) {
                    <app-badge [tone]="ai.tone" appearance="outline">{{ ai.label }}</app-badge>
                  }
                  @if (todo.dueAt) {
                    <span class="wb-detail__time">截止：{{ formatDateTime(todo.dueAt) }}</span>
                  }
                </div>
                @if (todo.description && todo.title) {
                  <p class="wb-detail__desc">{{ todo.description }}</p>
                }
                @if (todo.blockReason) {
                  <div class="wb-detail__block-reason">卡点：{{ todo.blockReason }}</div>
                }
              </div>

              <!-- Relations -->
              @if (todoRelations(todo).length) {
                <div class="wb-detail__section">
                  <div class="wb-detail__section-title">关联</div>
                  <app-workspace-relation-summary
                    [items]="todoRelations(todo)"
                    (action)="handleTodoRelationAction($event, todo)"
                  />
                </div>
              }

              <!-- AI progress -->
              @if (selectedAiWork(); as ai) {
                <div class="wb-detail__section">
                  <div class="wb-detail__section-title">小晴推进</div>
                  <div class="wb-detail__ai-summary">
                    <div class="wb-detail__ai-row">
                      <app-badge [tone]="ai.tone">{{ ai.label }}</app-badge>
                      @if (ai.actionLabel) {
                        <span>{{ ai.actionLabel }}</span>
                      }
                      @if (ai.nextRunAt) {
                        <span>下次推进：{{ formatDateTime(ai.nextRunAt) }}</span>
                      }
                    </div>
                  </div>
                </div>
              }

              <!-- Execute entry -->
              @if (todo.status === 'open' || todo.status === 'blocked') {
                <div class="wb-detail__section">
                  <div class="wb-detail__section-title">交给小晴</div>
                  <div class="field-row">
                    <label class="field">
                      <span>能力</span>
                      <select
                        class="ui-select"
                        [ngModel]="capability()"
                        (ngModelChange)="capability.set($event)"
                      >
                        <option value="">请选择能力</option>
                        @for (cap of capabilityOptions(); track cap) {
                          <option [value]="cap">{{ cap }}</option>
                        }
                      </select>
                    </label>
                  </div>
                  <label class="field">
                    <span>参数 JSON（可选）</span>
                    <textarea
                      class="ui-textarea"
                      rows="3"
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
                      (click)="submitTask(todo)"
                    >
                      {{ taskSaving() ? '提交中...' : '交给小晴' }}
                    </app-button>
                    @if (todo.latestTask?.action) {
                      <app-button
                        variant="ghost"
                        size="sm"
                        [disabled]="taskSaving()"
                        (click)="retryTask(todo)"
                      >
                        {{ taskSaving() ? '重试中...' : '再次执行' }}
                      </app-button>
                    }
                    @if (taskNotice()) {
                      <span class="notice">{{ taskNotice() }}</span>
                    }
                  </div>
                </div>
              }

              <!-- Latest results -->
              <div class="wb-detail__section">
                <div class="wb-detail__section-title">最近结果</div>
                @if (occurrencesLoading()) {
                  <app-state [compact]="true" kind="loading" title="结果加载中..." />
                } @else if (occurrences().length) {
                  <div class="wb-result-list">
                    @for (occ of occurrences(); track occ.id) {
                      <div class="wb-result-card">
                        <div class="wb-result-card__meta">
                          <app-badge [tone]="occTone(occ)" appearance="outline">{{ occLabel(occ) }}</app-badge>
                          @if (occ.action) {
                            <span>{{ occ.action }}</span>
                          }
                          <span>{{ formatDateTime(occ.scheduledAt) }}</span>
                        </div>
                        @if (occSummary(occ); as summary) {
                          <div class="wb-result-card__summary">{{ summary }}</div>
                        }
                        @if (occ.resultPayload) {
                          <details class="wb-result-card__payload">
                            <summary>原始结果</summary>
                            <pre>{{ formatJson(occ.resultPayload) }}</pre>
                          </details>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <app-state
                    [compact]="true"
                    title="还没有执行结果"
                    description="把事项交给小晴后，结果会显示在这里。"
                  />
                }
              </div>

              <!-- Status actions -->
              <div class="wb-detail__actions">
                @if (todo.status === 'open' || todo.status === 'blocked') {
                  <app-button variant="success" size="sm" (click)="setTodoStatus(todo.id, 'done')">完成</app-button>
                  <app-button variant="ghost" size="sm" (click)="setTodoStatus(todo.id, 'dropped')">放弃</app-button>
                  @if (todo.status === 'blocked') {
                    <app-button variant="ghost" size="sm" (click)="setTodoStatus(todo.id, 'open')">继续处理</app-button>
                  }
                } @else {
                  <app-button variant="ghost" size="sm" (click)="setTodoStatus(todo.id, 'open')">恢复</app-button>
                }
                @if (todo.latestExecutionPlan) {
                  <app-button variant="ghost" size="sm" (click)="openExecutionPage(todo)">执行流水</app-button>
                }
                @if (detailNotice()) {
                  <span class="notice">{{ detailNotice() }}</span>
                }
              </div>
            </app-panel>
          } @else {
            <div class="wb-detail-empty">
              <div class="wb-warm-placeholder wb-warm-placeholder--center">
                <app-icon name="sparkles" size="1rem" />
                <div class="wb-warm-placeholder__copy">
                  <p class="wb-warm-placeholder__title">先选一件事吧</p>
                  <p class="wb-warm-placeholder__desc">
                    在列表里点一条想法或事项，我可以帮你推进、看执行结果，或者一起收口。
                  </p>
                </div>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Overlay: Schedule Management -->
      @if (overlayMode() === 'schedule') {
        <div class="wb-overlay-backdrop" (click)="closeOverlay()"></div>
        <aside class="wb-overlay">
          <div class="wb-overlay__header">
            <h2>调度管理</h2>
            <app-button variant="ghost" size="sm" (click)="closeOverlay()">关闭</app-button>
          </div>
          <div class="wb-overlay__body">
            <p class="wb-overlay__hint">
              完整的调度规则管理已迁移到独立面板。点击下方按钮前往。
            </p>
            <app-button variant="primary" size="sm" (click)="navigateTo('/workspace/plan')">
              打开调度管理
            </app-button>
            <app-button variant="ghost" size="sm" (click)="navigateTo('/workspace/reminder')">
              提醒管理
            </app-button>
          </div>
        </aside>
      }

      @if (overlayMode() === 'logs') {
        <div class="wb-overlay-backdrop" (click)="closeOverlay()"></div>
        <aside class="wb-overlay">
          <div class="wb-overlay__header">
            <h2>执行日志</h2>
            <app-button variant="ghost" size="sm" (click)="closeOverlay()">关闭</app-button>
          </div>
          <div class="wb-overlay__body">
            <p class="wb-overlay__hint">
              全局执行流水记录在独立面板中查看。
            </p>
            <app-button variant="primary" size="sm" (click)="navigateTo('/workspace/execution')">
              打开执行日志
            </app-button>
          </div>
        </aside>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }

      /* warm-tech：壳层一次轻暖渐变；列表项/行内不加渐变 */
      .wb {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        padding: var(--workbench-shell-padding);
        gap: var(--workbench-stack-gap);
        background: linear-gradient(
          168deg,
          color-mix(in srgb, var(--color-primary-light) 55%, var(--color-bg)) 0%,
          var(--color-bg) 38%,
          var(--color-bg) 100%
        );
      }

      .wb-header-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
      }

      .wb-header-actions__sep {
        width: 1px;
        height: 1rem;
        background: var(--color-border-light);
      }

      /* 与 design-agent 占位块一致：少量高价值状态块，同屏仅一处为主 */
      .wb-warm-placeholder {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        margin: var(--space-2) 0;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-xl);
        background: color-mix(in srgb, var(--color-surface) 84%, transparent);
        border: 1px solid var(--color-border-light);
        color: var(--color-text-secondary);
        line-height: var(--line-height-base);
      }

      .wb-warm-placeholder--compact {
        align-items: center;
        margin: var(--space-1) 0;
        padding: var(--space-2) var(--space-3);
        font-size: var(--font-size-sm);
      }

      .wb-warm-placeholder--center {
        align-items: center;
        text-align: center;
        max-width: 22rem;
        margin: 0 auto;
      }

      .wb-warm-placeholder--center .wb-warm-placeholder__copy {
        text-align: center;
      }

      .wb-warm-placeholder .wb-warm-placeholder__copy {
        flex: 1;
        min-width: 0;
      }

      .wb-warm-placeholder__title {
        margin: 0 0 var(--space-2);
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
        line-height: var(--line-height-tight);
      }

      .wb-warm-placeholder__desc {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        line-height: var(--line-height-relaxed);
      }

      /* ── Create form ── */
      .wb-create-form {
        flex-shrink: 0;
      }

      .wb-create-panel {
        gap: var(--space-3);
      }

      /* ── Main: filter | list | detail ── */
      .wb-main {
        display: grid;
        grid-template-columns: minmax(128px, 152px) minmax(220px, 300px) minmax(0, 1fr);
        gap: var(--space-3);
        flex: 1 1 0;
        min-height: 0;
        align-items: stretch;
      }

      /* ── Status filter (sidebar menu) ── */
      .wb-filter-nav {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        padding: var(--space-1) 0;
        border-right: 1px solid var(--color-border-light);
        flex-shrink: 0;
        min-height: 0;
        overflow-y: auto;
      }

      .wb-filter-nav__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        width: 100%;
        margin: 0;
        padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
        border: none;
        border-left: 3px solid transparent;
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        text-align: left;
        cursor: pointer;
        transition:
          background var(--transition-fast),
          color var(--transition-fast),
          border-color var(--transition-fast);
      }

      .wb-filter-nav__item:hover {
        color: var(--color-text);
        background: var(--color-bg);
      }

      .wb-filter-nav__item--active {
        color: var(--color-text);
        font-weight: var(--font-weight-semibold);
        border-left-color: var(--color-primary);
        background: var(--color-primary-light);
      }

      .wb-filter-nav__label {
        min-width: 0;
      }

      .wb-filter-nav__badge {
        flex-shrink: 0;
        min-width: 1.25rem;
        padding: 0 var(--space-1);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        line-height: 1.4;
        text-align: center;
        color: var(--color-text-secondary);
        background: var(--color-bg);
        border-radius: var(--radius-pill);
      }

      .wb-filter-nav__item--active .wb-filter-nav__badge {
        color: var(--color-primary);
        background: var(--color-surface);
      }

      /* ── List column ── */
      .wb-list-column {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        border-right: 1px solid var(--color-border-light);
        padding-right: var(--space-2);
      }

      .wb-list__toolbar {
        display: flex;
        gap: var(--space-1);
        flex-shrink: 0;
        padding-bottom: var(--space-2);
        margin-bottom: var(--space-1);
        border-bottom: 1px solid var(--color-border-light);
      }

      .wb-list__layout-btn {
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition:
          background var(--transition-fast),
          color var(--transition-fast);
      }

      .wb-list__layout-btn:hover {
        color: var(--color-text);
        background: var(--color-bg);
      }

      .wb-list__layout-btn--active {
        color: var(--color-primary);
        background: var(--color-primary-light);
        font-weight: var(--font-weight-semibold);
      }

      .wb-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        overflow-y: auto;
        min-height: 0;
        flex: 1;
      }

      .wb-list--with-toolbar {
        padding-top: 0;
      }

      /* ── Group (no tree indent; section label only when grouped) ── */
      .wb-group {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .wb-group + .wb-group {
        margin-top: var(--space-3);
      }

      .wb-group__header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-1) var(--space-1);
      }

      .wb-group__label {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
      }

      .wb-group__count {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-muted);
      }

      /* ── Task row (compact menu row) ── */
      .wb-item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        width: 100%;
        margin: 0;
        padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
        border: none;
        border-left: 3px solid transparent;
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition:
          background var(--transition-fast),
          border-color var(--transition-fast);
      }

      .wb-item:hover {
        background: var(--color-bg);
      }

      .wb-item:focus-visible {
        outline: none;
        border-left-color: var(--color-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 22%, transparent);
      }

      .wb-item--active {
        border-left-color: var(--color-primary);
        background: var(--color-primary-light);
      }

      .wb-item__icon {
        flex-shrink: 0;
        width: 1.25rem;
        height: 1.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 0.1rem;
        color: var(--color-text-muted);
      }

      .wb-item--idea .wb-item__icon {
        color: var(--color-primary);
      }

      .wb-item__body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        align-items: flex-start;
      }

      .wb-item__title {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        line-height: var(--line-height-tight);
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
      }

      .wb-item__meta {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      .wb-item__due {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      /* ── Right detail ── */
      .wb-detail {
        overflow-y: auto;
        min-height: 0;
      }

      .wb-detail-panel {
        gap: var(--space-4);
      }

      .wb-detail-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 12rem;
        height: 100%;
        padding: var(--space-4);
      }

      .wb-detail__hero {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding-bottom: var(--space-3);
        border-bottom: 1px solid var(--color-border-light);
      }

      .wb-detail__type {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
      }

      .wb-detail__title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary, var(--color-text));
      }

      .wb-detail__status-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      .wb-detail__time {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .wb-detail__desc {
        font-size: 0.82rem;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.5;
      }

      .wb-detail__block-reason {
        font-size: 0.8rem;
        color: var(--color-warning, #d97706);
        padding: var(--space-2) var(--space-3);
        background: var(--color-warning-bg, rgba(217, 119, 6, 0.06));
        border-radius: var(--radius-sm, 6px);
      }

      .wb-detail__content-text {
        font-size: 0.85rem;
        line-height: 1.6;
        color: var(--color-text-secondary);
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* ── Detail sections ── */
      .wb-detail__section {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .wb-detail__section-title {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-text-muted);
        padding-bottom: var(--space-1);
        border-bottom: 1px solid var(--color-border-light);
      }

      .wb-detail__ai-summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .wb-detail__ai-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
      }

      .wb-detail__actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        padding-top: var(--space-2);
        border-top: 1px solid var(--color-border-light);
      }

      /* ── Result list ── */
      .wb-result-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .wb-result-card {
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-sm, 6px);
        border: 1px solid var(--color-border-light);
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .wb-result-card__meta {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .wb-result-card__summary {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
      }

      .wb-result-card__payload {
        font-size: 0.72rem;
      }

      .wb-result-card__payload summary {
        cursor: pointer;
        color: var(--color-text-muted);
      }

      .wb-result-card__payload pre {
        margin: var(--space-1) 0 0;
        padding: var(--space-2);
        background: var(--color-surface-sunken, var(--color-bg));
        border-radius: var(--radius-sm, 4px);
        font-size: 0.7rem;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }

      /* ── Overlay ── */
      .wb-overlay-backdrop {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, var(--color-text) 28%, transparent);
        z-index: 100;
      }

      .wb-overlay {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(420px, 90vw);
        background: var(--color-surface, var(--color-bg));
        border-left: 1px solid var(--color-border-light);
        box-shadow: var(--shadow-md);
        z-index: 101;
        display: flex;
        flex-direction: column;
      }

      .wb-overlay__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border-light);
      }

      .wb-overlay__header h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
      }

      .wb-overlay__body {
        padding: var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .wb-overlay__hint {
        font-size: 0.82rem;
        color: var(--color-text-secondary);
        margin: 0;
      }

      /* ── Shared ── */
      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .field > span {
        font-size: 0.78rem;
        font-weight: 500;
        color: var(--color-text-secondary);
      }

      .field-row {
        display: flex;
        gap: var(--space-3);
        align-items: flex-end;
      }

      .form-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
      }

      .notice {
        font-size: 0.78rem;
        color: var(--color-text-muted);
      }

      /* ── Responsive ── */
      @media (max-width: 980px) {
        .wb {
          padding: var(--workbench-shell-padding-mobile);
        }

        .wb-main {
          grid-template-columns: 1fr;
          grid-template-rows: auto auto minmax(0, 1fr);
        }

        .wb-filter-nav {
          flex-direction: row;
          flex-wrap: wrap;
          border-right: none;
          border-bottom: 1px solid var(--color-border-light);
          padding-bottom: var(--space-2);
          gap: var(--space-1);
        }

        .wb-filter-nav__item {
          flex: 1 1 auto;
          min-width: 5.5rem;
          border-left: none;
          border-bottom: 2px solid transparent;
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
        }

        .wb-filter-nav__item--active {
          border-left-color: transparent;
          border-bottom-color: var(--color-primary);
        }

        .wb-list-column {
          border-right: none;
          max-height: 38vh;
        }
      }
    `,
  ],
})
export class WorkbenchPageComponent implements OnInit, OnDestroy {
  private readonly ideaApi = inject(IdeaApiService);
  private readonly todoApi = inject(TodoApiService);
  private readonly planApi = inject(PlanApiService);
  private readonly systemOverview = inject(SystemOverviewService);
  private readonly router = inject(Router);

  // Data
  readonly ideas = signal<IdeaRecord[]>([]);
  readonly todos = signal<TodoRecord[]>([]);
  readonly loading = signal(false);

  // Selection
  readonly selectedId = signal<string | null>(null);
  readonly selectedType = signal<'idea' | 'todo' | null>(null);

  // Filters
  readonly stageFilter = signal<'all' | WorkbenchStage>('all');
  /** 仅在「全部」下可选：按状态分组或单一时间序列表 */
  readonly listLayoutMode = signal<'grouped' | 'flat'>('grouped');

  // Create form
  readonly createMode = signal<CreateMode>(null);
  readonly ideaTitle = signal('');
  readonly ideaContent = signal('');
  readonly todoTitle = signal('');
  readonly todoDescription = signal('');
  readonly todoDueAt = signal('');
  readonly saving = signal(false);
  readonly createNotice = signal<string | null>(null);

  // Todo detail
  readonly capability = signal('');
  readonly paramsJson = signal('');
  readonly capabilityOptions = signal<string[]>([]);
  readonly taskSaving = signal(false);
  readonly taskNotice = signal<string | null>(null);
  readonly detailNotice = signal<string | null>(null);
  readonly occurrences = signal<TaskOccurrenceRecord[]>([]);
  readonly occurrencesLoading = signal(false);

  // Overlay
  readonly overlayMode = signal<OverlayMode>(null);

  // Computed: unified list
  readonly allItems = computed<WorkbenchItem[]>(() => {
    const ideaItems: WorkbenchItem[] = this.ideas().map((idea) => ({
      type: 'idea' as const,
      id: idea.id,
      title: idea.title || idea.content.slice(0, 60) || '未命名想法',
      subtitle: idea.title ? idea.content.slice(0, 80) : null,
      stage: this.ideaStage(idea),
      statusLabel: ideaStatusLabel(idea.status),
      statusTone: ideaStatusTone(idea.status),
      dueAt: null,
      createdAt: idea.createdAt,
      raw: idea,
      aiWork: null,
    }));
    const todoItems: WorkbenchItem[] = this.todos().map((todo) => ({
      type: 'todo' as const,
      id: todo.id,
      title: todo.title || todo.description || '未命名事项',
      subtitle: todo.title ? todo.description : null,
      stage: this.todoStage(todo),
      statusLabel: todoStatusLabel(todo.status),
      statusTone: todoStatusTone(todo.status),
      dueAt: todo.dueAt,
      createdAt: todo.createdAt,
      raw: todo,
      aiWork: this.todoAiWork(todo),
    }));
    return [...ideaItems, ...todoItems];
  });

  readonly filteredItems = computed(() => {
    const filter = this.stageFilter();
    if (filter === 'all') return this.allItems();
    return this.allItems().filter((item) => item.stage === filter);
  });

  readonly stageFilterNav = computed(() => {
    const all = this.allItems();
    const countStage = (s: WorkbenchStage) => all.filter((i) => i.stage === s).length;
    return [
      { key: 'all' as const, label: '全部', count: all.length },
      { key: 'spark' as const, label: '灵感', count: countStage('spark') },
      { key: 'active' as const, label: '进行中', count: countStage('active') },
      { key: 'waiting' as const, label: '等待中', count: countStage('waiting') },
      { key: 'done' as const, label: '已完成', count: countStage('done') },
    ];
  });

  readonly showListLayoutToggle = computed(() => this.stageFilter() === 'all');

  readonly displayGroups = computed(() => {
    if (this.stageFilter() !== 'all') return null;
    if (this.listLayoutMode() === 'flat') return null;
    return this.buildStageGroups(this.allItems());
  });

  readonly displayFlatItems = computed(() => {
    if (this.stageFilter() !== 'all') {
      return this.sortItemsFlat(this.filteredItems());
    }
    if (this.listLayoutMode() === 'flat') {
      return this.sortItemsFlat(this.allItems());
    }
    return null;
  });

  readonly listEmptyTitle = computed(() => {
    const f = this.stageFilter();
    if (f === 'all') return '这里还空着';
    const titles: Partial<Record<WorkbenchStage, string>> = {
      spark: '暂无灵感',
      active: '暂无进行中的事',
      waiting: '没有在等待的事',
      done: '还没有已完成的记录',
      archived: '暂无已归档内容',
    };
    return titles[f] ?? '暂无内容';
  });

  readonly listEmptyDescription = computed(() => {
    const f = this.stageFilter();
    if (f === 'all') {
      return '我们可以从一条灵感或一件小事开始——点上面「新想法」或「新事项」，我会帮你记好并跟进的。';
    }
    return '可以换个状态看看，或新增一条任务；我会把它归到对应状态里。';
  });

  readonly selectedIdea = computed<IdeaRecord | null>(() => {
    if (this.selectedType() !== 'idea') return null;
    return (this.ideas().find((i) => i.id === this.selectedId()) ?? null);
  });

  readonly selectedTodoRecord = computed<TodoRecord | null>(() => {
    if (this.selectedType() !== 'todo') return null;
    return (this.todos().find((t) => t.id === this.selectedId()) ?? null);
  });

  readonly selectedAiWork = computed(() => {
    const todo = this.selectedTodoRecord();
    if (!todo) return null;
    return this.todoAiWork(todo);
  });

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit() {
    await Promise.all([this.load(), this.loadCapabilities()]);
  }

  ngOnDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  async load() {
    this.loading.set(true);
    try {
      const [ideas, todos] = await Promise.all([
        firstValueFrom(this.ideaApi.list()),
        firstValueFrom(this.todoApi.list()),
      ]);
      this.ideas.set(ideas ?? []);
      this.todos.set(todos ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  setStageFilter(key: 'all' | WorkbenchStage) {
    this.stageFilter.set(key);
  }

  // ── Selection ──
  selectItem(item: WorkbenchItem) {
    this.selectedId.set(item.id);
    this.selectedType.set(item.type);
    this.detailNotice.set(null);
    this.taskNotice.set(null);
    if (item.type === 'todo') {
      const todo = item.raw as TodoRecord;
      void this.loadOccurrences(todo.latestExecutionPlan?.id ?? null);
    } else {
      this.occurrences.set([]);
    }
  }

  // ── Create ──
  toggleCreate(mode: CreateMode) {
    this.createMode.set(this.createMode() === mode ? null : mode);
    this.createNotice.set(null);
  }

  async createIdea() {
    if (!this.ideaTitle().trim() && !this.ideaContent().trim()) {
      this.createNotice.set('至少写一点标题或内容。');
      return;
    }
    this.saving.set(true);
    this.createNotice.set(null);
    try {
      const created = await firstValueFrom(
        this.ideaApi.create({
          title: this.ideaTitle().trim() || undefined,
          content: this.ideaContent().trim() || undefined,
        }),
      );
      this.ideaTitle.set('');
      this.ideaContent.set('');
      this.createNotice.set('想法已记录。');
      await this.load();
      if (created?.id) {
        this.selectedId.set(created.id);
        this.selectedType.set('idea');
      }
    } catch (e) {
      this.createNotice.set(e instanceof Error ? e.message : '记录失败');
    } finally {
      this.saving.set(false);
    }
  }

  async createTodo() {
    if (!this.todoTitle().trim() && !this.todoDescription().trim()) {
      this.createNotice.set('至少写一点标题或说明。');
      return;
    }
    this.saving.set(true);
    this.createNotice.set(null);
    try {
      const created = await firstValueFrom(
        this.todoApi.create({
          title: this.todoTitle().trim() || undefined,
          description: this.todoDescription().trim() || undefined,
          dueAt: this.todoDueAt() || undefined,
        }),
      );
      this.todoTitle.set('');
      this.todoDescription.set('');
      this.todoDueAt.set('');
      this.createNotice.set('事项已创建。');
      await this.load();
      if (created?.id) {
        this.selectedId.set(created.id);
        this.selectedType.set('todo');
      }
    } catch (e) {
      this.createNotice.set(e instanceof Error ? e.message : '创建失败');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Idea actions ──
  async promoteIdea(idea: IdeaRecord) {
    this.saving.set(true);
    this.detailNotice.set(null);
    try {
      const res = await firstValueFrom(this.ideaApi.promote(idea.id, {}));
      this.detailNotice.set('已转为事项。');
      await this.load();
      if (res?.todo?.id) {
        this.selectedId.set(res.todo.id);
        this.selectedType.set('todo');
      }
    } catch (e) {
      this.detailNotice.set(e instanceof Error ? e.message : '转换失败');
    } finally {
      this.saving.set(false);
    }
  }

  async archiveIdea(idea: IdeaRecord) {
    await firstValueFrom(this.ideaApi.update(idea.id, { status: 'archived' }));
    await this.load();
  }

  async reopenIdea(idea: IdeaRecord) {
    await firstValueFrom(this.ideaApi.update(idea.id, { status: 'open' }));
    await this.load();
  }

  // ── Todo actions ──
  async setTodoStatus(id: string, status: TodoStatus) {
    await firstValueFrom(this.todoApi.update(id, { status }));
    await this.load();
  }

  async submitTask(todo: TodoRecord) {
    const cap = this.capability().trim();
    if (!cap) {
      this.taskNotice.set('请选择一个能力。');
      return;
    }
    const params = this.parseParams();
    if (!params) return;

    this.taskSaving.set(true);
    this.taskNotice.set(null);
    try {
      await firstValueFrom(this.todoApi.createTask(todo.id, { capability: cap, params }));
      this.paramsJson.set('');
      this.taskNotice.set('已送入执行队列。');
      await this.load();
      void this.loadOccurrences(
        this.todos().find((t) => t.id === todo.id)?.latestExecutionPlan?.id ?? null,
      );
    } catch (e) {
      this.taskNotice.set(e instanceof Error ? e.message : '提交执行失败');
    } finally {
      this.taskSaving.set(false);
    }
  }

  async retryTask(todo: TodoRecord) {
    const action = todo.latestTask?.action;
    if (!action) return;
    this.taskSaving.set(true);
    this.taskNotice.set(null);
    try {
      await firstValueFrom(
        this.todoApi.createTask(todo.id, {
          capability: action,
          params: todo.latestTask?.params ?? {},
        }),
      );
      this.taskNotice.set('已重新送入执行队列。');
      await this.load();
    } catch (e) {
      this.taskNotice.set(e instanceof Error ? e.message : '重试失败');
    } finally {
      this.taskSaving.set(false);
    }
  }

  // ── Relations ──
  ideaRelationItems(idea: IdeaRecord): WorkspaceRelationSummaryItem[] {
    if (!idea.promotedTodo) return [];
    return [
      {
        key: 'todo',
        label: '已转为事项',
        title: idea.promotedTodo.title || idea.promotedTodo.id,
        detail: `状态：${todoStatusLabel(idea.promotedTodo.status)}`,
        badge: todoStatusLabel(idea.promotedTodo.status),
        tone: todoStatusTone(idea.promotedTodo.status),
        actionLabel: '查看事项',
        icon: 'check',
      },
    ];
  }

  handleIdeaRelationAction(_action: string, idea: IdeaRecord) {
    if (idea.promotedTodoId) {
      this.selectedId.set(idea.promotedTodoId);
      this.selectedType.set('todo');
      const todo = this.todos().find((t) => t.id === idea.promotedTodoId);
      if (todo) {
        void this.loadOccurrences(todo.latestExecutionPlan?.id ?? null);
      }
    }
  }

  todoRelations(todo: TodoRecord): WorkspaceRelationSummaryItem[] {
    const items: WorkspaceRelationSummaryItem[] = [];
    if (todo.sourceIdea) {
      items.push({
        key: 'idea',
        label: '来自想法',
        title: todo.sourceIdea.title || todo.sourceIdea.id,
        detail: '这条事项从想法区推进而来。',
        badge: ideaStatusLabel(todo.sourceIdea.status),
        tone: ideaStatusTone(todo.sourceIdea.status),
        actionLabel: '查看想法',
        icon: 'sparkles',
      });
    }
    if (todo.latestExecutionPlan) {
      items.push({
        key: 'execution',
        label: '执行计划',
        title: todo.latestExecutionPlan.title || todo.latestExecutionPlan.id,
        detail: todo.latestTask?.errorSummary
          ? `失败：${todo.latestTask.errorSummary}`
          : `状态：${executionStatusLabel(todo.latestTask?.status || todo.latestExecutionPlan.status)}`,
        badge: executionStatusLabel(todo.latestTask?.status || todo.latestExecutionPlan.status),
        tone: executionStatusTone(todo.latestTask?.status || todo.latestExecutionPlan.status),
        actionLabel: '执行流水',
        icon: 'route',
      });
    }
    return items;
  }

  handleTodoRelationAction(action: string, todo: TodoRecord) {
    if (action === 'idea' && todo.sourceIdeaId) {
      this.selectedId.set(todo.sourceIdeaId);
      this.selectedType.set('idea');
    }
    if (action === 'execution') {
      this.openExecutionPage(todo);
    }
  }

  // ── Navigation ──
  openExecutionPage(todo: TodoRecord) {
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

  navigateTo(path: string) {
    this.overlayMode.set(null);
    void this.router.navigate([path]);
  }

  // ── Overlay ──
  openOverlay(mode: OverlayMode) {
    this.overlayMode.set(mode);
  }

  closeOverlay() {
    this.overlayMode.set(null);
  }

  // ── Occurrence helpers ──
  occTone(record: TaskOccurrenceRecord): UiTone {
    if (this.isFailedOcc(record)) return 'danger';
    if (record.status === 'done') return 'success';
    if (record.status === 'pending') return 'info';
    if (record.status === 'skipped') return 'warning';
    return 'neutral';
  }

  occLabel(record: TaskOccurrenceRecord): string {
    return executionStatusLabel(this.isFailedOcc(record) ? 'failed' : record.status);
  }

  occSummary(record: TaskOccurrenceRecord): string | null {
    if (this.isFailedOcc(record)) {
      return this.str(record.resultPayload?.['error']) ?? '执行失败。';
    }
    if (record.status === 'pending') return '等待执行中。';
    return this.str(record.resultRef) ?? this.str(record.resultPayload?.['summary']) ?? '执行完成。';
  }

  // ── Status helpers ──
  ideaLabel(status: string) { return ideaStatusLabel(status); }
  ideaTone(status: string) { return ideaStatusTone(status); }
  todoLabel(status: string) { return todoStatusLabel(status); }
  todoTone(status: string) { return todoStatusTone(status); }

  // ── Formatters ──
  formatDateTime(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  formatDate(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('zh-CN');
  }

  formatJson(value: unknown): string {
    try { return JSON.stringify(value, null, 2); }
    catch { return String(value); }
  }

  // ── Private ──
  private buildStageGroups(items: WorkbenchItem[]) {
    const stageOrder: WorkbenchStage[] = ['spark', 'active', 'waiting', 'done', 'archived'];
    const labels: Record<WorkbenchStage, string> = {
      spark: '灵感',
      active: '进行中',
      waiting: '等待中',
      done: '已完成',
      archived: '已归档',
    };
    return stageOrder
      .map((stage) => ({
        stage,
        label: labels[stage],
        items: items.filter((item) => item.stage === stage),
      }))
      .filter((group) => group.items.length > 0);
  }

  private sortItemsFlat(items: WorkbenchItem[]): WorkbenchItem[] {
    return [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private ideaStage(idea: IdeaRecord): WorkbenchStage {
    if (idea.status === 'open') return 'spark';
    if (idea.status === 'archived') return 'archived';
    return 'done'; // promoted
  }

  private todoStage(todo: TodoRecord): WorkbenchStage {
    if (todo.status === 'done') return 'done';
    if (todo.status === 'dropped') return 'archived';
    if (todo.status === 'blocked') return 'waiting';
    return 'active';
  }

  private todoAiWork(todo: TodoRecord): WorkbenchItem['aiWork'] {
    if (!todo.latestExecutionPlan && !todo.latestTask) return null;
    const task = todo.latestTask;
    if (task?.status === 'pending') {
      return { label: '执行中', tone: 'info', nextRunAt: null, actionLabel: task.action };
    }
    if (todo.status === 'blocked' || task?.errorSummary) {
      return { label: '待补充', tone: 'warning', nextRunAt: null, actionLabel: task?.action ?? null };
    }
    if (task?.status === 'done') {
      return { label: '已完成', tone: 'success', nextRunAt: null, actionLabel: task.action };
    }
    return {
      label: '已接手',
      tone: 'neutral',
      nextRunAt: todo.latestExecutionPlan?.nextRunAt ?? null,
      actionLabel: null,
    };
  }

  private async loadOccurrences(planId: string | null) {
    if (!planId) {
      this.occurrences.set([]);
      return;
    }
    this.occurrencesLoading.set(true);
    try {
      const list = await firstValueFrom(this.planApi.listOccurrences(planId, undefined, 6));
      this.occurrences.set(list ?? []);
    } finally {
      this.occurrencesLoading.set(false);
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
    if (!raw) return {};
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

  private isFailedOcc(record: TaskOccurrenceRecord): boolean {
    return (
      !!record.resultPayload &&
      !Array.isArray(record.resultPayload) &&
      record.resultPayload['success'] === false
    );
  }

  private str(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
