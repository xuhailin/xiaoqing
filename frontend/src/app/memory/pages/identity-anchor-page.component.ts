import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IdentityAnchorEditorComponent } from '../../identity-anchor/identity-anchor-editor.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';

@Component({
  selector: 'app-identity-anchor-page',
  standalone: true,
  imports: [AppPageHeaderComponent, IdentityAnchorEditorComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="身份锚定"
        description="你告诉我的身份信息，我会一直记着，不衰减、不遗忘。"
      />
      <div class="page-content">
        <app-identity-anchor-editor />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .page-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--workbench-shell-padding);
      overflow: auto;
      background: var(--color-bg);
    }

    .page-container__header {
      margin-bottom: var(--space-4);
    }

    .page-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: var(--space-3);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-sm);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentityAnchorPageComponent {}
