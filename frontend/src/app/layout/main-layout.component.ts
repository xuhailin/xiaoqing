import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { PersonaSummaryComponent } from '../persona/persona-summary.component';
import { ConversationListComponent } from '../conversation/conversation-list.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { ChatQuickActionsComponent } from '../chat/chat-quick-actions.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    PersonaSummaryComponent,
    ConversationListComponent,
    AppTabsComponent,
    AppButtonComponent,
    AppBadgeComponent,
    ChatQuickActionsComponent,
  ],
  template: `
    <div class="layout" [class.layout--no-drawer]="currentPrimary() === 'settings'">
      @if (currentPrimary() !== 'settings') {
        <aside class="drawer">
          @if (currentPrimary() === 'chat') {
            <div class="drawer-content drawer-content--chat">
              <app-chat-quick-actions />
              <div class="drawer-scroll">
                <app-conversation-list />
              </div>
            </div>
          } @else if (currentPrimary() === 'workspace') {
            <div class="drawer-content">
              <div class="drawer-copy">
                <span class="drawer-eyebrow">Workspace</span>
                <div class="drawer-title">执行入口</div>
                <div class="drawer-description">把 Dev、Reminder、Plan 和回归入口收拢到一个工作台里。</div>
              </div>

              <div class="drawer-nav">
                @for (item of workspaceItems; track item.value) {
                  <button
                    type="button"
                    class="drawer-nav__item ui-list-card"
                    [class.is-active]="currentWorkspaceSection() === item.value"
                    [disabled]="item.disabled"
                    (click)="openWorkspaceSection(item.value)"
                  >
                    <span>{{ item.label }}</span>
                    @if (item.disabled) {
                      <app-badge tone="warning" appearance="outline">Later</app-badge>
                    }
                  </button>
                }
              </div>
            </div>
          } @else if (currentPrimary() === 'memory') {
            <div class="drawer-content">
              <app-persona-summary />

              <div class="drawer-copy drawer-copy--memory">
                <span class="drawer-eyebrow">Memory</span>
                <div class="drawer-title">记忆入口</div>
                <div class="drawer-description">用户画像、persona、long memory 与 life record 都在这里分层展示。</div>
              </div>

              <div class="drawer-nav">
                @for (item of memoryItems; track item.value) {
                  <button
                    type="button"
                    class="drawer-nav__item ui-list-card"
                    [class.is-active]="currentMemorySection() === item.value"
                    (click)="openMemorySection(item.value)"
                  >
                    <span>{{ item.label }}</span>
                  </button>
                }
              </div>
            </div>
          }
        </aside>
      }

      <main class="content">
        <div class="workbench-shell">
          <header class="workbench-header">
            <app-tabs
              class="workbench-tabs"
              [items]="mainTabs"
              [value]="currentPrimary() === 'settings' ? '' : currentPrimary()"
              (valueChange)="selectPrimary($event)"
            />

            <div class="workbench-meta">
              <span class="workbench-eyebrow">{{ currentPrimaryLabel() }}</span>
              <div class="workbench-copy">{{ currentPrimaryCopy() }}</div>
            </div>

            <div class="workbench-actions">
              <app-button variant="ghost" size="sm" (click)="openSettings()">设置</app-button>
            </div>
          </header>

          <section class="workbench-stage">
            <router-outlet />
          </section>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .layout {
      display: flex;
      height: 100vh;
      background: var(--color-bg);
      overflow: hidden;
    }

    .layout--no-drawer .content {
      width: 100%;
    }

    .drawer {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      background: var(--sidebar-surface-background);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.45);
    }

    .drawer-content {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      padding: 0 var(--space-3) var(--space-3);
    }

    .drawer-content--chat {
      padding-bottom: 0;
    }

    .drawer-scroll {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .drawer-scroll::-webkit-scrollbar { width: 4px; }
    .drawer-scroll::-webkit-scrollbar-track { background: transparent; }
    .drawer-scroll::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: var(--radius-pill);
    }

    .drawer-copy {
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-border-light);
      margin-bottom: var(--space-3);
    }

    .drawer-copy--memory {
      padding-top: var(--space-2);
    }

    .drawer-eyebrow {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--color-text-muted);
    }

    .drawer-title {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .drawer-description {
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .drawer-nav {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
      overflow: auto;
      padding-bottom: var(--space-3);
    }

    .drawer-nav__item {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 0.75rem 0.875rem;
      text-align: left;
      color: var(--color-text);
      cursor: pointer;
    }

    .drawer-nav__item.is-active {
      border-color: rgba(79, 109, 245, 0.28);
      box-shadow: inset 0 0 0 1px rgba(79, 109, 245, 0.18);
    }

    .content {
      flex: 1;
      overflow: hidden;
      min-width: 0;
      background: var(--workbench-shell-background);
    }

    .workbench-shell {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .workbench-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: var(--space-3);
      padding: var(--workbench-header-padding);
      border-bottom: 1px solid rgba(79, 109, 245, 0.08);
      flex-shrink: 0;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.18));
      backdrop-filter: blur(10px);
    }

    .workbench-tabs {
      flex-wrap: wrap;
      flex: 0 0 auto;
    }

    .workbench-meta {
      color: var(--color-text-secondary);
      min-width: 0;
      flex: 1;
    }

    .workbench-eyebrow {
      display: block;
      margin-bottom: 2px;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .workbench-copy {
      font-size: var(--font-size-xs);
      line-height: 1.45;
    }

    .workbench-actions {
      flex-shrink: 0;
    }

    .workbench-stage {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    @media (max-width: 980px) {
      .layout {
        flex-direction: column;
      }

      .drawer {
        width: 100%;
        min-width: 0;
        max-height: 34vh;
        border-right: none;
        border-bottom: 1px solid var(--color-border);
      }

      .workbench-header {
        flex-direction: column;
        align-items: flex-start;
        padding: var(--workbench-header-padding-mobile);
      }

      .workbench-actions {
        width: 100%;
      }
    }
  `],
})
export class MainLayoutComponent {
  protected readonly mainTabs: AppTabItem[] = [
    { value: 'chat', label: '对话' },
    { value: 'workspace', label: '工作台' },
    { value: 'memory', label: '记忆' },
  ];
  protected readonly workspaceItems = [
    { value: 'dev-agent', label: 'DevAgent', disabled: false },
    { value: 'reminder', label: 'Reminder', disabled: false },
    { value: 'plan', label: 'Todo / Plan', disabled: false },
    { value: 'regression', label: '回归测试', disabled: false },
    { value: 'task-records', label: '任务记录', disabled: true },
  ] as const;
  protected readonly memoryItems = [
    { value: 'profile', label: '用户画像' },
    { value: 'persona', label: 'Persona / System Self' },
    { value: 'memories', label: 'Long Memory' },
    { value: 'life-record', label: 'Life Record' },
    { value: 'cognitive-trace', label: 'Cognitive Trace' },
  ] as const;

