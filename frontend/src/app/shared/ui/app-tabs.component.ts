import { NgClass } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface AppTabItem {
  value: string;
  label: string;
  count?: string | number | null;
}

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="ui-tabs" [ngClass]="containerClasses()">
      @for (item of items; track item.value) {
        <button
          type="button"
          class="ui-tabs__button"
          [ngClass]="buttonClasses(item.value)"
          (click)="select(item.value)"
        >
          <span>{{ item.label }}</span>
          @if (item.count !== undefined && item.count !== null) {
            <span class="ui-tabs__count">{{ item.count }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      max-width: 100%;
    }
  `],
})
export class AppTabsComponent {
  @Input() items: readonly AppTabItem[] = [];
  @Input() value = '';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() fullWidth = false;

  @Output() valueChange = new EventEmitter<string>();

  protected containerClasses() {
    return [
      this.fullWidth ? 'ui-tabs--full' : '',
    ];
  }

  protected buttonClasses(value: string) {
    return [
      value === this.value ? 'is-active' : '',
      this.size === 'sm' ? 'ui-tabs__button--sm' : '',
    ];
  }

  protected select(value: string) {
    if (value === this.value) {
      return;
    }
    this.valueChange.emit(value);
  }
}
