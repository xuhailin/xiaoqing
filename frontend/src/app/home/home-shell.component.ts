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
        <div class="home-sidebar__content">
          <section class="home-profile">
            <app-xiaoqing-avatar size="2.8rem" shape="circle" />
            <div class="home-profile__copy">
              <div class="home-profile__name">小晴</div>
            </div>
          </section>
          <app-conversation-list />
        </div>
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
      grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
      gap: 0;
      padding: 0;
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
      padding: var(--space-4) var(--space-3) var(--space-3);
      border-right: 1px solid var(--color-border-light);
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
      padding: 0 0 var(--space-2);
      margin-bottom: var(--space-1);
      border-bottom: 1px solid var(--color-border-light);
    }

    .home-profile__copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .home-profile__name {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      line-height: 1.2;
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
      }

      .home-sidebar__content {
        border-right: none;
        border-bottom: 1px solid var(--color-border-light);
        padding: var(--space-3);
      }
    }
  `],
})
export class HomeShellComponent {}
