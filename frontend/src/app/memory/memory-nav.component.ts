import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MemoryStatsService, type MemoryNavItem } from '../core/services/memory-stats.service';
import {
  AppIconComponent,
  type AppIconName,
} from '../shared/ui/app-icon.component';

@Component({
  selector: 'app-memory-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AppIconComponent],
  template: `
    <nav class="memory-nav">
      <ul class="nav-list main-left-section sub-panel ui-scrollbar">
        @for (item of navItems(); track item.key) {
          <li>
            <a
              class="nav-item panel"
              [routerLink]="['/memory/settings', item.key]"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: true }"
            >
              <span class="nav-item__icon">
                <app-icon [name]="getIcon(item.key)" size="1.1rem" />
              </span>
              <span class="nav-item__content">
                <span class="nav-item__label">{{ item.label }}</span>
                <span class="nav-item__hint">{{ item.hint }}</span>
              </span>
              <span class="nav-item__right">
                @if (item.count > 0) {
                  <span class="nav-item__count">{{ formatCount(item.count) }}</span>
                }
                @if (item.hasAlert) {
                  <span class="nav-item__alert"></span>
                }
              </span>
            </a>
          </li>
        }
      </ul>

      @if (loading()) {
        <div class="nav-loading">加载中...</div>
      }
    </nav>
  `,
  styles: [`
    :host {
      display: block;
      width: 232px;
      min-width: 232px;
      height: 100%;
      overflow: hidden;
    }

    .memory-nav {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: transparent;
      border-right: none;
      box-shadow: none;
      padding: var(--space-3);
    }

    .nav-list {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-2);
      margin: 0;
      list-style: none;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 52px;
      padding: var(--space-2) var(--space-3);
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: all var(--transition-fast);
      cursor: pointer;
      border-radius: 18px;
      margin-bottom: var(--space-2);

      &:hover {
        background: var(--conversation-card-hover-bg);
        border-color: var(--conversation-card-hover-border);
        box-shadow: var(--conversation-card-hover-shadow);
        color: var(--color-text);
      }

      &.is-active {
        background: var(--conversation-card-active-bg);
        color: var(--color-primary);
        border-color: var(--conversation-card-active-border);
        box-shadow: var(--conversation-card-active-shadow);
      }
    }

    .nav-item__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-highlight);
      color: var(--color-text-muted);
      flex-shrink: 0;

      .is-active & {
        background: var(--color-primary-light);
        color: var(--color-primary);
      }
    }

    .nav-item__content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .nav-item__label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      line-height: 1.3;
    }

    .nav-item__hint {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nav-item__right {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .nav-item__count {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-muted);
      padding: 2px 6px;
      background: var(--color-surface-muted);
      border-radius: var(--radius-pill);
      min-width: 24px;
      text-align: center;

      .is-active & {
        background: var(--color-primary-light);
        color: var(--color-primary);
      }
    }

    .nav-item__alert {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-warning);
      opacity: 0.9;
    }

    .nav-loading {
      padding: var(--space-3) var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      text-align: center;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryNavComponent implements OnInit {
  private statsService = inject(MemoryStatsService);

  readonly navItems = signal<MemoryNavItem[]>(this.getDefaultNavItems());
  readonly loading = signal(true);

  async ngOnInit() {
    try {
      const items = await this.statsService.getNavItems();
      this.navItems.set(items);
    } catch {
      // Keep default items
    } finally {
      this.loading.set(false);
    }
  }

  getIcon(key: string): AppIconName {
    const iconMap: Record<string, AppIconName> = {
      identity: 'user',
      preference: 'settings',
      'soft-preference': 'heartPulse',
      cognitive: 'lightbulb',
      'shared-fact': 'check',
      commitment: 'calendarCheck',
      'world-state': 'sun',
      pending: 'bell',
      people: 'userCircle',
      persona: 'sparkles',
    };
    return iconMap[key] ?? 'bookmark';
  }

  formatCount(count: number): string {
    if (count >= 1000) {
      return `${Math.floor(count / 1000)}k`;
    }
    return String(count);
  }

  private getDefaultNavItems(): MemoryNavItem[] {
    return [
      { key: 'identity', label: '身份锚定', hint: '你告诉我的身份信息', count: 0 },
      { key: 'preference', label: '用户偏好', hint: '你偏好的回应方式', count: 0 },
      { key: 'soft-preference', label: '软偏好', hint: '从对话里提取的偏好', count: 0 },
      { key: 'cognitive', label: '长期认知', hint: '判断模式、价值排序', count: 0 },
      { key: 'shared-fact', label: '共识事实', hint: '我们确认过的事实', count: 0 },
      { key: 'commitment', label: '承诺感知', hint: '你提到的计划和约定', count: 0 },
      { key: 'world-state', label: '世界状态', hint: '地点、时区等前提', count: 0 },
      { key: 'pending', label: '待确认', hint: '等你审核的记忆提议', count: 0, hasAlert: false },
      { key: 'people', label: '身边的人', hint: '你生活里反复出现的人', count: 0 },
      { key: 'persona', label: '人格', hint: '多个人格切换与表达纪律编辑', count: 0 },
    ];
  }
}
