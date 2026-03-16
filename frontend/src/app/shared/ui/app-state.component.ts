import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-state',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="ui-state" [ngClass]="stateClasses()">
      <div class="ui-state__title">{{ title }}</div>
      @if (description) {
        <p class="ui-state__description">{{ description }}</p>
      }
      <ng-content />
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `],
})
export class AppStateComponent {
  @Input() kind: 'empty' | 'loading' | 'error' = 'empty';
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Input() compact = false;

  protected stateClasses() {
    return [
      this.kind !== 'empty' ? `ui-state--${this.kind}` : '',
      this.compact ? 'ui-state--compact' : '',
    ];
  }
}
