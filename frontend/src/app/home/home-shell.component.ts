import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConversationListComponent } from '../conversation/conversation-list.component';
import { XiaoqingAvatarComponent } from '../shared/ui/xiaoqing-avatar.component';

@Component({
  selector: 'app-home-shell',
  standalone: true,
  imports: [RouterOutlet, ConversationListComponent, XiaoqingAvatarComponent],
  template: `
    <div class="home-shell">
      <aside class="home-sidebar">
        <section class="home-sidebar__surface ui-panel ui-panel--subtle ui-panel--padding-none">
          <div class="home-sidebar__content">
            <section class="home-profile">
              <app-xiaoqing-avatar size="2.8rem" shape="circle" />
              <div class="home-profile__copy">
                <div class="home-profile__eyebrow">Assistant</div>
                <div class="home-profile__name">小晴</div>
              </div>
            </section>
            <app-conversation-list />
          </div>
        </section>
      </aside>

      <section class="home-stage">
        <section class="home-stage__surface ui-panel ui-panel--workbench ui-panel--padding-none">
          <router-outlet />
        </section>
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
      grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
      gap: var(--space-3);
      padding: var(--space-3);
    }

    .home-sidebar,
    .home-stage,
    .home-sidebar__surface,
    .home-stage__surface {
      min-height: 0;
      min-width: 0;
    }

    .home-sidebar__surface,
    .home-stage__surface {
      height: 100%;
      overflow: hidden;
    }

    .home-stage__surface > * {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }

    .home-sidebar__content {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-height: 0;
      height: 100%;
      padding: var(--space-3);
      background: transparent;
    }

    .home-stage {
      height: 100%;
      overflow: hidden;
      background: transparent;
    }

    .home-profile {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--color-border-light);
    }

    .home-profile__copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .home-profile__eyebrow {
      font-size: var(--font-size-xxs);
      font-weight: var(--font-weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .home-profile__name {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      line-height: var(--line-height-tight);
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
        padding: var(--space-2);
      }

      .home-sidebar__content {
        padding: var(--space-2);
      }

      .home-profile {
        padding-bottom: var(--space-2);
      }
    }
  `],
})
export class HomeShellComponent {}
