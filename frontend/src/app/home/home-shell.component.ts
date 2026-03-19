import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ChatQuickActionsComponent } from '../chat/chat-quick-actions.component';
import { ConversationListComponent } from '../conversation/conversation-list.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';

@Component({
  selector: 'app-home-shell',
  standalone: true,
  imports: [RouterOutlet, ChatQuickActionsComponent, ConversationListComponent, AppPanelComponent],
  template: `
    <div class="home-shell">
      <aside class="home-sidebar">
        <app-panel variant="subtle" padding="none" class="home-sidebar__panel">
          <div class="home-sidebar__content">
            <app-chat-quick-actions />
            <app-conversation-list />
          </div>
        </app-panel>
      </aside>

      <section class="home-stage">
        <router-outlet />
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .home-shell {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
      gap: var(--workbench-section-gap);
      padding: var(--workbench-shell-padding) calc(var(--workbench-shell-padding) + var(--space-2));
    }

    .home-sidebar,
    .home-stage {
      min-height: 0;
      min-width: 0;
    }

    .home-sidebar__content {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      padding: 0 var(--space-3);
    }

    .home-sidebar__panel,
    .home-stage {
      height: 100%;
    }

    .home-stage {
      overflow: hidden;
      background: transparent;
    }

    app-conversation-list {
      display: block;
      flex: 1;
      min-height: 0;
    }

    @media (max-width: 980px) {
      .home-shell {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(240px, 38vh) minmax(0, 1fr);
        padding: var(--workbench-shell-padding-mobile);
      }
    }
  `],
})
export class HomeShellComponent {}
