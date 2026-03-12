import { Component, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { DevTaskResult } from '../core/services/dev-agent.service';
import { DevAgentPageStore } from './dev-agent-page.store';
import { DevTimelineStep } from './dev-agent.view-model';
import { DevThreadPaneComponent } from './components/dev-thread-pane.component';
import { DevRunTimelineComponent } from './components/dev-run-timeline.component';
import { DevStepDetailComponent } from './components/dev-step-detail.component';
import { DevComposerComponent } from './components/dev-composer.component';

@Component({
  selector: 'app-dev-agent',
  standalone: true,
  imports: [
    DevThreadPaneComponent,
    DevRunTimelineComponent,
    DevStepDetailComponent,
    DevComposerComponent,
  ],
  providers: [DevAgentPageStore],
  template: `
    <div class="dev-agent-page">
      <div class="workbench-grid">
        <app-dev-thread-pane
          [sessions]="store.sessions()"
          [selectedSessionId]="store.selectedSessionId()"
          [selectedRunId]="store.selectedRunId()"
          [expandedSessionId]="store.expandedSessionId()"
          [searchText]="searchText()"
          [statusFilter]="statusFilter()"
          (searchTextChange)="searchText.set($event)"
          (statusFilterChange)="statusFilter.set($event)"
          (sessionToggle)="store.toggleSession($event)"
          (runSelect)="store.openRun($event)"
        />

        <app-dev-run-timeline
          [task]="store.lastResult()"
          [steps]="timelineSteps()"
          [selectedStepId]="selectedStepId()"
          [isCancellable]="isCurrentRunCancellable()"
          [cancelling]="isCancellingCurrentRun()"
          [hasFailedStep]="hasFailedStep()"
          (stepSelect)="selectedStepId.set($event)"
          (cancel)="store.cancelCurrentRun()"
          (rerun)="store.rerunCurrentRun()"
          (jumpToFailed)="jumpToFailedStep()"
        />

        <app-dev-step-detail
          [step]="selectedStep()"
          [runStatus]="store.lastResult()?.run?.status ?? null"
          [stopReason]="summaryStopReason()"
          [runError]="store.lastResult()?.run?.error ?? null"
          (copyCommand)="copySelectedCommand()"
          (copyFailureSummary)="copyFailureSummary()"
        />
      </div>

      @if (store.actionNotice()) {
        <div class="action-notice">{{ store.actionNotice() }}</div>
      }

      <app-dev-composer
        [taskInput]="taskInput()"
        [workspaceRoot]="store.workspaceRootInput()"
        [sending]="store.sending()"
        (taskInputChange)="taskInput.set($event)"
        (workspaceRootChange)="store.setWorkspaceRootInput($event)"
        (submit)="submitTask()"
      />
    </div>
  `,
  styles: [`
    .dev-agent-page {
      height: 100%;
      display: grid;
      grid-template-rows: 1fr auto;
      gap: var(--space-3);
      padding: var(--space-4);
      min-height: 0;
      position: relative;
    }

    .workbench-grid {
      min-height: 0;
      display: grid;
      grid-template-columns: 320px minmax(420px, 1fr) 320px;
      gap: var(--space-3);
    }

    @media (max-width: 1320px) {
      .workbench-grid {
        grid-template-columns: 280px minmax(360px, 1fr) 280px;
      }
    }

    @media (max-width: 1024px) {
      .dev-agent-page {
        grid-template-rows: 1fr auto;
        padding: var(--space-3);
      }

      .workbench-grid {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(180px, 32vh) minmax(260px, 1fr) minmax(180px, 30vh);
      }
    }

    .action-notice {
      position: absolute;
      right: var(--space-4);
      top: var(--space-4);
      z-index: 2;
      font-size: var(--font-size-xs);
      color: #1f8a4d;
      border: 1px solid rgba(39, 174, 96, 0.35);
      background: rgba(240, 253, 244, 0.92);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      box-shadow: var(--shadow-sm);
      max-width: min(360px, 70vw);
    }
  `],
})
export class DevAgentComponent implements OnInit, OnDestroy {
  taskInput = signal('');
  searchText = signal('');
  statusFilter = signal<'all' | 'running' | 'failed' | 'success'>('all');
  selectedStepId = signal<string | null>(null);

  readonly summary = computed(() => {
    const runResult = this.store.lastResult()?.run.result;
    return this.store.buildResultSummary(runResult);
  });

  readonly summaryStopReason = computed(() => this.summary()?.stopReason ?? null);

  readonly timelineSteps = computed(() => this.buildTimelineSteps(this.store.lastResult()));

  readonly selectedStep = computed(() => {
    const steps = this.timelineSteps();
    const selected = this.selectedStepId();
    if (selected) {
      const matched = steps.find((step) => step.id === selected);
      if (matched) return matched;
    }
    return steps[0] ?? null;
  });

  readonly hasFailedStep = computed(() =>
    this.timelineSteps().some((step) => step.status === 'failed'),
  );

  private lastRunId: string | null = null;

  private readonly selectionSync = effect(() => {
    const currentRunId = this.store.lastResult()?.run.id ?? null;
    const steps = this.timelineSteps();
    if (currentRunId !== this.lastRunId) {
      this.lastRunId = currentRunId;
      this.selectedStepId.set(steps[0]?.id ?? null);
      return;
    }
    if (steps.length === 0) {
      this.selectedStepId.set(null);
      return;
    }
    if (!steps.find((step) => step.id === this.selectedStepId())) {
      this.selectedStepId.set(steps[0].id);
    }
  });

  constructor(public readonly store: DevAgentPageStore) {}

  ngOnInit() {
    this.store.init();
  }

  ngOnDestroy() {
    this.selectionSync.destroy();
    this.store.destroy();
  }

  submitTask() {
    const task = this.taskInput();
    this.store.send(task);
    this.taskInput.set('');
  }

  isCurrentRunCancellable(): boolean {
    const status = this.store.lastResult()?.run.status;
    return status ? this.store.isRunCancellable(status) : false;
  }

  isCancellingCurrentRun(): boolean {
    const runId = this.store.lastResult()?.run.id;
    return !!runId && this.store.cancellingRunId() === runId;
  }

  jumpToFailedStep() {
    const failed = this.timelineSteps().find((step) => step.status === 'failed');
    if (failed) {
      this.selectedStepId.set(failed.id);
    }
  }

  copySelectedCommand() {
    const command = this.selectedStep()?.command ?? '';
    void this.store.copyText(command, '命令');
  }

  copyFailureSummary() {
    const summary = this.store.buildFailureSummary();
    void this.store.copyText(summary, '错误摘要');
  }

  private buildTimelineSteps(task: DevTaskResult | null): DevTimelineStep[] {
    if (!task) return [];

    const summary = this.store.buildResultSummary(task.run.result);
    if (summary?.steps.length) {
      return summary.steps.map((step, index) => ({
        id: step.stepId,
        title: `Step ${index + 1}`,
        command: step.command,
        executor: step.executor,
        strategy: null,
        status: step.success ? 'success' : 'failed',
        output: step.output,
        error: step.error,
      }));
    }

    const planSteps = task.run.plan?.steps ?? [];
    if (planSteps.length > 0) {
      const status = task.run.status === 'running' ? 'running' : 'planned';
      return planSteps.map((step) => ({
        id: `plan-${step.index}`,
        title: step.description || `计划步骤 ${step.index}`,
        command: step.command,
        executor: step.executor ?? task.run.executor ?? 'pending',
        strategy: step.strategy ?? null,
        status,
        output: null,
        error: null,
      }));
    }

    return [];
  }
}
