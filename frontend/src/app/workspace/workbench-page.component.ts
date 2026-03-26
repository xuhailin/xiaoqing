import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IdeaApiService, type IdeaRecord } from '../core/services/idea.service';
import { PlanApiService, type TaskOccurrenceRecord } from '../core/services/plan.service';
import { SystemOverviewService } from '../core/services/system-overview.service';
import { TodoApiService, type TodoRecord, type TodoStatus } from '../core/services/todo.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
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
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
    AppPanelComponent,
    WorkspaceRelationSummaryComponent,
  ],
  template: `
    <div class="ui-page-shell wb">
      <!-- 顶部操作栏：简洁、聚焦 -->
      <header class="wb-topbar">
        <div class="wb-topbar__actions">
          <app-button variant="ghost" size="sm" (click)="toggleCreate('idea')">
            <app-icon name="lightbulb" size="0.85rem" />
            <span>新想法</span>
          </app-button>
          <app-button variant="primary" size="sm" (click)="toggleCreate('todo')">
            <app-icon name="check" size="0.85rem" />
            <span>新事项</span>
          </app-button>
          <span class="wb-topbar__sep" aria-hidden="true"></span>
          <app-button variant="ghost" size="sm" (click)="openOverlay('schedule')" title="调度规则">
            <app-icon name="calendarCheck" size="0.85rem" />
          </app-button>
          <app-button variant="ghost" size="sm" (click)="openOverlay('logs')" title="执行日志">
            <app-icon name="route" size="0.85rem" />
          </app-button>
        </div>
      </header>

      <!-- 快速创建表单 -->
      @if (createMode()) {
        <div class="wb-quick-create">
          <app-panel variant="subtle" padding="md">
            <div class="wb-quick-create__header">
              <span class="wb-quick-create__title">{{ createMode() === 'idea' ? '记录想法' : '新增事项' }}</span>
              <app-button variant="ghost" size="sm" (click)="toggleCreate(null)">收起</app-button>
            </div>
            @if (createMode() === 'idea') {
              <div class="wb-quick-create__fields">
                <input
                  class="ui-input"
                  [ngModel]="ideaTitle()"
                  (ngModelChange)="ideaTitle.set($event)"
                  placeholder="标题（可选）"
                />
                <textarea
                  class="ui-textarea"
                  rows="2"
                  [ngModel]="ideaContent()"
                  (ngModelChange)="ideaContent.set($event)"
                  placeholder="把想法、灵感先记下来..."
                ></textarea>
                <div class="wb-quick-create__actions">
                  <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createIdea()">
                    {{ saving() ? '记录中...' : '记下来' }}
                  </app-button>
                  @if (createNotice()) {
                    <span class="notice">{{ createNotice() }}</span>
                  }
                </div>
              </div>
            }
            @if (createMode() === 'todo') {
              <div class="wb-quick-create__fields">
                <input
                  class="ui-input"
                  [ngModel]="todoTitle()"
                  (ngModelChange)="todoTitle.set($event)"
                  placeholder="事项标题"
                />
                <textarea
                  class="ui-textarea"
                  rows="2"
                  [ngModel]="todoDescription()"
                  (ngModelChange)="todoDescription.set($event)"
                  placeholder="说明（可选）"
                ></textarea>
                <div class="wb-quick-create__row">
                  <input
                    class="ui-input ui-input--sm"
                    type="datetime-local"
                    [ngModel]="todoDueAt()"
                    (ngModelChange)="todoDueAt.set($event)"
                  />
                </div>
                <div class="wb-quick-create__actions">
                  <app-button variant="primary" size="sm" [disabled]="saving()" (click)="createTodo()">
                    {{ saving() ? '创建中...' : '创建事项' }}
                  </app-button>
                  @if (createNotice()) {
                    <span class="notice">{{ createNotice() }}</span>
                  }
                </div>
              </div>
            }
          </app-panel>
        </div>
      }

      <!-- 主体：三栏布局 -->
      <div class="wb-body">
        <!-- 左侧：筛选 + 列表 -->
        <aside class="wb-sidebar ui-scrollbar">
          <!-- 状态筛选 -->
          <nav class="wb-filter-tabs" aria-label="按状态筛选">
            @for (nav of stageFilterNav(); track nav.key) {
              <button
                type="button"
                class="wb-filter-tab"
                [class.wb-filter-tab--active]="stageFilter() === nav.key"
                (click)="setStageFilter(nav.key)"
              >
                <span class="wb-filter-tab__label">{{ nav.label }}</span>
                <span class="wb-filter-tab__count">{{ nav.count }}</span>
              </button>
            }
          </nav>

          <!-- 列表 -->
          <div class="wb-list-area">
            @if (loading()) {
              <div class="wb-list-loading">
                <app-icon name="sparkles" size="0.9rem" />
                <span>对齐中...</span>
              </div>
            } @else if (!filteredItems().length) {
              <div class="wb-list-empty">
                <p>{{ listEmptyTitle() }}</p>
                <span>{{ listEmptyDescription() }}</span>
              </div>
            } @else if (displayGroups(); as groups) {
              @for (group of groups; track group.stage) {
                <div class="wb-list-group">
                  <div class="wb-list-group__label">{{ group.label }}</div>
                  @for (item of group.items; track item.id + '-' + item.type) {
                    <button
                      type="button"
                      class="wb-list-item"
                      [class.wb-list-item--active]="selectedId() === item.id && selectedType() === item.type"
                      [class.wb-list-item--idea]="item.type === 'idea'"
                      (click)="selectItem(item)"
                    >
                      <app-icon
                        class="wb-list-item__icon"
                        [name]="item.type === 'idea' ? 'lightbulb' : 'check'"
                        size="0.75rem"
                      />
                      <span class="wb-list-item__title">{{ item.title }}</span>
                      @if (item.aiWork) {
                        <app-badge [tone]="item.aiWork.tone" size="sm">{{ item.aiWork.label }}</app-badge>
                      }
                    </button>
                  }
                </div>
              }
            } @else {
              @for (item of displayFlatItems(); track item.id + '-' + item.type) {
                <button
                  type="button"
                  class="wb-list-item"
                  [class.wb-list-item--active]="selectedId() === item.id && selectedType() === item.type"
                  [class.wb-list-item--idea]="item.type === 'idea'"
                  (click)="selectItem(item)"
                >
                  <app-icon
                    class="wb-list-item__icon"
                    [name]="item.type === 'idea' ? 'lightbulb' : 'check'"
                    size="0.75rem"
                  />
                  <span class="wb-list-item__title">{{ item.title }}</span>
                  @if (item.aiWork) {
                    <app-badge [tone]="item.aiWork.tone" size="sm">{{ item.aiWork.label }}</app-badge>
                  }
                </button>
              }
            }
          </div>
        </aside>

        <!-- 中间：主工作区（视觉焦点） -->
        <main class="wb-main">
          @if (selectedIdea(); as idea) {
            <!-- 想法详情 -->
            <div class="wb-focus-panel">
              <header class="wb-focus-header">
                <div class="wb-focus-type">
                  <app-icon name="lightbulb" size="0.9rem" />
                  <span>想法</span>
                </div>
                <h2 class="wb-focus-title">{{ idea.title || '未命名想法' }}</h2>
                <div class="wb-focus-meta">
                  <app-badge [tone]="ideaTone(idea.status)">{{ ideaLabel(idea.status) }}</app-badge>
                  <span class="wb-focus-time">{{ formatDateTime(idea.createdAt) }}</span>
                </div>
              </header>

              <div class="wb-focus-body">
                <section class="wb-focus-section">
                  <div class="wb-focus-content">{{ idea.content }}</div>
                </section>

                @if (idea.promotedTodo) {
                  <section class="wb-focus-section">
                    <h3 class="wb-focus-section-title">关联事项</h3>
                    <app-workspace-relation-summary
                      [items]="ideaRelationItems(idea)"
                      (action)="handleIdeaRelationAction($event, idea)"
                    />
                  </section>
                }
              </div>

              <footer class="wb-focus-actions">
                @if (idea.status === 'open') {
                  <app-button variant="primary" size="md" [disabled]="saving()" (click)="promoteIdea(idea)">
                    <app-icon name="chevronRight" size="0.85rem" />
                    <span>{{ saving() ? '转换中...' : '转为事项' }}</span>
                  </app-button>
                  <app-button variant="ghost" size="md" (click)="archiveIdea(idea)">归档</app-button>
                }
                @if (idea.status === 'archived') {
                  <app-button variant="ghost" size="md" (click)="reopenIdea(idea)">恢复</app-button>
                }
                @if (detailNotice()) {
                  <span class="notice">{{ detailNotice() }}</span>
                }
              </footer>
            </div>
          } @else if (selectedTodoRecord(); as todo) {
            <!-- 事项详情 -->
            <div class="wb-focus-panel">
              <header class="wb-focus-header">
                <div class="wb-focus-type">
                  <app-icon name="check" size="0.9rem" />
                  <span>事项</span>
                </div>
                <h2 class="wb-focus-title">{{ todo.title || todo.description || '未命名事项' }}</h2>
                <div class="wb-focus-meta">
                  <app-badge [tone]="todoTone(todo.status)">{{ todoLabel(todo.status) }}</app-badge>
                  @if (selectedAiWork(); as ai) {
                    <app-badge [tone]="ai.tone" appearance="outline">{{ ai.label }}</app-badge>
                  }
                  @if (todo.dueAt) {
                    <span class="wb-focus-time">截止：{{ formatDateTime(todo.dueAt) }}</span>
                  }
                </div>
                @if (todo.description && todo.title) {
                  <p class="wb-focus-desc">{{ todo.description }}</p>
                }
                @if (todo.blockReason) {
                  <div class="wb-focus-block">卡点：{{ todo.blockReason }}</div>
                }
              </header>

              <div class="wb-focus-body">
                <!-- 关联 -->
                @if (todoRelations(todo).length) {
                  <section class="wb-focus-section">
                    <h3 class="wb-focus-section-title">关联</h3>
                    <app-workspace-relation-summary
                      [items]="todoRelations(todo)"
                      (action)="handleTodoRelationAction($event, todo)"
                    />
                  </section>
                }

                <!-- AI 推进状态 -->
                @if (selectedAiWork(); as ai) {
                  <section class="wb-focus-section wb-focus-section--highlight">
                    <h3 class="wb-focus-section-title">
                      <app-icon name="sparkles" size="0.8rem" />
                      <span>小晴推进</span>
                    </h3>
                    <div class="wb-ai-status">
                      <app-badge [tone]="ai.tone" size="md">{{ ai.label }}</app-badge>
                      @if (ai.actionLabel) {
                        <span class="wb-ai-status__action">{{ ai.actionLabel }}</span>
                      }
                      @if (ai.nextRunAt) {
                        <span class="wb-ai-status__next">下次：{{ formatDateTime(ai.nextRunAt) }}</span>
                      }
                    </div>
                  </section>
                }

                <!-- 交给小晴 -->
                @if (todo.status === 'open' || todo.status === 'blocked') {
                  <section class="wb-focus-section">
                    <h3 class="wb-focus-section-title">交给小晴</h3>
                    <div class="wb-delegate-form">
                      <div class="wb-delegate-row">
                        <select
                          class="ui-select"
                          [ngModel]="capability()"
                          (ngModelChange)="capability.set($event)"
                        >
                          <option value="">选择能力</option>
                          @for (cap of capabilityOptions(); track cap) {
                            <option [value]="cap">{{ cap }}</option>
                          }
                        </select>
                      </div>
                      <textarea
                        class="ui-textarea ui-textarea--compact"
                        rows="2"
                        [ngModel]="paramsJson()"
                        (ngModelChange)="paramsJson.set($event)"
                        placeholder='参数 JSON（可选）'
                      ></textarea>
                      <div class="wb-delegate-actions">
                        <app-button
                          variant="primary"
                          size="md"
                          [disabled]="taskSaving()"
                          (click)="submitTask(todo)"
                        >
                          <app-icon name="sparkles" size="0.85rem" />
                          <span>{{ taskSaving() ? '提交中...' : '交给小晴' }}</span>
                        </app-button>
                        @if (todo.latestTask?.action) {
                          <app-button
                            variant="ghost"
                            size="md"
                            [disabled]="taskSaving()"
                            (click)="retryTask(todo)"
                          >
                            再次执行
                          </app-button>
                        }
                        @if (taskNotice()) {
                          <span class="notice">{{ taskNotice() }}</span>
                        }
                      </div>
                    </div>
                  </section>
                }
              </div>

              <footer class="wb-focus-actions">
                @if (todo.status === 'open' || todo.status === 'blocked') {
                  <app-button variant="success" size="md" (click)="setTodoStatus(todo.id, 'done')">
                    完成
                  </app-button>
                  <app-button variant="ghost" size="md" (click)="setTodoStatus(todo.id, 'dropped')">
                    放弃
                  </app-button>
                  @if (todo.status === 'blocked') {
                    <app-button variant="ghost" size="md" (click)="setTodoStatus(todo.id, 'open')">
                      继续处理
                    </app-button>
                  }
                } @else {
                  <app-button variant="ghost" size="md" (click)="setTodoStatus(todo.id, 'open')">
                    恢复
                  </app-button>
                }
                @if (todo.latestExecutionPlan) {
                  <app-button variant="ghost" size="md" (click)="openExecutionPage(todo)">
                    执行流水
                  </app-button>
                }
                @if (detailNotice()) {
                  <span class="notice">{{ detailNotice() }}</span>
                }
              </footer>
            </div>
          } @else {
            <!-- 空态：有引导感的主区域 -->
            <div class="wb-focus-empty">
              <div class="wb-focus-empty__illustration">
                <app-icon name="sparkles" size="2.5rem" />
              </div>
              <h2 class="wb-focus-empty__title">选一件事来推进</h2>
              <p class="wb-focus-empty__desc">
                左侧是你所有的事情——灵感、进行中的任务、等待中的、已完成的。<br/>
                点一条，我会帮你梳理状态、推进下一步，或者一起收口。
              </p>
              <div class="wb-focus-empty__hint">
                <app-icon name="lightbulb" size="0.85rem" />
                <span>没有想做的事？点上方「新想法」先记下来</span>
              </div>
            </div>
          }
        </main>

        <!-- 右侧：辅助信息区 -->
        <aside class="wb-aux">
          @if (selectedTodoRecord(); as todo) {
            <div class="wb-aux-section">
              <h3 class="wb-aux-title">最近结果</h3>
              <div class="wb-aux-content ui-scrollbar">
                @if (occurrencesLoading()) {
                  <div class="wb-aux-loading">加载中...</div>
                } @else if (occurrences().length) {
                  <div class="wb-result-timeline">
                    @for (occ of occurrences(); track occ.id) {
                      <div class="wb-result-item">
                        <div class="wb-result-item__marker wb-result-item__marker--{{ occTone(occ) }"></div>
                        <div class="wb-result-item__body">
                          <div class="wb-result-item__head">
                            <span class="wb-result-item__action">{{ occ.action || '执行' }}</span>
                            <span class="wb-result-item__time">{{ formatDateTime(occ.scheduledAt) }}</span>
                          </div>
                          <div class="wb-result-item__status">
                            <app-badge [tone]="occTone(occ)" appearance="outline" size="sm">
                              {{ occLabel(occ) }}
                            </app-badge>
                          </div>
                          @if (occSummary(occ); as summary) {
                            <p class="wb-result-item__summary">{{ summary }}</p>
                          }
                          @if (occ.resultPayload) {
                            <details class="wb-result-item__payload">
                              <summary>详情</summary>
                              <pre>{{ formatJson(occ.resultPayload) }}</pre>
                            </details>
                          }
                        </div>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="wb-aux-empty">
                    <p>还没有执行结果</p>
                    <span>把事项交给小晴后，结果会出现在这里</span>
                  </div>
                }
              </div>
            </div>
          } @else if (selectedIdea(); as idea) {
            <div class="wb-aux-section">
              <h3 class="wb-aux-title">关于这个想法</h3>
              <div class="wb-aux-content">
                @if (idea.promotedTodo) {
                  <div class="wb-aux-card">
                    <div class="wb-aux-card__label">已转为事项</div>
                    <div class="wb-aux-card__value">{{ idea.promotedTodo.title || idea.promotedTodo.id }}</div>
                    <app-badge [tone]="todoTone(idea.promotedTodo.status)" size="sm">
                      {{ todoLabel(idea.promotedTodo.status) }}
                    </app-badge>
                  </div>
                } @else {
                  <div class="wb-aux-empty">
                    <p>还是一条原始想法</p>
                    <span>觉得可以推进了？点「转为事项」开始执行</span>
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="wb-aux-section wb-aux-section--placeholder">
              <div class="wb-aux-placeholder">
                <app-icon name="info" size="1rem" />
                <p>选中事项后，这里会显示执行结果和相关信息</p>
              </div>
            </div>
          }
        </aside>
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
              完整的调度规则管理已迁移到独立面板。
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

      /* ═══════════════════════════════════════════════════════════════
         顶部栏
      ═══════════════════════════════════════════════════════════════ */
      .wb-topbar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-shrink: 0;
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--color-border-light);
      }

      .wb-topbar__actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .wb-topbar__sep {
        width: 1px;
        height: 1rem;
        background: var(--color-border-light);
        margin: 0 var(--space-1);
      }

      /* ═══════════════════════════════════════════════════════════════
         快速创建
      ═══════════════════════════════════════════════════════════════ */
      .wb-quick-create {
        flex-shrink: 0;
      }

      .wb-quick-create__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-2);
      }

      .wb-quick-create__title {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
      }

      .wb-quick-create__fields {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .wb-quick-create__row {
        display: flex;
        gap: var(--space-2);
      }

      .wb-quick-create__actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      /* ═══════════════════════════════════════════════════════════════
         主体布局
      ═══════════════════════════════════════════════════════════════ */
      .wb-body {
        display: grid;
        grid-template-columns: 200px minmax(0, 1fr) 260px;
        gap: var(--space-3);
        flex: 1 1 0;
        min-height: 0;
        align-items: stretch;
      }

      /* ═══════════════════════════════════════════════════════════════
         左侧栏：筛选 + 列表
      ═══════════════════════════════════════════════════════════════ */
      .wb-sidebar {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
        background: var(--color-workbench-panel);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-workbench-border);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      /* 筛选标签 */
      .wb-filter-tabs {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: var(--space-2);
        border-bottom: 1px solid var(--color-border-light);
        flex-shrink: 0;
      }

      .wb-filter-tab {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        width: 100%;
        margin: 0;
        padding: var(--space-2);
        border: none;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        text-align: left;
        cursor: pointer;
        transition: background var(--transition-fast), color var(--transition-fast);
      }

      .wb-filter-tab:hover {
        background: var(--color-bg);
        color: var(--color-text);
      }

      .wb-filter-tab--active {
        background: var(--color-primary-light);
        color: var(--color-primary);
        font-weight: var(--font-weight-semibold);
      }

      .wb-filter-tab__count {
        font-size: var(--font-size-xs);
        padding: 0.1rem 0.35rem;
        background: var(--color-bg);
        border-radius: var(--radius-pill);
        color: var(--color-text-muted);
      }

      .wb-filter-tab--active .wb-filter-tab__count {
        background: var(--color-surface);
        color: var(--color-primary);
      }

      /* 列表区域 */
      .wb-list-area {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--space-2);
      }

      .wb-list-loading {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3);
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
      }

      .wb-list-empty {
        padding: var(--space-4);
        text-align: center;
      }

      .wb-list-empty p {
        margin: 0 0 var(--space-1);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
      }

      .wb-list-empty span {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      /* 列表分组 */
      .wb-list-group {
        margin-bottom: var(--space-3);
      }

      .wb-list-group__label {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: var(--space-1) var(--space-2);
        margin-bottom: var(--space-1);
      }

      /* 列表项 */
      .wb-list-item {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        margin: 0;
        padding: var(--space-2);
        border: none;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text);
        font-size: var(--font-size-sm);
        text-align: left;
        cursor: pointer;
        transition: background var(--transition-fast);
      }

      .wb-list-item:hover {
        background: var(--color-bg);
      }

      .wb-list-item--active {
        background: var(--color-primary-light);
      }

      .wb-list-item__icon {
        flex-shrink: 0;
        color: var(--color-text-muted);
      }

      .wb-list-item--idea .wb-list-item__icon {
        color: var(--color-primary);
      }

      .wb-list-item__title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: var(--font-weight-medium);
      }

      /* ═══════════════════════════════════════════════════════════════
         中间：主工作区（视觉焦点）
      ═══════════════════════════════════════════════════════════════ */
      .wb-main {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--color-workbench-panel);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-workbench-border);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        overflow: hidden;
      }

      /* 焦点面板（已选中） */
      .wb-focus-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .wb-focus-header {
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border-light);
        flex-shrink: 0;
      }

      .wb-focus-type {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        font-size: var(--font-size-xxs);
        font-weight: var(--font-weight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted);
        margin-bottom: var(--space-2);
      }

      .wb-focus-title {
        margin: 0 0 var(--space-2);
        font-size: var(--font-size-xl);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
        line-height: var(--line-height-tight);
      }

      .wb-focus-meta {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      .wb-focus-time {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .wb-focus-desc {
        margin: var(--space-2) 0 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        line-height: var(--line-height-relaxed);
      }

      .wb-focus-block {
        margin-top: var(--space-2);
        padding: var(--space-2) var(--space-3);
        font-size: var(--font-size-sm);
        color: var(--color-warning-soft-text);
        background: var(--color-warning-soft-bg);
        border-radius: var(--radius-md);
      }

      .wb-focus-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--space-4);
      }

      .wb-focus-section {
        margin-bottom: var(--space-4);
      }

      .wb-focus-section:last-child {
        margin-bottom: 0;
      }

      .wb-focus-section-title {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
        margin-bottom: var(--space-2);
        padding-bottom: var(--space-1);
        border-bottom: 1px solid var(--color-border-light);
      }

      .wb-focus-content {
        font-size: var(--font-size-sm);
        line-height: var(--line-height-relaxed);
        color: var(--color-text-secondary);
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* 高亮区块 */
      .wb-focus-section--highlight {
        padding: var(--space-3);
        background: color-mix(in srgb, var(--color-primary-light) 50%, transparent);
        border-radius: var(--radius-md);
        border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
      }

      /* AI 状态 */
      .wb-ai-status {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      .wb-ai-status__action {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }

      .wb-ai-status__next {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      /* 委托表单 */
      .wb-delegate-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .wb-delegate-row {
        display: flex;
        gap: var(--space-2);
      }

      .wb-delegate-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      /* 底部操作栏 */
      .wb-focus-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        padding: var(--space-3) var(--space-4);
        border-top: 1px solid var(--color-border-light);
        flex-shrink: 0;
      }

      /* 空态 */
      .wb-focus-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: var(--space-8);
        text-align: center;
      }

      .wb-focus-empty__illustration {
        width: 5rem;
        height: 5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--space-4);
        background: var(--color-primary-light);
        border-radius: 50%;
        color: var(--color-primary);
      }

      .wb-focus-empty__title {
        margin: 0 0 var(--space-2);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
      }

      .wb-focus-empty__desc {
        margin: 0 0 var(--space-4);
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        line-height: var(--line-height-relaxed);
        max-width: 28rem;
      }

      .wb-focus-empty__hint {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: var(--color-bg);
        border-radius: var(--radius-md);
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      /* ═══════════════════════════════════════════════════════════════
         右侧：辅助信息区
      ═══════════════════════════════════════════════════════════════ */
      .wb-aux {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--color-workbench-panel);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-workbench-border);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        overflow: hidden;
      }

      .wb-aux-section {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }

      .wb-aux-title {
        margin: 0;
        padding: var(--space-3) var(--space-3);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border-light);
        flex-shrink: 0;
      }

      .wb-aux-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--space-3);
      }

      .wb-aux-loading {
        padding: var(--space-3);
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        text-align: center;
      }

      .wb-aux-empty {
        padding: var(--space-4);
        text-align: center;
      }

      .wb-aux-empty p {
        margin: 0 0 var(--space-1);
        font-size: var(--font-size-sm);
        color: var(--color-text);
      }

      .wb-aux-empty span {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .wb-aux-section--placeholder {
        justify-content: center;
        align-items: center;
      }

      .wb-aux-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-4);
        text-align: center;
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .wb-aux-card {
        padding: var(--space-3);
        background: var(--color-bg);
        border-radius: var(--radius-md);
      }

      .wb-aux-card__label {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        margin-bottom: var(--space-1);
      }

      .wb-aux-card__value {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
        margin-bottom: var(--space-2);
      }

      /* 结果时间线 */
      .wb-result-timeline {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .wb-result-item {
        display: flex;
        gap: var(--space-2);
      }

      .wb-result-item__marker {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 0.4rem;
        background: var(--color-border);
      }

      .wb-result-item__marker--success { background: var(--color-success); }
      .wb-result-item__marker--warning { background: var(--color-warning); }
      .wb-result-item__marker--danger { background: var(--color-error); }
      .wb-result-item__marker--info { background: var(--color-primary); }
      .wb-result-item__marker--neutral { background: var(--color-text-muted); }

      .wb-result-item__body {
        flex: 1;
        min-width: 0;
      }

      .wb-result-item__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-1);
      }

      .wb-result-item__action {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
      }

      .wb-result-item__time {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .wb-result-item__status {
        margin-bottom: var(--space-1);
      }

      .wb-result-item__summary {
        margin: 0;
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        line-height: var(--line-height-base);
      }

      .wb-result-item__payload {
        margin-top: var(--space-2);
        font-size: var(--font-size-xxs);
      }

      .wb-result-item__payload summary {
        cursor: pointer;
        color: var(--color-text-muted);
      }

      .wb-result-item__payload pre {
        margin: var(--space-1) 0 0;
        padding: var(--space-2);
        background: var(--color-bg);
        border-radius: var(--radius-sm);
        font-size: var(--font-size-xxs);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 8rem;
      }

      /* ═══════════════════════════════════════════════════════════════
         Overlay
      ═══════════════════════════════════════════════════════════════ */
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
        width: min(380px, 90vw);
        background: var(--color-surface);
        border-left: 1px solid var(--color-border-light);
        box-shadow: var(--shadow-lg);
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
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
      }

      .wb-overlay__body {
        padding: var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .wb-overlay__hint {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0;
      }

      /* ═══════════════════════════════════════════════════════════════
         通用
      ═══════════════════════════════════════════════════════════════ */
      .notice {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .ui-textarea--compact {
        font-size: var(--font-size-sm);
      }

      .ui-input--sm {
        font-size: var(--font-size-sm);
        padding: var(--space-1) var(--space-2);
      }

      /* ═══════════════════════════════════════════════════════════════
         响应式
      ═══════════════════════════════════════════════════════════════ */
      @media (max-width: 1100px) {
        .wb-body {
          grid-template-columns: 180px minmax(0, 1fr) 220px;
        }
      }

      @media (max-width: 960px) {
        .wb {
          padding: var(--space-2) var(--space-3);
        }

        .wb-body {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: minmax(200px, 35vh) minmax(0, 1fr) minmax(150px, 25vh);
        }

        .wb-sidebar {
          max-height: 35vh;
        }

        .wb-filter-tabs {
          flex-direction: row;
          flex-wrap: wrap;
          gap: var(--space-1);
        }

        .wb-filter-tab {
          padding: var(--space-1) var(--space-2);
        }

        .wb-aux {
          max-height: 25vh;
        }

        .wb-topbar__subtitle {
          display: none;
        }
      }

      @media (max-width: 600px) {
        .wb-topbar {
          flex-direction: column;
          align-items: flex-start;
          gap: var(--space-2);
        }

        .wb-topbar__actions {
          width: 100%;
          justify-content: flex-end;
        }

        .wb-focus-empty__desc {
          display: none;
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
