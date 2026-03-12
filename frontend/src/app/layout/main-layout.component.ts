import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MemoryListComponent } from '../memory/memory-list.component';
import { PersonaSummaryComponent } from '../persona/persona-summary.component';
import { PersonaConfigComponent } from '../persona/persona-config.component';
import { ConversationListComponent } from '../conversation/conversation-list.component';
import { IdentityAnchorEditorComponent } from '../identity-anchor/identity-anchor-editor.component';
import { DebugDashboardComponent } from '../debug/debug-dashboard.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, MemoryListComponent, PersonaSummaryComponent, PersonaConfigComponent, ConversationListComponent, IdentityAnchorEditorComponent, DebugDashboardComponent],
  template: `
    <div class="layout">
      <aside class="drawer">
        <app-persona-summary />
        <div class="tab-bar">
          <button [class.active]="tab() === 'conversations'" (click)="tab.set('conversations')">对话</button>
          <button [class.active]="tab() === 'memory'" (click)="tab.set('memory')">记忆</button>
          <button [class.active]="tab() === 'persona'" (click)="tab.set('persona')">人格</button>
          <button [class.active]="tab() === 'identity'" (click)="tab.set('identity')">用户</button>
          <button [class.active]="tab() === 'debug'" (click)="tab.set('debug')">调试</button>
          <button (click)="openDevAgent()">Dev</button>
        </div>
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
        <router-outlet />
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
      display: flex;
      gap: var(--space-1);
      margin: 0 var(--space-3) var(--space-2);
      background: var(--color-bg);
      border-radius: var(--radius-lg);
      padding: var(--space-1);
      flex-shrink: 0;
    }

    .tab-bar button {
      flex: 1;
      padding: var(--space-1) 0;
      font-size: var(--font-size-xs);
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      cursor: pointer;
      color: var(--color-text-secondary);
      font-family: var(--font-family);
      font-weight: var(--font-weight-medium);
      transition: all var(--transition-fast);
      line-height: 1.8;
    }

    .tab-bar button.active {
      background: var(--color-surface);
      color: var(--color-text);
      font-weight: var(--font-weight-semibold);
      box-shadow: var(--shadow-sm);
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
      overflow: auto;
      min-width: 0;
      background: var(--color-bg);
    }
  `],
})
export class MainLayoutComponent {
  tab = signal<'conversations' | 'memory' | 'persona' | 'identity' | 'debug'>('conversations');

  constructor(private router: Router) {}

  openDevAgent() {
    this.router.navigate(['/dev-agent']);
  }
}
