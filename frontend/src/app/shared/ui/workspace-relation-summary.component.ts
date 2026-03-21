import { NgClass } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AppBadgeComponent } from './app-badge.component';
import { AppButtonComponent } from './app-button.component';
import { AppIconComponent, type AppIconName } from './app-icon.component';

export interface WorkspaceRelationSummaryItem {
  key: string;
  label: string;
  title: string;
  detail?: string | null;
  meta?: string | null;
  icon?: AppIconName;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  badge?: string | null;
  actionLabel?: string | null;
}

@Component({
  selector: 'app-workspace-relation-summary',
  standalone: true,
  imports: [
    NgClass,
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
  ],
  template: `
    @if (items.length) {
      <div class="relation-summary" [ngClass]="hostClasses()">
        @if (title) {
          <div class="relation-summary__title">{{ title }}</div>
        }
        <div class="relation-summary__list">
          @for (item of items; track item.key) {
            <div class="relation-summary__item">
              <div class="relation-summary__main">
                <div class="relation-summary__eyebrow">
                  <span class="relation-summary__label">
                    @if (item.icon) {
                      <app-icon [name]="item.icon" size="0.82rem" />
                    }
                    <span>{{ item.label }}</span>
                  </span>
                  @if (item.badge) {
                    <app-badge [tone]="item.tone ?? 'neutral'" appearance="outline" size="sm">{{ item.badge }}</app-badge>
                  }
                </div>
                <div class="relation-summary__item-title">{{ item.title }}</div>
                @if (item.detail) {
                  <div class="relation-summary__detail">{{ item.detail }}</div>
                }
                @if (item.meta) {
                  <div class="relation-summary__meta">{{ item.meta }}</div>
                }
              </div>
              @if (item.actionLabel) {
                <app-button variant="ghost" size="xs" (click)="action.emit(item.key)">
                  {{ item.actionLabel }}
                </app-button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }

    .relation-summary {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .relation-summary--embedded {
      padding: var(--space-3);
      border-radius: calc(var(--workbench-card-radius) - 4px);
      border: 1px solid var(--color-border-light);
      background: color-mix(in srgb, var(--color-surface-muted) 56%, transparent);
    }

    .relation-summary__title {
      font-size: 11px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .relation-summary__list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .relation-summary__item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      min-width: 0;
    }

    .relation-summary__main {
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
      min-width: 0;
      flex: 1 1 auto;
    }

    .relation-summary__eyebrow {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .relation-summary__label {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      font-size: 11px;
      font-weight: var(--font-weight-medium);
      color: var(--color-text-muted);
    }

    .relation-summary__item-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      line-height: 1.45;
      color: var(--color-text);
      word-break: break-word;
    }

    .relation-summary__detail,
    .relation-summary__meta {
      font-size: var(--font-size-xs);
      line-height: 1.55;
      color: var(--color-text-secondary);
      word-break: break-word;
    }

    .relation-summary__meta {
      color: var(--color-text-muted);
    }

    @media (max-width: 720px) {
      .relation-summary__item {
        flex-direction: column;
      }
    }
  `],
})
export class WorkspaceRelationSummaryComponent {
  @Input() title: string | null = null;
  @Input() items: WorkspaceRelationSummaryItem[] = [];
  @Input() embedded = true;

  @Output() action = new EventEmitter<string>();

  protected hostClasses() {
    return {
      'relation-summary--embedded': this.embedded,
    };
  }
}
