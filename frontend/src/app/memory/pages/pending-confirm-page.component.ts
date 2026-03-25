import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  MemoryProposalService,
  type MemoryProposalRecord,
} from '../../core/services/memory-proposal.service';
import { AppBadgeComponent } from '../../shared/ui/app-badge.component';
import { AppButtonComponent } from '../../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-pending-confirm-page',
  standalone: true,
  imports: [
    AppBadgeComponent,
    AppButtonComponent,
    AppPageHeaderComponent,
    AppPanelComponent,
    AppStateComponent,
  ],
  template: `
    <div class="page-container">
      <div class="page-container__header">
        <app-page-header
          title="待确认"
          description="新的记忆建议会在这里等待你确认，你点头后我才会正式记下来。"
        />
        @if (items().length > 0) {
          <span class="pending-count">{{ items().length }} 条待处理</span>
        }
      </div>

      <div class="page-content">
        <app-panel variant="workbench" class="pending-panel">
          @if (loading()) {
            <app-state kind="loading" title="加载中..." />
          } @else if (items().length === 0) {
            <app-state
              title="暂无待审核提案"
              description="当系统或 Agent 提交新的记忆建议时会出现在这里。"
            />
          } @else {
            <div class="pending-list">
              @for (item of items(); track item.id) {
                <div class="pending-card">
                  <div class="pending-head">
                    <div class="pending-badges">
                      <app-badge [tone]="kindTone(item.kind)" size="sm">
                        {{ kindLabel(item.kind) }}
                      </app-badge>
                      <app-badge tone="neutral" appearance="outline" size="sm">
                        {{ scopeLabel(item.scope) }}
                      </app-badge>
                    </div>
                    <span class="pending-agent">来自 {{ item.proposerAgentId }}</span>
                  </div>

                  <p class="pending-content">{{ item.content }}</p>

                  @if (item.reason) {
                    <p class="pending-reason">{{ item.reason }}</p>
                  }

                  <div class="pending-actions">
                    <app-button
                      variant="primary"
                      size="sm"
                      [disabled]="processingId() === item.id"
                      (click)="approve(item)"
                    >
                      {{ processingId() === item.id ? '处理中...' : '写入记忆' }}
                    </app-button>
                    <app-button
                      variant="ghost"
                      size="sm"
                      [disabled]="processingId() === item.id"
                      (click)="reject(item)"
                    >
                      拒绝
                    </app-button>
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
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .pending-count {
      display: inline-block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-warning);
      background: var(--color-warning-bg);
      padding: 2px var(--space-2);
      border-radius: var(--radius-pill);
    }

    .page-content {
      flex: 1;
      min-height: 0;
    }

    .pending-panel {
      min-height: 200px;
    }

    .pending-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .pending-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }

    .pending-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .pending-badges {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      flex-wrap: wrap;
    }

    .pending-agent {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      flex-shrink: 0;
    }

    .pending-content {
      font-size: var(--font-size-sm);
      color: var(--color-text);
      line-height: 1.55;
      margin: 0;
    }

    .pending-reason {
      margin: 0;
      font-size: var(--font-size-xs);
      line-height: 1.5;
      color: var(--color-text-secondary);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface-muted);
      border-radius: var(--radius-sm);
      border-left: 2px solid var(--color-border);
    }

    .pending-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-top: var(--space-1);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingConfirmPageComponent implements OnInit {
  private proposalService = inject(MemoryProposalService);

  readonly items = signal<MemoryProposalRecord[]>([]);
  readonly loading = signal(true);
  readonly processingId = signal<string | null>(null);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(
        this.proposalService.list({ status: 'pending', limit: 100 })
      );
      this.items.set(list ?? []);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async approve(item: MemoryProposalRecord) {
    this.processingId.set(item.id);
    try {
      await firstValueFrom(this.proposalService.approve(item.id));
      await this.load();
    } finally {
      this.processingId.set(null);
    }
  }

  async reject(item: MemoryProposalRecord) {
    this.processingId.set(item.id);
    try {
      await firstValueFrom(this.proposalService.reject(item.id));
      await this.load();
    } finally {
      this.processingId.set(null);
    }
  }

  kindLabel(kind: string): string {
    const map: Record<string, string> = {
      preference: '偏好',
      fact: '事实',
      boundary: '边界',
      correction: '纠错',
      pattern: '反复出现的倾向',
      judgment: '判断',
    };
    return map[kind] ?? kind;
  }

  kindTone(kind: string): 'neutral' | 'info' | 'success' | 'warning' {
    if (kind === 'correction') return 'warning';
    if (kind === 'boundary') return 'warning';
    if (kind === 'fact') return 'info';
    if (kind === 'preference') return 'success';
    return 'neutral';
  }

  scopeLabel(scope: string): string {
    if (scope === 'long_term') return '长期';
    if (scope === 'session') return '会话';
    if (scope === 'ephemeral') return '临时';
    return scope;
  }
}
