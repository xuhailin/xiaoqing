import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent, type AppIconName } from '../shared/ui/app-icon.component';
import { XiaoqingAvatarComponent } from '../shared/ui/xiaoqing-avatar.component';
import { ThemeService } from '../core/services/theme.service';

type ChatSubNavItem = {
  value: 'chat' | 'dev-agent' | 'xiaoqin';
  label: string;
  description: string;
  icon: AppIconName;
  disabled?: boolean;
};

type WorkspaceSubNavItem = {
  value: 'ideas' | 'reminder' | 'plan' | 'todos' | 'execution';
  label: string;
  description: string;
  icon: AppIconName;
  disabled?: boolean;
};

type MemorySubNavItem = {
  value: 'life-record' | 'cognitive-trace' | 'memories' | 'profile' | 'relations';
  label: string;
  description: string;
  icon: AppIconName;
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
          <app-button
            type="button"
            variant="ghost"
            size="sm"
            class="app-sidebar__utility"
            (click)="toggleTheme()"
            [title]="themeToggleTitle()"
          >
            <span class="app-sidebar__utility-icon">
              <app-icon [name]="currentTheme() === 'dark' ? 'sun' : 'moon'" size="0.95rem" />
            </span>
          </app-button>

          <app-button
            type="button"
            variant="ghost"
            size="sm"
            class="app-sidebar__utility"
            (click)="openSettings()"
            title="配置"
          >
            <span class="app-sidebar__utility-icon">
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
                      <app-icon class="app-subnav__icon" [name]="item.icon" size="0.95rem" />
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
                      <app-icon class="app-subnav__icon" [name]="item.icon" size="0.95rem" />
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
                      <app-icon class="app-subnav__icon" [name]="item.icon" size="0.95rem" />
                      <span>{{ item.label }}</span>
                    </button>
                  }
                </nav>
              }

              <div class="app-subnav__meta">
                @if (currentPageHeader(); as header) {
                  <div class="app-subnav__title">{{ header.title }}</div>
                  <div class="app-subnav__description">{{ header.description }}</div>
                }
              </div>
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
      background: var(--workbench-shell-background);
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
      box-shadow: var(--sidebar-surface-shadow);
    }

    .app-brand-card {
      display: flex;
      justify-content: center;
      padding: 0 0 var(--space-3);
      border-bottom: 1px solid var(--layout-sidebar-divider);
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
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .app-sidebar__utility {
      width: 100%;
      justify-content: center;
      min-height: 40px;
      border-radius: var(--radius-md);
      background: transparent;
      border: 1px solid var(--layout-sidebar-utility-border);
      padding: 0;
    }

    .app-sidebar__utility-icon {
      width: auto;
      display: inline-flex;
      justify-content: center;
    }

    .app-main {
      overflow: hidden;
      background: var(--layout-main-background);
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
      padding: var(--workbench-header-padding);
      border-bottom: 1px solid var(--layout-subnav-wrap-border);
      background: var(--layout-subnav-wrap-bg);
      box-shadow: var(--layout-subnav-wrap-shadow);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      flex-shrink: 0;
    }

    .app-subnav {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1);
      border-radius: var(--radius-xl);
      border: 1px solid var(--layout-subnav-border);
      background: var(--layout-subnav-bg);
      box-shadow: var(--layout-subnav-shadow);
    }

    .app-subnav__item {
      border: none;
      background: transparent;
      color: var(--color-text-secondary);
      min-height: 36px;
      padding: 0 var(--space-4);
      border-radius: var(--radius-md);
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition:
        background var(--transition-base),
        color var(--transition-fast),
        border-color var(--transition-base),
        box-shadow var(--transition-base);
    }

    .app-subnav__item:hover:not(:disabled) {
      color: var(--color-text);
      background: var(--layout-subnav-item-hover-bg);
    }

    .app-subnav__item--active {
      color: var(--color-primary);
      background: var(--layout-subnav-item-active-bg);
      box-shadow: var(--layout-subnav-item-active-shadow);
    }

    .app-subnav__item:disabled {
      cursor: default;
      opacity: 0.7;
    }

    .app-subnav__coming {
      font-size: var(--font-size-xxs);
      font-weight: var(--font-weight-medium);
      opacity: 0.76;
    }

    .app-subnav__meta {
      margin-left: auto;
      flex: 0 1 32rem;
      min-width: 0;
      text-align: right;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .app-subnav__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
    }

    .app-subnav__description {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      line-height: 1.5;
      white-space: normal;
    }

    .app-main__content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }

    .app-main__content--chat {
      background: var(--layout-chat-content-background);
    }

    .app-main__content--default {
      background: var(--layout-default-content-background);
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

      .app-sidebar__footer {
        margin-top: 0;
        margin-left: auto;
        flex-direction: row;
      }

      .app-sidebar__utility {
        width: 40px;
        min-width: 40px;
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
        padding: var(--workbench-header-padding-mobile);
      }

      .app-subnav {
        width: 100%;
        overflow-x: auto;
      }

      .app-subnav__meta {
        margin-left: 0;
        flex: 1 1 auto;
        text-align: left;
      }
    }
  `],
})
export class MainLayoutComponent {
  private readonly router = inject(Router);
  protected readonly themeService = inject(ThemeService);
  protected readonly mainNavItems = [
    { value: 'chat', label: '对话', hint: '会话与陪伴', icon: 'message' as const },
    { value: 'workspace', label: '工作台', hint: '收纳与执行', icon: 'layoutTemplate' as const },
    { value: 'memory', label: '记忆', hint: '画像与轨迹', icon: 'brain' as const },
  ];
  protected readonly chatSubNavItems: readonly ChatSubNavItem[] = [
    { value: 'chat', label: '小晴', icon: 'openai', description: '小晴陪你聊天、记事、提醒，也能自然衔接执行。' },
    { value: 'dev-agent', label: 'devAgent', icon: 'claude', description: 'DevAgent 面板聚焦执行会话、workspace 上下文和开发协作。' },
    { value: 'xiaoqin', label: '小勤', icon: 'claw', description: '小勤侧的对话入口用于承接偏执行、排障和协作类工作。' },
  ];
  protected readonly workspaceSubNavItems: readonly WorkspaceSubNavItem[] = [
    {
      value: 'ideas',
      label: '想法',
      icon: 'lightbulb',
      description: '先收纳灵感、念头和暂不执行的计划，再决定是否升级成待办。',
    },
    {
      value: 'reminder',
      label: '提醒',
      icon: 'bell',
      description: '直接管理固定提醒和周期提醒，不经过对话和 LLM。',
    },
    {
      value: 'plan',
      label: '计划',
      icon: 'calendarCheck',
      description: '统一查看提醒型、执行型和 noop 计划，以及最近触发记录。',
    },
    {
      value: 'todos',
      label: '待办',
      icon: 'check',
      description: '管理用户自己的事项、承诺和需要跟进的内容，执行只是它的下游动作。',
    },
    {
      value: 'execution',
      label: '执行',
      icon: 'route',
      description: '查看现有 Task 执行链里的结果和流水，不改变底层执行体系。',
    },
  ];
  protected readonly memorySubNavItems: readonly MemorySubNavItem[] = [
    {
      value: 'life-record',
      label: '生活',
      icon: 'footprints',
      description: '把对话里的事件、情绪、人物和计划串成一条可浏览的生活轨迹。',
    },
    {
      value: 'cognitive-trace',
      label: '认知',
      icon: 'brain',
      description: '查看小晴自己的认知变化，包括感知、记忆、决策与演进轨迹。',
    },
    {
      value: 'memories',
      label: '记忆',
      icon: 'bookmark',
      description: '阶段记忆、长期记忆与待确认成长记录统一放在这里。',
    },
    {
      value: 'profile',
      label: '用户画像',
      icon: 'userCircle',
      description: '身份锚定、默认偏好与用户相关记忆都在这里维护。',
    },
    {
      value: 'relations',
      label: '关系',
      icon: 'heartPulse',
      description: '把你身边的人、你们的互动状态和共同经历放到一张可浏览的关系地图里。',
    },
  ];
  currentPrimary(): 'chat' | 'workspace' | 'memory' {
    const url = this.router.url;
    if (url.startsWith('/workspace/dev-agent')) return 'chat';
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

  currentChatSubnav(): 'chat' | 'dev-agent' | 'xiaoqin' {
    const url = this.router.url;
    if (url.startsWith('/workspace/dev-agent')) {
      return 'dev-agent';
    }
    if (url.startsWith('/chat') && /[?&]entryAgentId=xiaoqin\b/.test(url)) {
      return 'xiaoqin';
    }
    return 'chat';
  }

  selectChatSubnav(value: 'chat' | 'dev-agent' | 'xiaoqin') {
    if (value === 'dev-agent') {
      this.router.navigate(['/workspace/dev-agent']);
      return;
    }
    if (value === 'xiaoqin') {
      this.router.navigate(['/chat'], { queryParams: { entryAgentId: 'xiaoqin' } });
      return;
    }
    this.router.navigate(['/chat'], { queryParams: {} });
  }

  currentWorkspaceSubnav(): 'ideas' | 'reminder' | 'plan' | 'todos' | 'execution' {
    const url = this.router.url;
    if (url.startsWith('/workspace/ideas')) return 'ideas';
    if (url.startsWith('/workspace/reminder')) return 'reminder';
    if (url.startsWith('/workspace/plan')) return 'plan';
    if (url.startsWith('/workspace/execution') || url.startsWith('/workspace/task-records') || url.startsWith('/workspace/dev-agent') || url.startsWith('/workspace/regression')) return 'execution';
    return 'todos';
  }

  selectWorkspaceSubnav(value: 'ideas' | 'reminder' | 'plan' | 'todos' | 'execution') {
    this.router.navigate([`/workspace/${value}`]);
  }

  currentMemorySubnav(): 'life-record' | 'cognitive-trace' | 'memories' | 'profile' | 'relations' {
    const url = this.router.url;
    if (url.startsWith('/memory/relations')) return 'relations';
    if (url.startsWith('/memory/cognitive-trace')) return 'cognitive-trace';
    if (url.startsWith('/memory/memories')) return 'memories';
    if (url.startsWith('/memory/profile')) return 'profile';
    return 'life-record';
  }

  selectMemorySubnav(value: 'life-record' | 'cognitive-trace' | 'memories' | 'profile' | 'relations') {
    this.router.navigate([`/memory/${value}`]);
  }

  currentPageHeader(): { title: string; description: string } {
    const primary = this.currentPrimary();
    if (primary === 'chat') {
      return this.findPageHeader('对话', this.chatSubNavItems, this.currentChatSubnav());
    }
    if (primary === 'workspace') {
      return this.findPageHeader('工作台', this.workspaceSubNavItems, this.currentWorkspaceSubnav());
    }
    return this.findPageHeader('记忆', this.memorySubNavItems, this.currentMemorySubnav());
  }

  openSettings() {
    this.router.navigate(['/settings']);
  }

  currentTheme() {
    return this.themeService.theme();
  }

  themeToggleTitle() {
    return this.currentTheme() === 'dark' ? '切换到浅色主题' : '切换到深色主题';
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  private findPageHeader<T extends { value: string; label: string; description: string }>(
    eyebrow: string,
    items: readonly T[],
    value: string,
  ) {
    const item = items.find((candidate) => candidate.value === value) ?? items[0];
    return {
      title: eyebrow,
      description: item?.description ?? '',
    };
  }
}
