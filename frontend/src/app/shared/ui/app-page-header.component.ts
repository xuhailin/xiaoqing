import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <div class="ui-page-header">
      <div class="ui-page-header__copy">
        @if (eyebrow) {
          <span class="ui-page-header__eyebrow">{{ eyebrow }}</span>
        }
        <div class="ui-page-header__title">{{ title }}</div>
        @if (description) {
          <p class="ui-page-header__description">{{ description }}</p>
        }
      </div>

      <div class="ui-page-header__actions">
        <ng-content select="[actions]" />
      </div>
    </div>
  `,
})
export class AppPageHeaderComponent {
  @Input() eyebrow = '';
  @Input({ required: true }) title = '';
  @Input() description = '';
}
