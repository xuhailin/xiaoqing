import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DevAgentPageStore } from './dev-agent-page.store';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';

@Component({
  selector: 'app-dev-agent-overview',
  standalone: true,
  imports: [AppStateComponent, AppButtonComponent],
  template: `
    <div class="overview">
      <app-state
        title="选择会话开始"
        description="从左侧选择一个已有会话，或点击「新建」创建新的开发任务。"
      >
        <app-button variant="primary" size="sm" (click)="openDraftSession()">新建会话</app-button>
      </app-state>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .overview {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `],
})
export class DevAgentOverviewComponent {
  constructor(
    private readonly store: DevAgentPageStore,
    private readonly router: Router,
  ) {}

  openDraftSession() {
    this.store.startDraftSession();
    this.router.navigate(['/workspace/dev-agent/sessions', 'new']);
  }
}
