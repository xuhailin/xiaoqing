import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MemoryListComponent } from '../memory/memory-list.component';
import { PersonaSummaryComponent } from '../persona/persona-summary.component';
import { PersonaConfigComponent } from '../persona/persona-config.component';
import { ConversationListComponent } from '../conversation/conversation-list.component';
import { IdentityAnchorEditorComponent } from '../identity-anchor/identity-anchor-editor.component';
import { DebugDashboardComponent } from '../debug/debug-dashboard.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    MemoryListComponent,
    PersonaSummaryComponent,
    PersonaConfigComponent,
    ConversationListComponent,
    IdentityAnchorEditorComponent,
    DebugDashboardComponent,
    AppTabsComponent,
  ],
  template: `
    <div class="layout">
      <aside class="drawer">
        <app-persona-summary />
        <app-tabs
          class="tab-bar"
          [items]="drawerTabs"
          [value]="tab()"
          [fullWidth]="true"
          [size]="'sm'"
          (valueChange)="tab.set($any($event))"
        />
        <div class="tab-content">
          @if (tab() === 'conversations') {
            <app-conversation-list />
          } @else if (tab() === 'memory') {
            <app-memory-list />
          } @else if (tab() === 'persona') {
            <app-persona-config />
          } @else if (tab() === 'identity') {
            <app-identity-anchor-editor />
          } @else if (tab() === 'debug') {
            <app-debug-dashboard />
          }
        </div>
      </aside>
      <main class="content">
        <div class="workbench-shell">
          <header class="workbench-header">
            <app-tabs
              class="workbench-tabs"
              [items]="workbenchTabs"
              [value]="currentWorkbench()"
              (valueChange)="selectWorkbench($event)"
            />

            <div class="workbench-meta">
              <span class="workbench-eyebrow">Main Area</span>
              <div class="workbench-copy">
                @if (currentWorkbench() === 'chat') {
                  当前对话与调试信息
                } @else if (currentWorkbench() === 'dev-agent') {
                  开发执行与 sessions 状态
                } @else {
                  固定回归与真实回放报告
                }
              </div>
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

    .drawer {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      background: var(--color-sidebar);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .tab-bar {
      margin: 0 var(--space-3) var(--space-2);
      flex-shrink: 0;
    }

    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 0 var(--space-3) var(--space-3);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .tab-content::-webkit-scrollbar { width: 4px; }
    .tab-content::-webkit-scrollbar-track { background: transparent; }
    .tab-content::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: var(--radius-pill);
    }

    .content {
      flex: 1;
      overflow: hidden;
      min-width: 0;
      background:
        radial-gradient(circle at top right, rgba(92, 103, 242, 0.05), transparent 24%),
        linear-gradient(180deg, var(--color-workbench-bg) 0%, #f3efe7 100%);
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
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5) var(--space-4);
      border-bottom: 1px solid rgba(120, 111, 96, 0.08);
      flex-shrink: 0;
    }

    .workbench-tabs {
      flex-wrap: wrap;
    }

    .workbench-meta {
      text-align: right;
      color: var(--color-text-secondary);
      flex-shrink: 0;
    }

    .workbench-eyebrow {
      display: block;
      margin-bottom: 4px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .workbench-copy {
      font-size: var(--font-size-sm);
      line-height: 1.5;
    }

    .workbench-stage {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    @media (max-width: 980px) {
      .workbench-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .workbench-meta {
        text-align: left;
      }
    }
  `],
})
export class MainLayoutComponent {
  tab = signal<'conversations' | 'memory' | 'persona' | 'identity' | 'debug'>('conversations');
  protected readonly drawerTabs: AppTabItem[] = [
    { value: 'conversations', label: '对话' },
    { value: 'memory', label: '记忆' },
    { value: 'persona', label: '人格' },
    { value: 'identity', label: '用户' },
    { value: 'debug', label: '调试' },
  ];
  protected readonly workbenchTabs: AppTabItem[] = [
    { value: 'chat', label: '对话' },
    { value: 'dev-agent', label: 'DevAgent' },
    { value: 'regression', label: '回归' },
  ];

  constructor(private router: Router) {}

  currentWorkbench(): 'chat' | 'dev-agent' | 'regression' {
    const url = this.router.url;
    if (url.startsWith('/dev-agent')) {
      return 'dev-agent';
    }
    if (url.startsWith('/regression')) {
      return 'regression';
    }
    return 'chat';
  }

  openChat() {
    this.router.navigate(['/']);
  }

  selectWorkbench(value: string) {
    if (value === 'dev-agent') {
      this.openDevAgent();
      return;
    }
    if (value === 'regression') {
      this.openRegression();
      return;
    }
    this.openChat();
  }

  openDevAgent() {
    this.router.navigate(['/dev-agent']);
  }

  openRegression() {
    this.router.navigate(['/regression']);
  }
}
