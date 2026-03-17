import { Component, OnDestroy, OnInit, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DevAgentPageStore } from './dev-agent-page.store';
import { WorkspaceSidebarComponent } from './components/workspace-sidebar.component';
import { DevChatPanelComponent } from './components/dev-chat-panel.component';

@Component({
  selector: 'app-dev-agent-session',
  standalone: true,
  imports: [
    WorkspaceSidebarComponent,
    DevChatPanelComponent,
  ],
  providers: [DevAgentPageStore],
  template: `
    <div class="dev-agent-session-page">
      <div class="layout-grid">
        <app-workspace-sidebar
          [workspaceRoot]="store.workspaceRootInput()"
          [workspaceOptions]="store.workspaceOptions()"
          [sessions]="workspaceSessions()"
          [activeSessionId]="store.selectedSessionId()"
          [newThreadInput]="newThreadInput"
          [sending]="store.sending()"
          (backToOverview)="goToOverview()"
          (workspaceRootSelect)="changeWorkspace($event)"
          (newThreadInputChange)="newThreadInput = $event"
          (submitNewThread)="submitNewThread()"
          (selectSession)="openSession($event)"
        />

        <app-dev-chat-panel
          [messages]="store.chatMessages()"
          [runState]="store.runState()"
          [taskInput]="taskInput"
          [sending]="store.sending()"
          [canCancel]="isCurrentRunCancellable()"
          [canRerun]="isCurrentRunRerunnable()"
          [canResume]="isCurrentRunResumable()"
          [cancelling]="isCancellingCurrentRun()"
          (taskInputChange)="taskInput = $event"
          (submit)="submitTask()"
          (cancel)="store.cancelCurrentRun()"
          (rerun)="store.rerunCurrentRun()"
          (resume)="store.resumeCurrentRun()"
        />
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

    .dev-agent-session-page {
      height: 100%;
      min-height: 0;
      overflow: hidden;
      padding: var(--space-4);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .layout-grid {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
      gap: var(--space-4);
      overflow: hidden;
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
      .dev-agent-session-page {
        padding: var(--space-3);
      }

      .layout-grid {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(220px, 32vh) minmax(0, 1fr);
      }
    }
  `],
})
export class DevAgentSessionComponent implements OnInit, OnDestroy {
  taskInput = '';
  newThreadInput = '';

  readonly workspaceSessions = computed(() => {
    const currentRoot = this.store.workspaceRootInput().trim();
    if (!currentRoot) {
      return this.store.sessions();
    }
    return this.store.sessions().filter((session) => session.workspaceRoot === currentRoot);
  });

  constructor(
    public readonly store: DevAgentPageStore,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      this.store.init({
        preferredSessionId: params.get('id'),
      });
    });
  }

  ngOnDestroy() {
    this.store.destroy();
  }

  submitTask() {
    const task = this.taskInput;
    this.store.send(task);
    this.taskInput = '';
  }

  submitNewThread() {
    const task = this.newThreadInput;
    this.store.send(task, {
      forceNewSession: true,
      onSuccess: (result) => {
        this.router.navigate(['/dev-agent/sessions', result.session.id]);
      },
    });
    this.newThreadInput = '';
  }

  openSession(sessionId: string) {
    this.router.navigate(['/dev-agent/sessions', sessionId]);
  }

  changeWorkspace(root: string) {
    const matchedId = this.store.selectWorkspaceRoot(root);
    if (matchedId) {
      this.router.navigate(['/dev-agent/sessions', matchedId]);
    }
  }

  goToOverview() {
    this.router.navigate(['/dev-agent']);
  }

  isCurrentRunCancellable(): boolean {
    const status = this.store.currentResult()?.run.status;
    return status ? this.store.isRunCancellable(status) : false;
  }

  isCurrentRunRerunnable(): boolean {
    const status = this.store.currentResult()?.run.status;
    return !!status && !this.store.isRunCancellable(status);
  }

  isCurrentRunResumable(): boolean {
    return this.store.isRunResumable(this.store.currentRun());
  }

  isCancellingCurrentRun(): boolean {
    const runId = this.store.currentResult()?.run.id;
    return !!runId && this.store.cancellingRunId() === runId;
  }
}
