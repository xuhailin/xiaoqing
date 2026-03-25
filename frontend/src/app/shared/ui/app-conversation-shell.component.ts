import { Component, Input } from '@angular/core';

/**
 * 侧边栏 + 主内容布局容器，供 DevAgent / DesignAgent 等会话页共用。
 *
 * 用法：
 *   <app-conversation-shell [hasSidebar]="true">
 *     <div slot="sidebar">侧边栏内容</div>
 *     <!-- 其余内容投影到主区域 -->
 *   </app-conversation-shell>
 */
@Component({
  selector: 'app-conversation-shell',
  standalone: true,
  template: `
    <div class="conversation-shell" [class.conversation-shell--has-sidebar]="hasSidebar">
      @if (hasSidebar) {
        <aside class="conversation-shell__sidebar">
          <ng-content select="[slot=sidebar]" />
        </aside>
      }
      <section class="conversation-shell__main">
        <ng-content />
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      flex: 1;
      min-height: 0;
    }

    .conversation-shell {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--workbench-section-gap);
    }

    .conversation-shell--has-sidebar {
      grid-template-columns: var(--conversation-shell-sidebar-width, 240px) minmax(0, 1fr);
    }

    .conversation-shell__sidebar {
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-border-light);
      border-radius: var(--workbench-card-radius);
      background: var(--color-panel-subtle-bg);
      overflow: hidden;
    }

    .conversation-shell__main {
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-workbench-border);
      border-radius: var(--workbench-card-radius);
      background: var(--workbench-surface-gradient);
      box-shadow: var(--workbench-surface-shadow);
      overflow: hidden;
    }

    @media (max-width: 900px) {
      .conversation-shell--has-sidebar {
        grid-template-columns: 1fr;
      }

      .conversation-shell__sidebar {
        display: none;
      }
    }
  `],
})
export class AppConversationShellComponent {
  @Input() hasSidebar = false;
}
