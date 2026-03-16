import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [NgClass],
  template: `
    <span class="ui-badge" [ngClass]="badgeClasses()">
      <ng-content />
    </span>
  `,
})
export class AppBadgeComponent {
  @Input() tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' = 'neutral';
  @Input() appearance: 'soft' | 'outline' = 'soft';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() caps = false;

  protected badgeClasses() {
    return [
      `ui-badge--${this.tone}`,
      this.appearance === 'outline' ? 'ui-badge--outline' : '',
      this.size === 'sm' ? 'ui-badge--sm' : '',
      this.caps ? 'ui-badge--caps' : '',
    ];
  }
}
