import { Component, OnDestroy, OnInit, computed, effect, untracked } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { DevAgentPageStore } from './dev-agent-page.store';
import { WorkspaceFocusPanelComponent } from './components/workspace-focus-panel.component';

@Component({
  selector: 'app-dev-agent',
  standalone: true,
  imports: [RouterOutlet, WorkspaceFocusPanelComponent],
  providers: [DevAgentPageStore],
  template: `
    <div class="dev-agent-layout">
      <app-workspace-focus-panel
        [workspaceRoot]="store.workspaceRootInput()"
        [workspaceOptions]="store.workspaceOptions()"
        [sessions]="currentWorkspaceSessions()"
        [activeSessionId]="store.selectedSessionId()"
        (workspaceRootChange)="store.setWorkspaceRootInput($event)"
        (createSession)="openDraftSession()"
        (selectSession)="openSession($event)"
      />

      <div class="main-column">
        <router-outlet />
      </div>

      @if (store.actionNotice()) {
        <div class="action-notice">{{ store.actionNotice() }}</div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .dev-agent-layout {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      padding: var(--workbench-shell-padding) calc(var(--workbench-shell-padding) + var(--space-2));
      overflow: hidden;
      position: relative;
    }

    .main-column {
      min-height: 0;
      overflow: auto;
    }

    .action-notice {
      position: absolute;
      right: var(--space-4);
      top: var(--space-4);
      z-index: 2;
      font-size: var(--font-size-xs);
      color: var(--dev-agent-notice-text);
      border: 1px solid var(--dev-agent-notice-border);
      background: var(--dev-agent-notice-bg);
      border-radius: var(--radius-md);
      padding: 0.5rem 0.75rem;
      box-shadow: var(--chat-panel-shadow);
      max-width: min(340px, 72vw);
      backdrop-filter: blur(12px);
    }

    @media (max-width: 980px) {
      .dev-agent-layout {
        padding: var(--workbench-shell-padding-mobile);
        grid-template-columns: 1fr;
        grid-template-rows: minmax(220px, 32vh) minmax(0, 1fr);
      }
    }
  `],
})
export class DevAgentComponent implements OnInit, OnDestroy {
  private workspaceSeeded = false;
  private routerSub?: Subscription;

  readonly currentWorkspaceSessions = computed(() => {
    const root = this.store.workspaceRootInput().trim();
    if (!root) return [];
    return this.store.sessions().filter((session) => session.workspaceRoot === root);
  });

  constructor(
    public readonly store: DevAgentPageStore,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    effect(() => {
      const options = this.store.workspaceOptions();
      const current = this.store.workspaceRootInput().trim();
      if (this.workspaceSeeded || current) return;
      const nextRoot = options[0] || '';
      if (nextRoot) {
        untracked(() => this.store.setWorkspaceRootInput(nextRoot));
        this.workspaceSeeded = true;
      }
    });
  }

  ngOnInit() {
    const initialSessionId = this.route.firstChild?.snapshot.paramMap.get('id') ?? null;
    if (initialSessionId === 'new') {
      this.store.startDraftSession();
      this.store.init();
    } else {
      this.store.init({ preferredSessionId: initialSessionId });
    }

    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        const sessionId = this.route.firstChild?.snapshot.paramMap.get('id');
        if (sessionId === 'new') {
          this.store.startDraftSession();
          return;
        }
        if (sessionId) {
          this.store.selectSession(sessionId);
        }
      });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.store.destroy();
  }

  openSession(sessionId: string) {
    this.router.navigate(['/workspace/dev-agent/sessions', sessionId]);
  }

  openDraftSession() {
    this.store.startDraftSession();
    this.router.navigate(['/workspace/dev-agent/sessions', 'new']);
  }
}
