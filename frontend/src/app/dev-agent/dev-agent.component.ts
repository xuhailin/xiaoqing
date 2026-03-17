import { Component, OnDestroy, OnInit, computed, effect, signal, untracked } from '@angular/core';
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
        [taskInput]="taskInput()"
        [sending]="store.sending()"
        (workspaceRootChange)="store.setWorkspaceRootInput($event)"
        (taskInputChange)="taskInput.set($event)"
        (submit)="submitTask()"
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
      gap: var(--space-4);
      padding: var(--space-4);
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
      color: #1f8a4d;
      border: 1px solid rgba(39, 174, 96, 0.3);
      background: rgba(240, 253, 244, 0.95);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      box-shadow: var(--shadow-sm);
      max-width: min(340px, 72vw);
    }

    @media (max-width: 980px) {
      .dev-agent-layout {
        padding: var(--space-3);
        grid-template-columns: 1fr;
        grid-template-rows: minmax(220px, 32vh) minmax(0, 1fr);
      }
    }
  `],
})
export class DevAgentComponent implements OnInit, OnDestroy {
  taskInput = signal('');
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
    this.store.init({ preferredSessionId: initialSessionId });

    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        const sessionId = this.route.firstChild?.snapshot.paramMap.get('id');
        if (sessionId) {
          this.store.selectSession(sessionId);
        }
      });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.store.destroy();
  }

  submitTask() {
    const task = this.taskInput();
    this.store.send(task, {
      onSuccess: (result) => {
        this.router.navigate(['/dev-agent/sessions', result.session.id]);
      },
    });
    this.taskInput.set('');
  }

  openSession(sessionId: string) {
    this.router.navigate(['/dev-agent/sessions', sessionId]);
  }
}
