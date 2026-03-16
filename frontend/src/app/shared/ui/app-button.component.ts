import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [NgClass],
  host: {
    '[class.app-button-host--stretch]': 'stretch',
  },
  template: `
    <button
      class="ui-button"
      [ngClass]="buttonClasses()"
      [attr.type]="type"
      [disabled]="disabled"
    >
      <ng-content />
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
      max-width: 100%;
    }

    :host(.app-button-host--stretch) {
      display: flex;
      width: 100%;
    }

    button {
      width: 100%;
    }
  `],
})
export class AppButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' = 'secondary';
  @Input() size: 'xs' | 'sm' | 'md' = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() stretch = false;

  protected buttonClasses() {
    return [
      `ui-button--${this.variant}`,
      this.size !== 'md' ? `ui-button--${this.size}` : '',
      this.stretch ? 'ui-button--stretch' : '',
    ];
  }
}
