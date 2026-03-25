import { Component, OnDestroy, OnInit, computed, effect, untracked } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { DevAgentPageStore } from './dev-agent-page.store';
import { DevSession } from '../core/services/dev-agent.service';
import { AppStatusNoticeComponent } from '../shared/ui/app-status-notice.component';
import { AgentChatComponent } from '../shared/components/agent-chat/agent-chat.component';
import type { AgentSession } from '../shared/components/agent-chat/agent-session.types';

@Component({
  selector: 'app-dev-agent',
  standalone: true,
  imports: [RouterOutlet, AgentChatComponent, AppStatusNoticeComponent],
  providers: [DevAgentPageStore],
  template: `
    <div class="dev-agent-wrap">
      <app-agent-chat
        [sessions]="agentSessions()"
        [activeSession]="activeAgentSession()"
        (selectSession)="openSession($event.id)"
        (newSession)="openDraftSession()"
      >
        <router-outlet />
      </app-agent-chat>

      <app-status-notice [message]="store.actionNotice()" />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      --agent-chat-sidebar-width: 300px;
    }

    .dev-agent-wrap {
      height: 100%;
      min-height: 0;
      padding: var(--workbench-shell-padding) calc(var(--workbench-shell-padding) + var(--space-2));
      overflow: hidden;
      position: relative;
    }

    app-agent-chat {
      display: block;
      height: 100%;
    }

    @media (max-width: 980px) {
      .dev-agent-wrap {
        padding: var(--workbench-shell-padding-mobile);
      }

      :host {
        --agent-chat-sidebar-width: 100%;
      }
    }
  `],
})
export class DevAgentComponent implements OnInit, OnDestroy {
  private workspaceSeeded = false;
  private routerSub?: Subscription;

  readonly agentSessions = computed(() => {
    const root = this.store.workspaceRootInput().trim();
    const sessions = root
      ? this.store.sessions().filter((s) => s.workspaceRoot === root)
      : this.store.sessions();
    return [...sessions]
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
      .map((session) => this.toAgentSession(session));
  });

  readonly activeAgentSession = computed(() => {
    const id = this.store.selectedSessionId();
    if (!id) return null;
    return this.agentSessions().find((s) => s.id === id) ?? null;
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

  private toAgentSession(session: DevSession): AgentSession {
    const latestRun = [...(session.runs ?? [])]
      .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))[0] ?? null;
    const hasRunning = session.runs?.some(
      (r) => r.status === 'queued' || r.status === 'pending' || r.status === 'running',
    );
    const hasFailed = !hasRunning && session.runs?.some((r) => r.status === 'failed');
    const rawTitle = session.title?.trim() || latestRun?.userInput?.trim() || '';
    return {
      id: session.id,
      title: rawTitle
        ? rawTitle.length > 64 ? `${rawTitle.slice(0, 61)}...` : rawTitle
        : '新的开发会话',
      status: hasRunning ? 'running' : hasFailed ? 'failed' : 'success',
      createdAt: session.createdAt || session.updatedAt || new Date().toISOString(),
      lastMessage: latestRun?.userInput?.trim() || null,
    };
  }
}
