import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { XiaoqingConversationListComponent } from '../conversation/xiaoqing-conversation-list.component';
import { XiaoqinConversationListComponent } from '../conversation/xiaoqin-conversation-list.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { XiaoqingAvatarComponent } from '../shared/ui/xiaoqing-avatar.component';

@Component({
  selector: 'app-home-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    XiaoqingConversationListComponent,
    XiaoqinConversationListComponent,
    XiaoqingAvatarComponent,
    AppIconComponent,
  ],
  template: `
    <div class="home-shell">
      <aside class="home-sidebar">
        <section class="home-sidebar__surface ui-panel ui-panel--subtle ui-panel--padding-none">
          <div class="home-sidebar__content">
            <section class="home-profile">
              @if (currentPanel() === 'xiaoqin') {
                <span class="home-profile__agent-icon">
                  <app-icon name="claw" size="1.35rem" />
                </span>
              } @else {
                <app-xiaoqing-avatar size="2.8rem" shape="circle" />
              }
              <div class="home-profile__copy">
                <div class="home-profile__eyebrow">{{ currentPanel() === 'xiaoqin' ? 'Execution Agent' : 'Assistant' }}</div>
                <div class="home-profile__name">{{ currentPanel() === 'xiaoqin' ? '小勤' : '小晴' }}</div>
              </div>
            </section>
            @if (currentPanel() === 'xiaoqin') {
              <app-xiaoqin-conversation-list />
            } @else {
              <app-xiaoqing-conversation-list />
            }
          </div>
        </section>
      </aside>

      <section class="home-stage">
        <section class="home-stage__surface">
          <div class="home-stage__view">
            <router-outlet />
          </div>
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

    .home-stage__surface {
      display: flex;
      flex-direction: column;
    }

    .home-sidebar__surface {
      border-color: var(--home-sidebar-surface-border);
      border-radius: 22px;
      background: var(--home-sidebar-surface-bg);
      box-shadow: var(--home-sidebar-surface-shadow);
    }

    .home-stage__surface {
      border: none;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .home-stage__view {
      flex: 1 1 auto;
      display: block;
      min-width: 0;
      min-height: 0;
      height: 100%;
    }

    .home-stage__view > app-chat {
      display: block;
      min-height: 0;
      height: 100%;
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
      border-bottom: 1px solid var(--home-profile-divider);
    }

    .home-profile__copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .home-profile__agent-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.8rem;
      height: 2.8rem;
      border-radius: 999px;
      color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
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
export class HomeShellComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private routeSub?: Subscription;

  currentPanel = signal<'xiaoqing' | 'xiaoqin'>('xiaoqing');

  ngOnInit() {
    this.routeSub = this.route.queryParamMap.subscribe((queryParams) => {
      this.currentPanel.set(queryParams.get('entryAgentId') === 'xiaoqin' ? 'xiaoqin' : 'xiaoqing');
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }
}
