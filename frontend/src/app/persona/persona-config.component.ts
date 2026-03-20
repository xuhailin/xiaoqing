import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import {
  PersonaService,
  PersonaDto,
  EvolutionChange,
  EvolutionPreview,
} from '../core/services/persona.service';
import { ConversationService } from '../core/services/conversation.service';
import { Subscription } from 'rxjs';

interface FieldEntry {
  key: string;
  label: string;
  group: 'persona' | 'expression' | 'meta' | 'evolution';
  rows: number;
}

const FIELD_LAYOUT: FieldEntry[] = [
  { key: 'identity', label: '身份定位', group: 'persona', rows: 4 },
  { key: 'personality', label: '性格特质', group: 'persona', rows: 6 },
  { key: 'valueBoundary', label: '价值边界', group: 'persona', rows: 8 },
  { key: 'behaviorForbidden', label: '行为禁止项', group: 'persona', rows: 5 },
  { key: 'voiceStyle', label: '语言风格', group: 'expression', rows: 4 },
  { key: 'adaptiveRules', label: '自适应表达', group: 'expression', rows: 4 },
  { key: 'silencePermission', label: '留白许可', group: 'expression', rows: 4 },
  { key: 'metaFilterPolicy', label: 'Meta 过滤规则', group: 'meta', rows: 3 },
  { key: 'evolutionAllowed', label: '允许的进化方向', group: 'evolution', rows: 3 },
  { key: 'evolutionForbidden', label: '禁止的进化', group: 'evolution', rows: 3 },
];

