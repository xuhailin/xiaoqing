import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-section-header',
  standalone: true,
  template: `
    <div class="ui-section-header">
      <div class="ui-section-header__copy">
        @if (eyebrow) {
          <span class="ui-section-header__eyebrow">{{ eyebrow }}</span>
        }
        <div class="ui-section-header__title">{{ title }}</div>
        @if (description) {
          <p class="ui-section-header__description">{{ description }}</p>
        }
      </div>

      <div class="ui-section-header__actions">
        <ng-content select="[actions]" />
      </div>
    </div>
  `,
})
export class AppSectionHeaderComponent {
  @Input() eyebrow = '';
  @Input({ required: true }) title = '';
  @Input() description = '';
}
