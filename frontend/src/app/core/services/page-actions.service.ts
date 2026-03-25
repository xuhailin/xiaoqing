import { Injectable, signal, type Signal } from '@angular/core';
import type { AppIconName } from '../../shared/ui/app-icon.component';

export interface PageAction {
  /** Unique identifier for this action */
  id: string;
  /** Icon name from AppIconName */
  icon?: AppIconName;
  /** Button label (optional for icon-only buttons) */
  label?: string;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  /** Whether the button is disabled */
  disabled?: Signal<boolean> | boolean;
  /** Click handler */
  onClick: () => void;
  /** Optional title/tooltip */
  title?: string;
  /** Visual separator before this action */
  separatorBefore?: boolean;
}

/**
 * Service for managing page-specific actions that appear in the secondary navigation bar.
 * Pages inject this service and register their actions in ngOnInit.
 */
@Injectable({ providedIn: 'root' })
export class PageActionsService {
  private readonly _actions = signal<PageAction[]>([]);

  /** Current page actions (read-only signal) */
  readonly actions = this._actions.asReadonly();

  /**
   * Register page actions. Replaces any previously registered actions.
   * Call this in the page component's ngOnInit.
   */
  setActions(actions: PageAction[]): void {
    this._actions.set(actions);
  }

  /**
   * Clear all page actions.
   * Call this in the page component's ngOnDestroy if needed.
   */
  clearActions(): void {
    this._actions.set([]);
  }
}
