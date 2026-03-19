import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DevAgentPageStore } from './dev-agent-page.store';
import { DevChatPanelComponent } from './components/dev-chat-panel.component';

@Component({
  selector: 'app-dev-agent-session',
  standalone: true,
  imports: [DevChatPanelComponent],
  template: `
    <app-dev-chat-panel
      [messages]="store.chatMessages()"
      [runState]="store.runState()"
      [title]="store.draftSessionActive() ? '新 Session' : 'Dev Chat'"
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
      (back)="goToOverview()"
    />
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
  `],
})
export class DevAgentSessionComponent {
  taskInput = '';

  constructor(
    public readonly store: DevAgentPageStore,
    private readonly router: Router,
  ) {}

  submitTask() {
    const task = this.taskInput;
    this.store.send(task, {
      forceNewSession: this.store.draftSessionActive(),
      onSuccess: (result) => {
        this.router.navigate(['/workspace/dev-agent/sessions', result.session.id]);
      },
    });
    this.taskInput = '';
  }

  goToOverview() {
    this.router.navigate(['/workspace/dev-agent']);
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
