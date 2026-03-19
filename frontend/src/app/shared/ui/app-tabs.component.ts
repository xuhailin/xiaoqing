import { NgClass } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AppIconComponent, type AppIconName } from './app-icon.component';

export interface AppTabItem {
  value: string;
  label: string;
  icon?: AppIconName;
  iconPosition?: 'start' | 'end';
  count?: string | number | null;
}

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [NgClass, AppIconComponent],
  template: `
    <div class="ui-tabs" [ngClass]="containerClasses()">
      @for (item of items; track item.value) {
        <button
          type="button"
          class="ui-tabs__button"
          [ngClass]="buttonClasses(item.value)"
          (click)="select(item.value)"
        >
          <span class="ui-tabs__label">
            @if (item.icon && item.iconPosition !== 'end') {
              <app-icon class="ui-tabs__icon" [name]="item.icon" [size]="iconSize()" />
            }
            <span>{{ item.label }}</span>
            @if (item.icon && item.iconPosition === 'end') {
              <app-icon class="ui-tabs__icon" [name]="item.icon" [size]="iconSize()" />
            }
          </span>
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
  @Input() appearance: 'primary' | 'secondary' = 'secondary';
  @Input() fullWidth = false;

  @Output() valueChange = new EventEmitter<string>();

  protected containerClasses() {
    return [
      `ui-tabs--${this.appearance}`,
      this.fullWidth ? 'ui-tabs--full' : '',
    ];
  }

  protected buttonClasses(value: string) {
    return [
      value === this.value ? 'is-active' : '',
      this.size === 'sm' ? 'ui-tabs__button--sm' : '',
    ];
  }

  protected iconSize() {
    return this.size === 'sm' ? '0.9rem' : '0.95rem';
  }

  protected select(value: string) {
    if (value === this.value) {
      return;
    }
    this.valueChange.emit(value);
  }
}
