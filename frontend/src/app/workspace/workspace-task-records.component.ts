import { Component } from '@angular/core';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

@Component({
  selector: 'app-workspace-task-records',
  standalone: true,
  imports: [AppPageHeaderComponent, AppPanelComponent, AppStateComponent],
  template: `
    <div class="workspace-page">
      <app-page-header
        title="任务记录"
        description="本轮先保留入口位，后续再把计划触发与执行流水收拢到这里。"
      />

      <app-panel variant="workbench" class="workspace-card">
        <app-state
          title="任务记录将在下一阶段接入"
          description="这一页先作为结构占位，避免现在把入口分散回 DevAgent、Reminder 和 Trace 区域。"
        />
      </app-panel>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .workspace-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
      min-height: 100%;
    }

    .workspace-card {
      min-height: 0;
    }

    @media (max-width: 980px) {
      .workspace-page {
        padding: var(--workbench-shell-padding-mobile);
      }
    }
  `],
})
export class WorkspaceTaskRecordsComponent {}
