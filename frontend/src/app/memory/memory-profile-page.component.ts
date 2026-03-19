import { Component } from '@angular/core';
import { IdentityAnchorEditorComponent } from '../identity-anchor/identity-anchor-editor.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';

@Component({
  selector: 'app-memory-profile-page',
  standalone: true,
  imports: [IdentityAnchorEditorComponent, AppPageHeaderComponent, AppPanelComponent],
  template: `
    <div class="memory-page">
      <app-page-header
        eyebrow="Memory"
        title="用户画像"
        description="身份锚定、默认偏好与用户相关记忆都在这里维护。"
      />

      <app-panel variant="workbench" class="memory-card">
        <app-identity-anchor-editor />
      </app-panel>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .memory-page {
      padding: var(--workbench-shell-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-stack-gap);
      min-height: 100%;
    }

    .memory-card {
      min-height: 0;
    }

    @media (max-width: 980px) {
      .memory-page {
        padding: var(--workbench-shell-padding-mobile);
      }
    }
  `],
})
export class MemoryProfilePageComponent {}
