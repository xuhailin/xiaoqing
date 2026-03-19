import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';
import { XiaoqingAvatarComponent } from '../shared/ui/xiaoqing-avatar.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, AppTabsComponent, AppButtonComponent, AppIconComponent, XiaoqingAvatarComponent],
  template: `
    <div class="app-shell">
      <header class="app-header">
        <div class="app-header__inner">
          <div class="app-brand">
            <app-xiaoqing-avatar class="app-brand__avatar" size="2.25rem" />
            <div class="app-brand__copy">
              <span class="app-brand__name">小晴</span>
              <span class="app-brand__tagline">聊天为主，能力自然融入</span>
            </div>
          </div>

          <app-tabs
            class="app-nav"
            [items]="mainTabs"
            [value]="currentPrimary()"
            [appearance]="'primary'"
            (valueChange)="selectPrimary($event)"
          />

          <div class="app-header__actions">
            <app-button type="button" variant="ghost" size="sm" (click)="openSettings()">
              <app-icon name="tool" size="0.95rem" />
              <span>配置</span>
            </app-button>
          </div>
        </div>
      </header>

      <main class="app-main">
        <router-outlet />
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
      display: flex;
      flex-direction: column;
      background: var(--workbench-shell-background);
    }

    .app-header {
      padding: 0 calc(var(--workbench-shell-padding) + var(--space-2));
      border-bottom: 1px solid rgba(96, 122, 170, 0.08);
      background: transparent;
      flex-shrink: 0;
    }

    .app-header__inner {
      display: flex;
      align-items: center;
      gap: var(--space-5);
      min-height: 56px;
    }

    .app-brand {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
      flex-shrink: 0;
    }

    .app-brand__copy {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-width: 0;
    }

    .app-brand__avatar {
      filter: saturate(0.94);
    }

    .app-brand__name {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-bold);
      letter-spacing: 0.01em;
      color: var(--color-text);
    }

    .app-brand__tagline {
      font-size: var(--font-size-xxs);
      color: rgba(79, 109, 245, 0.72);
      white-space: nowrap;
    }

    .app-nav {
      display: flex;
      min-width: 0;
      max-width: 100%;
      margin-left: var(--space-2);
    }

    .app-header__actions {
      margin-left: auto;
      display: flex;
      align-items: center;
    }

    .app-main {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    @media (max-width: 980px) {
      .app-header {
        padding: var(--space-4);
      }

      .app-header__inner {
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: var(--space-3);
      }

      .app-brand {
        align-items: flex-start;
      }

      .app-nav {
        margin-left: 0;
      }

      .app-header__actions {
        margin-left: 0;
      }

      .app-brand__tagline {
        white-space: normal;
      }
    }
  `],
})
export class MainLayoutComponent {
  protected readonly mainTabs: AppTabItem[] = [
    { value: 'chat', label: '对话', icon: 'message' },
    { value: 'workspace', label: '工作台', icon: 'tool' },
    { value: 'memory', label: '记忆', icon: 'brain' },
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

  openSettings() {
    this.router.navigate(['/settings']);
  }
}