@Component({
  selector: 'app-persona-config',
  standalone: true,
  template: `
    <div class="persona-config">
      @if (persona(); as p) {
        <div class="group-section">
          <div class="section-title">人格层</div>
          @for (f of personaFields; track f.key) {
            <div class="group">
              <label class="group-label">{{ f.label }}</label>
              <textarea
                [rows]="f.rows"
                [value]="fieldValues()[f.key]"
                (input)="setField(f.key, $any($event.target).value)"
                [placeholder]="f.label"
              ></textarea>
            </div>
          }
        </div>

        <div class="group-section">
          <div class="section-title">表达调度层</div>
          @for (f of expressionFields; track f.key) {
            <div class="group">
              <label class="group-label">{{ f.label }}</label>
              <textarea
                [rows]="f.rows"
                [value]="fieldValues()[f.key]"
                (input)="setField(f.key, $any($event.target).value)"
                [placeholder]="f.label"
              ></textarea>
            </div>
          }
        </div>

        <div class="group-section">
          <div class="section-title">Meta 层</div>
          @for (f of metaFields; track f.key) {
            <div class="group">
              <label class="group-label">{{ f.label }}</label>
              <textarea
                [rows]="f.rows"
                [value]="fieldValues()[f.key]"
                (input)="setField(f.key, $any($event.target).value)"
                [placeholder]="f.label"
              ></textarea>
            </div>
          }
        </div>

        <div class="group-section">
          <div class="section-title">进化约束</div>
          @for (f of evolutionFields; track f.key) {
            <div class="group">
              <label class="group-label">{{ f.label }}</label>
              <textarea
                [rows]="f.rows"
                [value]="fieldValues()[f.key]"
                (input)="setField(f.key, $any($event.target).value)"
                [placeholder]="f.label"
              ></textarea>
            </div>
          }
        </div>

        <div class="footer">
          <button type="button" class="save-btn" (click)="save()" [disabled]="saving()">
            {{ saving() ? '保存中...' : '保存' }}
          </button>
          @if (saveMsg()) {
            <span class="save-msg" [class.error]="saveMsg() === '保存失败'">{{ saveMsg() }}</span>
          }
        </div>

        <!-- 待确认进化建议 -->
        @if (pendingEvolution(); as evo) {
          <div class="group-section pending-section">
            <div class="section-title">进化建议</div>
            <div class="pending-hint">{{ evo.triggerReason }}</div>
            @if (evolutionPreview(); as preview) {
              <div class="pending-hint">以下是合并后的预览。确认后才会真正写入人格。</div>
              @for (field of preview.fields; track field.field) {
                <div class="pending-card">
                  <div class="pending-field">{{ getFieldLabel(field.field) }}</div>
                  <div class="pending-reason">
                    {{ getLayerLabel(field.layer) }} · {{ getRiskLabel(field.risk) }}
                  </div>
                  @if (field.risk === 'high') {
                    <div class="risk-warning">这是核心人格高危变更，只应在长期稳定证据下采纳。</div>
                  }
                  @if (field.added.length > 0) {
                    <div class="diff-group">
                      <div class="diff-label diff-label--add">将新增 / 保留</div>
                      @for (item of field.added; track item) {
                        <div class="diff-chip diff-chip--add">{{ item }}</div>
                      }
                    </div>
                  }
                  @if (field.removed.length > 0) {
                    <div class="diff-group">
                      <div class="diff-label diff-label--remove">将删除 / 被合并</div>
                      @for (item of field.removed; track item) {
                        <div class="diff-chip diff-chip--remove">{{ item }}</div>
                      }
                    </div>
                  }
                  <div class="diff-group">
                    <div class="diff-label">合并后字段</div>
                    <pre class="pending-preview">{{ field.after }}</pre>
                  </div>
                </div>
              }
              <div class="pending-card-actions">
                <button type="button" class="save-btn" (click)="acceptEvolution()" [disabled]="evolving()">
                  {{ evolving() ? '处理中...' : hasHighRiskPreview() ? '高危确认采纳' : '确认采纳' }}
                </button>
                <button type="button" class="reject-btn" (click)="cancelEvolutionPreview()" [disabled]="evolving()">返回修改前</button>
                <button type="button" class="reject-btn" (click)="rejectEvolution()" [disabled]="evolving()">拒绝</button>
              </div>
            } @else {
              @for (c of evo.changes; track c.field + c.content) {
                <div class="pending-card">
                  <div class="pending-field">{{ getFieldLabel(c.targetField || c.field) }}</div>
                  <div class="pending-reason">
                    {{ getLayerLabel(c.layer) }} · {{ getRiskLabel(c.risk) }}
                    @if (c.reroutedFrom) {
                      · 从 {{ getFieldLabel(c.reroutedFrom) }} 重路由
                    }
                  </div>
                  <pre class="pending-preview">{{ c.content }}</pre>
                  <div class="pending-reason">{{ c.reason }}</div>
                </div>
              }
              <div class="pending-card-actions">
                <button type="button" class="save-btn" (click)="acceptEvolution()" [disabled]="evolving()">
                  {{ evolving() ? '处理中...' : '查看合并预览' }}
                </button>
                <button type="button" class="reject-btn" (click)="rejectEvolution()" [disabled]="evolving()">拒绝</button>
              </div>
            }
          </div>
        }
      } @else {
        <p class="placeholder">加载中...</p>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    :host::-webkit-scrollbar { width: 4px; }
    :host::-webkit-scrollbar-track { background: transparent; }
    :host::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: var(--radius-pill);
    }

    .persona-config {
      padding: var(--space-1) 0;
    }

    .group-section {
      margin-bottom: var(--space-4);
    }

    .section-title {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: var(--space-3);
      padding-bottom: var(--space-1);
      border-bottom: 1px solid var(--color-border-light);
    }

    .group {
      margin-bottom: var(--space-3);
    }

    .group-label {
      display: block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-1);
      letter-spacing: 0.01em;
    }

    textarea {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      color: var(--color-text);
      background: var(--color-surface);
      resize: vertical;
      line-height: var(--line-height-base);
      transition: border-color var(--transition-fast);
      white-space: pre-wrap;

      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-focus-ring);
      }

      &::placeholder { color: var(--color-text-muted); }
    }

    .footer {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding-top: var(--space-2);
    }

    .save-btn {
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-md);
      border: none;
      background: var(--color-button-primary-bg);
      color: var(--color-button-primary-text);
      cursor: pointer;
      font-size: var(--font-size-xs);
      font-family: var(--font-family);
      font-weight: var(--font-weight-medium);
      transition: background var(--transition-fast), box-shadow var(--transition-fast);

      &:not(:disabled):hover {
        background: var(--color-button-primary-hover-bg);
        box-shadow: var(--color-button-primary-shadow);
      }
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }

    .save-msg {
      font-size: var(--font-size-xs);
      color: var(--color-success);

      &.error { color: var(--color-error); }
    }

    .placeholder {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      font-style: italic;
    }

    .pending-section {
      margin-top: var(--space-4);
      padding-top: var(--space-3);
      border-top: 2px solid var(--color-warning-border);
    }

    .pending-section .section-title {
      color: var(--color-warning-soft-text);
      border-bottom-color: var(--color-warning-border);
    }

    .pending-card {
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-2);
    }

    .pending-preview {
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      color: var(--color-text);
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
      line-height: var(--line-height-base);
    }

    .pending-field {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-primary);
      margin-bottom: var(--space-1);
    }

    .pending-reason {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      margin-top: var(--space-1);
    }

    .pending-hint {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      margin-bottom: var(--space-2);
    }

    .pending-card-actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }

    .reject-btn {
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      cursor: pointer;
      font-size: var(--font-size-xs);
      font-family: var(--font-family);
      font-weight: var(--font-weight-medium);
      transition: all var(--transition-fast);

      &:not(:disabled):hover {
        border-color: var(--color-error);
        color: var(--color-error);
      }
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }

    .diff-group {
      margin-top: var(--space-2);
    }

    .diff-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      margin-bottom: var(--space-1);
    }

    .diff-label--add {
      color: var(--color-success);
    }

    .diff-label--remove {
      color: var(--color-error);
    }

    .diff-chip {
      font-size: var(--font-size-xs);
      line-height: 1.5;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      margin-bottom: var(--space-1);
      word-break: break-word;
    }

    .diff-chip--add {
      background: var(--color-success-soft-bg);
      border: 1px solid var(--color-success-soft-border);
      color: var(--color-success-soft-text);
    }

    .diff-chip--remove {
      background: var(--color-danger-soft-bg);
      border: 1px solid var(--color-danger-soft-border);
      color: var(--color-danger-soft-text);
    }

    .risk-warning {
      margin-top: var(--space-1);
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      background: var(--color-warning-soft-bg);
      border: 1px solid var(--color-warning-soft-border);
      color: var(--color-warning-soft-text);
      font-size: var(--font-size-xs);
    }
  `],
})
export class PersonaConfigComponent implements OnInit, OnDestroy {
  private personaService = inject(PersonaService);
  private conversationService = inject(ConversationService);
  private refreshSub?: Subscription;

