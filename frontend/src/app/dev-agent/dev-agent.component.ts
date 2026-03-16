import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DevAgentPageStore } from './dev-agent-page.store';
import { WorkspaceSidebarComponent } from './components/workspace-sidebar.component';
import { DevChatPanelComponent } from './components/dev-chat-panel.component';

@Component({
  selector: 'app-dev-agent',
  standalone: true,
  imports: [WorkspaceSidebarComponent, DevChatPanelComponent],
  providers: [DevAgentPageStore],
  template: `
    <div class="dev-agent-page">
      <div class="layout-grid">
        <app-workspace-sidebar
          [workspaceRoot]="store.workspaceRootInput()"
          [workspaceOptions]="store.workspaceOptions()"
          [sessions]="store.sessions()"
          [activeSessionId]="store.selectedSessionId()"
          (workspaceRootSelect)="store.selectWorkspaceRoot($event)"
          (selectSession)="store.selectSession($event)"
        />

        <app-dev-chat-panel
          [messages]="store.chatMessages()"
          [runState]="store.runState()"
          [taskInput]="taskInput()"
          [sending]="store.sending()"
          [canCancel]="isCurrentRunCancellable()"
          [canRerun]="isCurrentRunRerunnable()"
          [cancelling]="isCancellingCurrentRun()"
          (taskInputChange)="taskInput.set($event)"
          (submit)="submitTask()"
          (cancel)="store.cancelCurrentRun()"
          (rerun)="store.rerunCurrentRun()"
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

    .dev-agent-page {
      height: 100%;
      min-height: 0;
      overflow: hidden;
      padding: var(--space-4);
      position: relative;
      background:
        radial-gradient(circle at top left, rgba(234, 201, 183, 0.24), transparent 22%),
        linear-gradient(180deg, #fbf8f2 0%, #f7f3ee 100%);
    }

    .layout-grid {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
      gap: var(--space-4);
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
      .dev-agent-page {
        padding: var(--space-3);
      }

      .layout-grid {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(220px, 34vh) minmax(0, 1fr);
      }
    }
  `],
})
export class DevAgentComponent implements OnInit, OnDestroy {
  taskInput = signal('');

  constructor(
    public readonly store: DevAgentPageStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit() {
    const query = this.route.snapshot.queryParamMap;
    const navState = (history.state ?? {}) as Record<string, unknown>;
    this.store.init({
      preferredSessionId: query.get('sessionId'),
      preferredRunId: query.get('runId'),
      workspaceRoot: query.get('workspaceRoot'),
      notice: typeof navState['notice'] === 'string' ? navState['notice'] : null,
    });
  }

  ngOnDestroy() {
    this.store.destroy();
  }

  submitTask() {
    const task = this.taskInput();
    this.store.send(task);
    this.taskInput.set('');
  }

  isCurrentRunCancellable(): boolean {
    const status = this.store.currentResult()?.run.status;
    return status ? this.store.isRunCancellable(status) : false;
  }

  isCurrentRunRerunnable(): boolean {
    const status = this.store.currentResult()?.run.status;
    return !!status && !this.store.isRunCancellable(status);
  }

  isCancellingCurrentRun(): boolean {
    const runId = this.store.currentResult()?.run.id;
    return !!runId && this.store.cancellingRunId() === runId;
  }

}