  constructor(private readonly router: Router) {}

  currentPrimary(): 'chat' | 'workspace' | 'memory' | 'settings' {
    const url = this.router.url;
    if (url.startsWith('/workspace')) return 'workspace';
    if (url.startsWith('/memory')) return 'memory';
    if (url.startsWith('/settings')) return 'settings';
    return 'chat';
  }

  currentPrimaryLabel() {
    const primary = this.currentPrimary();
    if (primary === 'workspace') return 'Workspace';
    if (primary === 'memory') return 'Memory';
    if (primary === 'settings') return 'Settings';
    return 'Chat';
  }

  currentPrimaryCopy() {
    const primary = this.currentPrimary();
    if (primary === 'workspace') {
      return '执行能力与工作台入口统一收敛到这里。';
    }
    if (primary === 'memory') {
      return '用户画像、persona、long memory 与 life record 的独立分层。';
    }
    if (primary === 'settings') {
      return '模型、token、agent 与外部服务配置的只读总览。';
    }
    return '聊天主区与快捷操作分层展示。';
  }

  currentWorkspaceSection(): string {
    const url = this.router.url;
    if (url.startsWith('/workspace/reminder')) return 'reminder';
    if (url.startsWith('/workspace/plan')) return 'plan';
    if (url.startsWith('/workspace/regression')) return 'regression';
    if (url.startsWith('/workspace/task-records')) return 'task-records';
    return 'dev-agent';
  }

  currentMemorySection(): string {
    const url = this.router.url;
    if (url.startsWith('/memory/persona')) return 'persona';
    if (url.startsWith('/memory/memories')) return 'memories';
    if (url.startsWith('/memory/life-record')) return 'life-record';
    if (url.startsWith('/memory/cognitive-trace')) return 'cognitive-trace';
    return 'profile';
  }

  selectPrimary(value: string) {
    if (value === 'workspace') {
      this.router.navigate(['/workspace/dev-agent']);
      return;
    }
    if (value === 'memory') {
      this.router.navigate(['/memory/profile']);
      return;
    }
    this.router.navigate(['/chat']);
  }

  openWorkspaceSection(value: string) {
    const item = this.workspaceItems.find((entry) => entry.value === value);
    if (!item || item.disabled) return;
    this.router.navigate([`/workspace/${value}`]);
  }

  openMemorySection(value: string) {
    this.router.navigate([`/memory/${value}`]);
  }

  openSettings() {
    this.router.navigate(['/settings']);
  }
}
