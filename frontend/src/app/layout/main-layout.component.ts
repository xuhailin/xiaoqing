import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { XiaoqingAvatarComponent } from '../shared/ui/xiaoqing-avatar.component';

type ChatSubNavItem = {
  value: 'chat' | 'xiaoqin';
  label: string;
  disabled?: boolean;
};

type WorkspaceSubNavItem = {
  value: 'dev-agent' | 'reminder' | 'plan' | 'regression' | 'task-records';
  label: string;
  disabled?: boolean;
};

type MemorySubNavItem = {
  value: 'life-record' | 'cognitive-trace' | 'memories' | 'profile';
  label: string;
  disabled?: boolean;
};

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, AppButtonComponent, AppIconComponent, XiaoqingAvatarComponent],
  template: `
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="app-brand-card">
          <button type="button" class="app-brand app-brand--compact" (click)="selectPrimary('chat')" title="小晴">
            <app-xiaoqing-avatar class="app-brand__avatar" size="2.75rem" />
          </button>
        </div>

        <nav class="app-nav" aria-label="主导航">
          @for (item of mainNavItems; track item.value) {
            <button
              type="button"
              class="app-nav__item"
              [class.app-nav__item--active]="currentPrimary() === item.value"
              [attr.title]="item.label"
              (click)="selectPrimary(item.value)"
            >
              <span class="app-nav__icon">
                <app-icon [name]="item.icon" size="1.05rem" />
              </span>
              <span class="app-nav__sr">{{ item.label }}</span>
            </button>
          }
        </nav>

        <div class="app-sidebar__footer">
          <app-button type="button" variant="ghost" size="sm" class="app-settings-btn" (click)="openSettings()" title="配置">
            <span class="app-settings-btn__icon">
              <app-icon name="tool" size="0.95rem" />
            </span>
          </app-button>
        </div>
      </aside>

      <main class="app-main">
        <div class="app-main__chrome">
          @if (shouldShowSubnav()) {
            <div class="app-subnav-wrap">
              @if (currentPrimary() === 'chat') {
                <nav class="app-subnav" aria-label="对话二级导航">
                  @for (item of chatSubNavItems; track item.value) {
                    <button
                      type="button"
                      class="app-subnav__item"
                      [class.app-subnav__item--active]="currentChatSubnav() === item.value"
                      [disabled]="item.disabled"
                      (click)="selectChatSubnav(item.value)"
                    >
                      @if (item.value === 'chat') {
                        <app-xiaoqing-avatar class="app-subnav__avatar" size="1.15rem" iconSize="0.7rem" />
                      }
                      <span>{{ item.label }}</span>
                      @if (item.disabled) {
                        <span class="app-subnav__coming">即将开放</span>
                      }
                    </button>
                  }
                </nav>
              }

              @if (currentPrimary() === 'workspace') {
                <nav class="app-subnav" aria-label="工作台二级导航">
                  @for (item of workspaceSubNavItems; track item.value) {
                    <button
                      type="button"
                      class="app-subnav__item"
                      [class.app-subnav__item--active]="currentWorkspaceSubnav() === item.value"
                      [disabled]="item.disabled"
                      (click)="selectWorkspaceSubnav(item.value)"
                    >
                      <span>{{ item.label }}</span>
                    </button>
                  }
                </nav>
              }

              @if (currentPrimary() === 'memory') {
                <nav class="app-subnav" aria-label="记忆二级导航">
                  @for (item of memorySubNavItems; track item.value) {
                    <button
                      type="button"
                      class="app-subnav__item"
                      [class.app-subnav__item--active]="currentMemorySubnav() === item.value"
                      [disabled]="item.disabled"
                      (click)="selectMemorySubnav(item.value)"
                    >
                      <span>{{ item.label }}</span>
                    </button>
                  }
                </nav>
              }

              <div class="app-subnav__meta">小晴陪你聊天、记事、提醒，也能自然衔接执行。</div>
            </div>
          }

          <div
            class="app-main__content"
            [class.app-main__content--chat]="currentPrimary() === 'chat'"
            [class.app-main__content--default]="currentPrimary() !== 'chat'"
          >
            <router-outlet />
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      min-height: 0;
      background: var(--color-bg);
    }

    .app-shell {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr);
      gap: 0;
      padding: 0;
      background: linear-gradient(180deg, #f8fafe 0%, #f2f6fc 100%);
    }

    .app-sidebar,
    .app-main {
      min-width: 0;
      min-height: 0;
    }

    .app-sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-2);
      border-right: 1px solid var(--color-workbench-border);
      background: var(--sidebar-surface-background);
    }

    .app-brand-card {
      display: flex;
      justify-content: center;
      padding: 0 0 var(--space-3);
      border-bottom: 1px solid var(--color-border-light);
    }

    .app-brand {
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      padding: 0;
      cursor: pointer;
    }

    .app-brand__avatar {
      filter: saturate(0.96);
    }

    .app-nav {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      align-items: center;
    }

    .app-nav__item {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: var(--space-2) 0;
      border: none;
      border-left: 2px solid transparent;
      background: transparent;
      color: var(--color-text-secondary);
      cursor: pointer;
      text-align: center;
      transition:
        background var(--transition-base),
        border-color var(--transition-base),
        color var(--transition-base);
    }

    .app-nav__item:hover {
      color: var(--color-text);
      background: var(--color-workbench-accent);
    }

    .app-nav__item--active {
      color: var(--color-primary);
      border-left-color: var(--color-primary);
      background: linear-gradient(90deg, var(--color-primary-light), transparent 78%);
      box-shadow: inset 1px 0 0 var(--color-workbench-accent-strong);
    }

    .app-nav__icon {
      width: 2rem;
      height: 2rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      background: transparent;
      color: currentColor;
      flex-shrink: 0;
    }

    .app-nav__item--active .app-nav__icon {
      background: var(--color-workbench-accent-strong);
    }

    .app-nav__sr {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .app-sidebar__footer {
      margin-top: auto;
    }

    .app-settings-btn {
      width: 100%;
      justify-content: center;
      min-height: 40px;
      border-radius: var(--radius-md);
      background: transparent;
      border: 1px solid var(--color-workbench-border);
      padding: 0;
    }

    .app-settings-btn__icon {
      width: auto;
      display: inline-flex;
      justify-content: center;
    }

    .app-main {
      overflow: hidden;
      background: #edf2fa;
    }

    .app-main__chrome {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .app-subnav-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: 0.9rem 1.15rem;
      border-bottom: 1px solid var(--color-border-light);
      background: transparent;
      flex-shrink: 0;
    }

    .app-subnav {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem;
      border-radius: 999px;
      border: 1px solid var(--color-border);
      background: var(--workbench-header-background);
      box-shadow: var(--shadow-sm);
    }

    .app-subnav__item {
      border: none;
      background: transparent;
      color: #56657d;
      min-height: 38px;
      padding: 0 1rem;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition:
        background var(--transition-base),
        color var(--transition-fast),
        box-shadow var(--transition-base);
    }

    .app-subnav__avatar {
      filter: saturate(0.96);
    }

    .app-subnav__item:hover:not(:disabled) {
      color: var(--color-text);
      background: var(--color-primary-light);
    }

    .app-subnav__item--active {
      color: var(--color-primary);
      background: var(--color-surface);
      box-shadow: inset 0 0 0 1px var(--color-border-light);
    }

    .app-subnav__item:disabled {
      cursor: default;
      opacity: 0.7;
    }

    .app-subnav__coming {
      font-size: 0.68rem;
      font-weight: var(--font-weight-medium);
      opacity: 0.76;
    }

    .app-subnav__meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .app-main__content {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .app-main__content--chat {
      background: transparent;
    }

    .app-main__content--default {
      background: var(--color-bg);
    }

    @media (max-width: 980px) {
      .app-shell {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .app-sidebar {
        padding: var(--space-3);
        border-right: none;
        border-bottom: 1px solid var(--color-workbench-border);
        flex-direction: row;
        align-items: center;
      }

      .app-nav {
        flex: 1;
        flex-direction: row;
        justify-content: center;
      }

      .app-nav__item {
        padding: var(--space-2) 0;
        border-left: none;
        border-bottom: 2px solid transparent;
      }

      .app-nav__item--active {
        border-left-color: transparent;
        border-bottom-color: var(--color-primary);
      }

      .app-subnav-wrap {
        flex-direction: column;
        align-items: stretch;
      }

      .app-subnav {
        width: 100%;
        overflow-x: auto;
      }

      .app-subnav__meta {
        display: none;
      }
    }
  `],
})
export class MainLayoutComponent {
  protected readonly mainNavItems = [
    { value: 'chat', label: '对话', hint: '会话与陪伴', icon: 'message' as const },
    { value: 'workspace', label: '工作台', hint: '提醒与执行', icon: 'tool' as const },
    { value: 'memory', label: '记忆', hint: '画像与轨迹', icon: 'brain' as const },
  ];
  protected readonly chatSubNavItems: readonly ChatSubNavItem[] = [
    { value: 'chat', label: '小晴' },
    { value: 'xiaoqin', label: '小勤', disabled: true },
  ];
  protected readonly workspaceSubNavItems: readonly WorkspaceSubNavItem[] = [
    { value: 'dev-agent', label: 'DevAgent' },
    { value: 'reminder', label: 'Reminder' },
    { value: 'plan', label: 'Todo / Plan' },
    { value: 'regression', label: '回归测试' },
    { value: 'task-records', label: '任务记录' },
  ];
  protected readonly memorySubNavItems: readonly MemorySubNavItem[] = [
    { value: 'life-record', label: '生活' },
    { value: 'cognitive-trace', label: '认知' },
    { value: 'memories', label: '记忆' },
    { value: 'profile', label: '用户画像' },
  ];