  persona = signal<PersonaDto | null>(null);
  fieldValues = signal<Record<string, string>>({});
  saving = signal(false);
  saveMsg = signal('');
  pendingEvolution = signal<{ changes: EvolutionChange[]; triggerReason: string; createdAt: string } | null>(null);
  evolutionPreview = signal<EvolutionPreview | null>(null);
  evolving = signal(false);

  personaFields = FIELD_LAYOUT.filter((f) => f.group === 'persona');
  expressionFields = FIELD_LAYOUT.filter((f) => f.group === 'expression');
  metaFields = FIELD_LAYOUT.filter((f) => f.group === 'meta');
  evolutionFields = FIELD_LAYOUT.filter((f) => f.group === 'evolution');

  async ngOnInit() {
    const p = await this.personaService.get().toPromise();
    if (p) {
      this.persona.set(p);
      this.fieldValues.set({
        identity: p.identity,
        personality: p.personality,
        valueBoundary: p.valueBoundary,
        behaviorForbidden: p.behaviorForbidden,
        voiceStyle: p.voiceStyle,
        adaptiveRules: p.adaptiveRules,
        silencePermission: p.silencePermission,
        metaFilterPolicy: p.metaFilterPolicy,
        evolutionAllowed: p.evolutionAllowed,
        evolutionForbidden: p.evolutionForbidden,
        });
    }
    await this.loadPendingEvolution();
    this.refreshSub = this.conversationService.refreshList$.subscribe(() => {
      this.loadPendingEvolution();
    });
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
  }

