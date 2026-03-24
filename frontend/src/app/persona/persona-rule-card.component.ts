import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import {
  PersonaRuleDto,
  PersonaService,
} from '../core/services/persona.service';
import { AppButtonComponent } from '../shared/ui/app-button.component';

@Component({
  selector: 'app-persona-rule-card',
  standalone: true,
  imports: [AppButtonComponent],
  template: `
    <div class="rule-card" [class.rule-card--deprecated]="rule.status === 'DEPRECATED'">
      <div class="rule-card__meta">
        <span class="badge" [class]="statusClass()">{{ rule.status }}</span>
        @if (rule.protectLevel === 'LOCKED') {
          <span class="lock" title="锁定规则：默认只读防误改，可在卡片内「解锁编辑」">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11z"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        }
        <span class="cat">[{{ rule.category }}]</span>
        <label class="weight">
          <span class="weight__label">weight</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            [value]="rule.weight"
            [disabled]="rule.status === 'DEPRECATED' || (rule.protectLevel === 'LOCKED' && !lockedEditUnlocked())"
            (change)="onWeightChange($event)"
          />
        </label>
        <span class="src">source: {{ rule.source }}</span>
      </div>
      @if (showContentEditor()) {
        <textarea
          class="rule-card__body"
          rows="3"
          [value]="rule.content"
          (blur)="onContentBlur($event)"
        ></textarea>
        @if (rule.protectLevel === 'LOCKED') {
          <div class="rule-card__banner">
            正在编辑锁定规则，保存方式为失焦提交或调整 weight；完成后可点「取消解锁」恢复只读。
          </div>
        }
      } @else {
        <div class="rule-card__body rule-card__body--readonly">{{ rule.content }}</div>
        @if (rule.protectLevel === 'LOCKED') {
          <div class="rule-card__hint-row">
            <span class="rule-card__hint">锁定规则默认只读，避免误改核心纪律。</span>
            <app-button variant="ghost" size="sm" type="button" (click)="unlockLockedEdit()">
              解锁编辑
            </app-button>
          </div>
        }
      }
      @if (rule.pendingContent) {
        <div class="pending-block">
          <div class="pending-label">进化建议（待确认）</div>
          <div class="pending-text">{{ rule.pendingContent }}</div>
          <div class="pending-actions">
            <app-button variant="success" size="sm" (click)="adoptPending()">采纳</app-button>
            <app-button variant="ghost" size="sm" (click)="ignorePending()">忽略</app-button>
          </div>
        </div>
      }
      <div class="rule-card__actions">
        @if (rule.protectLevel === 'LOCKED' && lockedEditUnlocked() && rule.status !== 'DEPRECATED') {
          <app-button variant="ghost" size="sm" type="button" (click)="cancelLockedEdit()">取消解锁</app-button>
        }
        @if (rule.status === 'CANDIDATE' && !rule.pendingContent) {
          <app-button variant="success" size="sm" (click)="promote()">晋升为 STABLE</app-button>
        }
        @if (rule.status !== 'DEPRECATED') {
          <app-button variant="danger" size="sm" (click)="deprecate()">弃用</app-button>
        }
      </div>
      @if (busy()) {
        <div class="rule-card__busy">处理中…</div>
      }
    </div>
  `,
  styles: [`
    .rule-card {
      border: 1px solid var(--color-border);
      border-radius: var(--workbench-card-radius);
      padding: var(--space-3);
      background: var(--color-surface);
      margin-bottom: var(--space-3);
      position: relative;
    }
    .rule-card--deprecated {
      opacity: 0.55;
      background: var(--color-bg);
    }
    .rule-card__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-2);
    }
    .badge {
      padding: 2px var(--space-2);
      border-radius: var(--radius-pill);
      font-weight: var(--font-weight-medium);
    }
    .badge--core {
      background: var(--color-primary-light);
      color: var(--color-primary);
    }
    .badge--stable {
      background: var(--color-success-bg);
      color: var(--color-success);
      border: 1px solid var(--color-success-border);
    }
    .badge--candidate {
      background: var(--color-warning-bg);
      color: var(--color-warning);
      border: 1px solid var(--color-warning-border);
    }
    .badge--deprecated {
      background: var(--color-border-light);
      color: var(--color-text-muted);
    }
    .lock {
      display: inline-flex;
      color: var(--color-text-muted);
    }
    .cat {
      font-family: var(--font-family);
    }
    .weight {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }
    .weight__label {
      color: var(--color-text-muted);
    }
    .weight input {
      width: 4rem;
      font-size: var(--font-size-xs);
      padding: 2px var(--space-1);
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
    }
    .src {
      color: var(--color-text-muted);
    }
    .rule-card__body {
      width: 100%;
      font-size: var(--font-size-sm);
      line-height: var(--line-height-relaxed);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-2);
      font-family: var(--font-family);
      resize: vertical;
    }
    .rule-card__body--readonly {
      border: none;
      padding: 0;
      white-space: pre-wrap;
    }
    .rule-card__hint {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }
    .rule-card__hint-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .rule-card__banner {
      margin-top: var(--space-2);
      padding: var(--space-2);
      font-size: var(--font-size-xs);
      line-height: var(--line-height-base);
      color: var(--color-text-secondary);
      background: var(--color-primary-light);
      border-radius: var(--radius-md);
    }
    .pending-block {
      margin-top: var(--space-3);
      padding: var(--space-2);
      border-radius: var(--radius-md);
      background: var(--color-warning-bg);
      border: 1px solid var(--color-warning-border);
    }
    .pending-label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-warning);
      margin-bottom: var(--space-1);
    }
    .pending-text {
      font-size: var(--font-size-sm);
      color: var(--color-text);
      white-space: pre-wrap;
    }
    .pending-actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .rule-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
    .rule-card__busy {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      border-radius: var(--workbench-card-radius);
    }
  `],
})
export class PersonaRuleCardComponent implements OnChanges {
  private personaApi = inject(PersonaService);

