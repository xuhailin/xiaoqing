import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AppButtonComponent } from '../../ui/app-button.component';
import { AppStateComponent } from '../../ui/app-state.component';
import type { AgentSession } from './agent-session.types';

/**
 * 通用 Agent 会话布局组件，供 DevAgent / DesignAgent 等共用。
 *
 * 用法：
 *   <app-agent-chat
 *     [sessions]="sessions"
 *     [activeSession]="activeSession"
 *     (selectSession)="onSelect($event)"
 *     (newSession)="onNew()"
 *   >
 *     <!-- 右侧主内容由各 agent 页面填充 -->
 *   </app-agent-chat>
 */
@Component({
  selector: 'app-agent-chat',
  standalone: true,
  imports: [AppButtonComponent, AppStateComponent],
  template: `
    <div class="agent-chat">
      <!-- 左侧：会话列表 -->
      <aside class="agent-chat__sidebar">
        <header class="sidebar-header">
          <span class="sidebar-title">会话列表</span>
          <app-button variant="ghost" size="sm" (click)="newSession.emit()">新建</app-button>
        </header>

        <div class="session-list ui-scrollbar">
          @if (!sessions.length) {
            <app-state
              [compact]="true"
              title="暂无会话"
              description="点击右上角新建开始第一个会话。"
            />
          } @else {
            @for (session of sessions; track session.id) {
              <button
                type="button"
                class="session-item ui-list-card"
                [class.is-active]="activeSession?.id === session.id"
                [class.is-running]="session.status === 'running'"
                (click)="selectSession.emit(session)"
              >
                <div class="session-item__running-bar"></div>

                <div class="session-item__content">
                  <div class="session-item__head">
                    <span class="status-dot status-dot--{{ session.status }}"></span>
                    <span class="session-item__title">{{ session.title || '新会话' }}</span>
                  </div>

                  <div class="session-item__meta">
                    <span class="session-item__time">{{ formatTime(session.createdAt) }}</span>
                    @if (session.lastMessage) {
                      <span class="session-item__last">{{ session.lastMessage }}</span>
                    }
                  </div>
                </div>
              </button>
            }
          }
        </div>
      </aside>

      <!-- 右侧：由各 agent 页面填充 -->
      <section class="agent-chat__main">
        <ng-content />
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .agent-chat {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: var(--agent-chat-sidebar-width, 260px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
    }

    // ── 侧边栏 ────────────────────────────────

    .agent-chat__sidebar {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border: 1px solid var(--color-border-light);
      border-radius: var(--workbench-card-radius);
      background: var(--color-panel-subtle-bg);
      overflow: hidden;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border-light);
      background: var(--workbench-header-background);
      backdrop-filter: blur(12px);
      flex-shrink: 0;
    }

    .sidebar-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text);
    }

    .session-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
    }

    // ── 会话卡片 ────────────────────────────────

    .session-item {
      position: relative;
      width: 100%;
      padding: var(--workbench-card-padding);
      text-align: left;
      color: var(--color-text);
      cursor: pointer;
      display: flex;
      align-items: stretch;
      gap: 0;
      overflow: hidden;
    }

    .session-item__running-bar {
      display: none;
      width: 2px;
      flex-shrink: 0;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      margin-right: var(--space-2);
    }

    .session-item.is-running .session-item__running-bar {
      display: block;
      animation: running-bar-pulse 1.4s ease-in-out infinite;
    }

    @keyframes running-bar-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .session-item__content {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .session-item__head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .session-item__title {
      flex: 1 1 auto;
      min-width: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 1.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-item__meta {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .session-item__time {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .session-item__last {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .session-item.is-active .session-item__title {
      color: var(--color-primary);
    }

    // ── 状态色点 ────────────────────────────────

    .status-dot {
      flex-shrink: 0;
      width: 6px;
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--color-border);
    }

    .status-dot--running {
      background: var(--color-primary);
      animation: dot-pulse 1.4s ease-in-out infinite;
    }

    .status-dot--success {
      background: var(--color-success);
    }

    .status-dot--failed {
      background: var(--color-error);
    }

    @keyframes dot-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    // ── 主内容区 ────────────────────────────────

    .agent-chat__main {
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-workbench-border);
      border-radius: var(--workbench-card-radius);
      background: var(--workbench-surface-gradient);
      box-shadow: var(--workbench-surface-shadow);
      overflow: hidden;
    }

    // ── 响应式 ────────────────────────────────

    @media (max-width: 900px) {
      .agent-chat {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .agent-chat__sidebar {
        max-height: 220px;
      }
    }
  `],
})
export class AgentChatComponent {
  @Input() sessions: AgentSession[] = [];
  @Input() activeSession: AgentSession | null = null;

  @Output() selectSession = new EventEmitter<AgentSession>();
  @Output() newSession = new EventEmitter<void>();

  protected formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }
}