  setField(key: string, value: string) {
    this.fieldValues.set({ ...this.fieldValues(), [key]: value });
  }

  async save() {
    this.saving.set(true);
    this.saveMsg.set('');
    try {
      const vals = this.fieldValues();
      const updated = await this.personaService
        .update({
          identity: vals['identity'],
          personality: vals['personality'],
          valueBoundary: vals['valueBoundary'],
          behaviorForbidden: vals['behaviorForbidden'],
          voiceStyle: vals['voiceStyle'],
          adaptiveRules: vals['adaptiveRules'],
          silencePermission: vals['silencePermission'],
          metaFilterPolicy: vals['metaFilterPolicy'],
          evolutionAllowed: vals['evolutionAllowed'],
          evolutionForbidden: vals['evolutionForbidden'],
        })
        .toPromise();
      if (updated) this.persona.set(updated);
      this.saveMsg.set('已保存');
    } catch {
      this.saveMsg.set('保存失败');
    } finally {
      this.saving.set(false);
    }
  }

  private static readonly FIELD_LABELS: Record<string, string> = {
    identity: '身份定位',
    personality: '性格特质',
    valueBoundary: '价值边界',
    behaviorForbidden: '行为禁止项',
    voiceStyle: '语言风格',
    adaptiveRules: '自适应表达',
    silencePermission: '留白许可',
    metaFilterPolicy: 'Meta 过滤规则',
    preferredVoiceStyle: '偏好语气',
    praisePreference: '夸赞偏好',
    responseRhythm: '回应节奏偏好',
  };

  getFieldLabel(field: string): string {
    return PersonaConfigComponent.FIELD_LABELS[field] ?? field;
  }

  getLayerLabel(layer?: string): string {
    switch (layer) {
      case 'persona-core':
        return '人格核心';
      case 'persona-boundary':
        return '人格边界';
      case 'user-preference':
        return '用户偏好';
      case 'expression':
        return '表达调度';
      default:
        return '未分类';
    }
  }

  getRiskLabel(risk?: string): string {
    switch (risk) {
      case 'high':
        return '高危';
      case 'medium':
        return '中危';
      case 'low':
        return '低危';
      default:
        return '未评级';
    }
  }

  hasHighRiskPreview(): boolean {
    return this.evolutionPreview()?.fields.some((field) => field.risk === 'high') ?? false;
  }

  // ── Evolution accept/reject ──

  private async loadPendingEvolution() {
    try {
      const evo = await this.personaService.getPendingEvolution().toPromise();
      this.pendingEvolution.set(evo ?? null);
      this.evolutionPreview.set(null);
    } catch {
      this.pendingEvolution.set(null);
      this.evolutionPreview.set(null);
    }
  }

  async acceptEvolution() {
    const evo = this.pendingEvolution();
    if (!evo) return;
    this.evolving.set(true);
    try {
      const preview = this.evolutionPreview();
      if (!preview) {
        const result = await this.personaService.previewEvolution(evo.changes).toPromise();
        if (result?.preview) this.evolutionPreview.set(result.preview);
        return;
      }

      const result = await this.personaService.confirmEvolution(preview.changes).toPromise();
      if (result?.persona) this.persona.set(result.persona);
      await this.personaService.clearPendingEvolution().toPromise();
      this.pendingEvolution.set(null);
      this.evolutionPreview.set(null);
    } finally {
      this.evolving.set(false);
    }
  }

  cancelEvolutionPreview() {
    this.evolutionPreview.set(null);
  }

  async rejectEvolution() {
    this.evolving.set(true);
    try {
      await this.personaService.clearPendingEvolution().toPromise();
      this.pendingEvolution.set(null);
      this.evolutionPreview.set(null);
    } finally {
      this.evolving.set(false);
    }
  }
}