  @Input({ required: true }) rule!: PersonaRuleDto;
  @Output() changed = new EventEmitter<void>();

  busy = signal(false);
  /** LOCKED 规则显式解锁后才显示编辑区，避免误操作 */
  lockedEditUnlocked = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    const r = changes['rule'];
    if (!r?.previousValue || !r?.currentValue) return;
    const prev = r.previousValue as PersonaRuleDto;
    const curr = r.currentValue as PersonaRuleDto;
    if (prev.key !== curr.key) {
      this.lockedEditUnlocked.set(false);
    }
  }

  statusClass(): string {
    switch (this.rule.status) {
      case 'CORE':
        return 'badge badge--core';
      case 'STABLE':
        return 'badge badge--stable';
      case 'CANDIDATE':
        return 'badge badge--candidate';
      case 'DEPRECATED':
        return 'badge badge--deprecated';
      default:
        return 'badge';
    }
  }

  showContentEditor(): boolean {
    return (
      this.rule.status !== 'DEPRECATED'
      && (this.rule.protectLevel !== 'LOCKED' || this.lockedEditUnlocked())
    );
  }

  unlockLockedEdit(): void {
    this.lockedEditUnlocked.set(true);
  }

  cancelLockedEdit(): void {
    this.lockedEditUnlocked.set(false);
  }

  async onWeightChange(ev: Event) {
    const v = Number((ev.target as HTMLInputElement).value);
    if (Number.isNaN(v)) return;
    await this.run(() =>
      this.personaApi.updateRule(this.rule.key, { weight: Math.min(1, Math.max(0, v)) }).toPromise(),
    );
  }

  async onContentBlur(ev: Event) {
    const next = (ev.target as HTMLTextAreaElement).value.trim();
    if (next === this.rule.content.trim()) return;
    await this.run(() => this.personaApi.updateRule(this.rule.key, { content: next }).toPromise());
  }

  async promote() {
    await this.run(() => this.personaApi.promoteRule(this.rule.key).toPromise());
  }

  async deprecate() {
    await this.run(() => this.personaApi.deprecateRule(this.rule.key).toPromise());
  }

  async adoptPending() {
    if (!this.rule.pendingContent) return;
    await this.run(() =>
      this.personaApi
        .updateRule(this.rule.key, {
          content: this.rule.pendingContent!,
          pendingContent: null,
          status: 'STABLE',
        })
        .toPromise(),
    );
  }

  async ignorePending() {
    await this.run(() =>
      this.personaApi.updateRule(this.rule.key, { pendingContent: null }).toPromise(),
    );
  }

  private async run(op: () => Promise<unknown>) {
    this.busy.set(true);
    try {
      await op();
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
