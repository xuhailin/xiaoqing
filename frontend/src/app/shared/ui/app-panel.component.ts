import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [NgClass],
  template: `
    <section class="ui-panel" [ngClass]="panelClasses()">
      <ng-content />
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }
  `],
})
export class AppPanelComponent {
  @Input() variant: 'surface' | 'workbench' | 'subtle' | 'soft' | 'success' | 'warning' | 'danger' = 'surface';
  @Input() padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Input() accent: 'none' | 'info' | 'success' | 'warning' | 'danger' = 'none';

  protected panelClasses() {
    return [
      this.variant !== 'surface' ? `ui-panel--${this.variant}` : '',
      `ui-panel--padding-${this.padding}`,
      this.accent !== 'none' ? `ui-panel--accent-${this.accent}` : '',
    ];
  }
}
