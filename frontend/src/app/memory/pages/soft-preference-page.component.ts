import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MemoryService } from '../../core/services/memory.service';
import { UserProfileService } from '../../core/services/user-profile.service';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

interface SoftPreferenceItem {
  id: string;
  content: string;
  source: 'memory' | 'profile';
  confidence?: number;
  createdAt?: string;
}

@Component({
  selector: 'app-soft-preference-page',
  standalone: true,
  imports: [AppBadgeComponent, AppPageHeaderComponent, AppPanelComponent, AppStateComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="软偏好"
        description="优先显示真实可用的偏好主模型；生活偏好来自记忆，互动偏好来自用户偏好投影。"
      />

      <div class="page-content">
        <app-panel variant="workbench" class="preference-panel">
          @if (loading()) {
            <app-state kind="loading" title="加载中..." />
          } @else if (items().length === 0) {
            <app-state
              title="暂无软偏好"
              description="新的生活偏好会写入记忆，稳定的互动偏好会从用户偏好模型投影到这里。"
            />
          } @else {
            <div class="preference-list">
              @for (item of items(); track item.id) {
                <div class="preference-card">
                  <div class="preference-content">{{ item.content }}</div>
                  <div class="preference-meta">
                    <app-badge [tone]="item.source === 'memory' ? 'neutral' : 'info'" appearance="outline" size="sm">
                      {{ item.source === 'memory' ? '记忆沉淀' : '偏好投影' }}
                    </app-badge>
                    @if (item.confidence !== undefined) {
                      <app-badge tone="neutral" appearance="outline" size="sm">
                        置信 {{ (item.confidence * 100).toFixed(0) }}%
                      </app-badge>
                    }
                    @if (item.createdAt) {
                      <span class="meta-time">{{ formatDate(item.createdAt) }}</span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </app-panel>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .page-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--workbench-shell-padding);
      overflow: auto;
    }

    .page-container__header {
      margin-bottom: var(--space-4);
    }

    .page-content {
      flex: 1;
      min-height: 0;
    }

    .preference-panel {
      min-height: 200px;
    }

    .preference-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .preference-card {
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      transition: border-color var(--transition-fast);

      &:hover {
        border-color: var(--color-primary);
      }
    }

    .preference-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--space-2);
    }

    .preference-meta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .meta-time {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoftPreferencePageComponent implements OnInit {
  private memoryService = inject(MemoryService);
  private userProfileService = inject(UserProfileService);

  readonly items = signal<SoftPreferenceItem[]>([]);
  readonly loading = signal(true);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const [memoryList, profile] = await Promise.all([
        firstValueFrom(this.memoryService.list(undefined, 'soft_preference')),
        firstValueFrom(this.userProfileService.get()),
      ]);
      const projectedItems: SoftPreferenceItem[] = [
        ...(profile?.preferredVoiceStyle ? profile.preferredVoiceStyle.split('\n') : []),
        ...(profile?.praisePreference ? profile.praisePreference.split('\n') : []),
        ...(profile?.responseRhythm ? profile.responseRhythm.split('\n') : []),
      ]
        .map((line) => line.trim().replace(/^[\-\s]+/, ''))
        .filter(Boolean)
        .map((content, index) => ({
          id: `profile-${index}`,
          content,
          source: 'profile' as const,
        }));
      const memoryItems: SoftPreferenceItem[] = (memoryList ?? []).map((item) => ({
        id: item.id,
        content: item.content,
        source: 'memory' as const,
        confidence: item.confidence,
        createdAt: item.createdAt,
      }));
      const dedup = [...memoryItems];
      projectedItems.forEach((item) => {
        if (!dedup.some((existing) => existing.content === item.content)) {
          dedup.push(item);
        }
      });
      this.items.set(dedup);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
}