  constructor(private readonly router: Router) {}

  currentPrimary(): 'chat' | 'workspace' | 'memory' {
    const url = this.router.url;
    if (url.startsWith('/workspace')) return 'workspace';
    if (url.startsWith('/memory')) return 'memory';
    return 'chat';
  }

  selectPrimary(value: string) {
    if (value === 'workspace') {
      this.router.navigate(['/workspace']);
      return;
    }
    if (value === 'memory') {
      this.router.navigate(['/memory']);
      return;
    }
    this.router.navigate(['/chat']);
  }

  shouldShowSubnav(): boolean {
    const primary = this.currentPrimary();
    return primary === 'chat' || primary === 'workspace' || primary === 'memory';
  }

  currentChatSubnav(): 'chat' | 'xiaoqin' {
    return 'chat';
  }

  selectChatSubnav(value: 'chat' | 'xiaoqin') {
    if (value === 'xiaoqin') {
      return;
    }
    this.router.navigate(['/chat']);
  }

  currentWorkspaceSubnav(): 'dev-agent' | 'reminder' | 'plan' | 'regression' | 'task-records' {
    const url = this.router.url;
    if (url.startsWith('/workspace/reminder')) return 'reminder';
    if (url.startsWith('/workspace/plan')) return 'plan';
    if (url.startsWith('/workspace/regression')) return 'regression';
    if (url.startsWith('/workspace/task-records')) return 'task-records';
    return 'dev-agent';
  }

  selectWorkspaceSubnav(value: 'dev-agent' | 'reminder' | 'plan' | 'regression' | 'task-records') {
    this.router.navigate([`/workspace/${value}`]);
  }

  currentMemorySubnav(): 'life-record' | 'cognitive-trace' | 'memories' | 'profile' {
    const url = this.router.url;
    if (url.startsWith('/memory/cognitive-trace')) return 'cognitive-trace';
    if (url.startsWith('/memory/memories')) return 'memories';
    if (url.startsWith('/memory/profile')) return 'profile';
    return 'life-record';
  }

  selectMemorySubnav(value: 'life-record' | 'cognitive-trace' | 'memories' | 'profile') {
    this.router.navigate([`/memory/${value}`]);
  }

  openSettings() {
    this.router.navigate(['/settings']);
  }
}
