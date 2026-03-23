import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  MemoryProposalService,
  type MemoryProposalRecord,
} from '../core/services/memory-proposal.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppStateComponent } from '../shared/ui/app-state.component';

@Component({
  selector: 'app-memory-proposals',
  standalone: true,
  imports: [
    AppBadgeComponent,
    AppButtonComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
    AppStateComponent,
  ],
  template: `
    <app-panel variant="subtle" class="proposals-panel">
      <app-section-header class="proposals-header" title="待审核记忆提案">
        <app-badge actions tone="warning">{{ pending().length }}</app-badge>
      </app-section-header>

      <p class="proposals-desc">
        小勤等执行 Agent 在完成任务后提交的记忆写入建议。审核通过后才会正式写入记忆库。
      </p>

      @if (loading()) {
        <app-state [compact]="true" kind="loading" title="加载中..." />
      } @else if (errorMsg()) {
        <app-state [compact]="true" kind="error" title="加载失败" [description]="errorMsg()" />
      } @else if (!pending().length) {
        <app-state [compact]="true" title="暂无待审核提案" description="当执行 Agent 提交新的记忆建议时会出现在这里。" />
      } @else {
        <div class="proposals-list">
          @for (item of pending(); track item.id) {
            <div class="proposal-card">
              <div class="proposal-card__head">
                <div class="proposal-card__badges">
                  <app-badge [tone]="kindTone(item.kind)" size="sm">{{ kindLabel(item.kind) }}</app-badge>
                  <app-badge tone="neutral" appearance="outline" size="sm">{{ scopeLabel(item.scope) }}</app-badge>
                  <app-badge tone="neutral" appearance="outline" size="sm">{{ confidenceLabel(item.confidence) }}</app-badge>
                </div>
                <span class="proposal-card__agent">来自 {{ item.proposerAgentId }}</span>
              </div>

              <p class="proposal-card__content">{{ item.content }}</p>

              @if (item.reason) {
                <p class="proposal-card__reason">{{ item.reason }}</p>
              }

              <div class="proposal-card__actions">
                <app-button
                  variant="primary"
                  size="xs"
                  [disabled]="processingId() === item.id"
                  (click)="approve(item)"
                >
                  {{ processingId() === item.id ? '处理中...' : '写入记忆' }}
                </app-button>
                <app-button
                  variant="ghost"
                  size="xs"
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
  `,
  styles: [`
    :host {
      display: block;
    }

    .proposals-panel {
      gap: var(--space-4);
    }

    .proposals-header {
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .proposals-desc {
      margin: 0;
      font-size: var(--font-size-sm);
      line-height: 1.65;
      color: var(--color-text-secondary);
    }

    .proposals-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .proposal-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: var(--color-panel-subtle-bg);
    }

    .proposal-card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .proposal-card__badges {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      flex-wrap: wrap;
    }

    .proposal-card__agent {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      flex-shrink: 0;
    }

    .proposal-card__content {
      margin: 0;
      font-size: var(--font-size-sm);
      line-height: 1.55;
      color: var(--color-text);
    }

    .proposal-card__reason {
      margin: 0;
      font-size: var(--font-size-xs);
      line-height: 1.5;
      color: var(--color-text-secondary);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface-muted);
      border-radius: var(--radius-sm);
      border-left: 2px solid var(--color-border);
    }

    .proposal-card__actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-top: var(--space-1);
    }
  `],
})
export class MemoryProposalsComponent implements OnInit {
  private readonly service = inject(MemoryProposalService);

  readonly pending = signal<MemoryProposalRecord[]>([]);
  readonly loading = signal(false);
  readonly errorMsg = signal('');
  readonly processingId = signal<string | null>(null);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      const list = await firstValueFrom(this.service.list({ status: 'pending', limit: 50 }));
      this.pending.set(list ?? []);
    } catch {
      this.errorMsg.set('记忆提案加载失败，请确认后端服务已启动。');
    } finally {
      this.loading.set(false);
    }
  }

  async approve(item: MemoryProposalRecord) {
    this.processingId.set(item.id);
    try {
      await firstValueFrom(this.service.approve(item.id));
      await this.load();
    } finally {
      this.processingId.set(null);
    }
  }

  async reject(item: MemoryProposalRecord) {
    this.processingId.set(item.id);
    try {
      await firstValueFrom(this.service.reject(item.id));
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
      pattern: '模式',
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

  confidenceLabel(confidence: number): string {
    const pct = Math.round(confidence * 100);
    return `置信 ${pct}%`;
  }
}
