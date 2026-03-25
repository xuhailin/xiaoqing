import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import {
  PersonaService,
  PersonaDto,
  EvolutionChange,
  EvolutionPreview,
} from '../core/services/persona.service';
import { ConversationService } from '../core/services/conversation.service';
import { Subscription } from 'rxjs';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent, type AppIconName } from '../shared/ui/app-icon.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { UserProfileService, type UserProfileDto } from '../core/services/user-profile.service';
import type { PersonaSlotDto } from '../core/services/persona.service';

interface FieldEntry {
  key: string;
  label: string;
  hint: string;
  group: 'persona' | 'expression' | 'meta' | 'evolution';
  rows: number;
}

const FIELD_LAYOUT: FieldEntry[] = [
  { key: 'identity', label: '身份定位', hint: '说明小晴是谁，以及她与你站在什么关系里。', group: 'persona', rows: 4 },
  { key: 'personality', label: '性格特质', hint: '描述稳定的性格基调，而不是某次对话里的短期情绪。', group: 'persona', rows: 6 },
  { key: 'valueBoundary', label: '价值边界', hint: '写下始终坚持的判断标准、偏向和底线。', group: 'persona', rows: 8 },
  { key: 'behaviorForbidden', label: '行为禁止项', hint: '明确哪些表达和行为不应该出现在小晴身上。', group: 'persona', rows: 5 },
  { key: 'expressionRules', label: '表达纪律', hint: '直接控制表达风格（说法、节奏、留白、何时停）。', group: 'expression', rows: 7 },
  { key: 'metaFilterPolicy', label: 'Meta 过滤规则', hint: '放系统级的表达过滤，不承载具体人格内容。', group: 'meta', rows: 3 },
  { key: 'evolutionAllowed', label: '允许的进化方向', hint: '只写可以被长期证据推动的变化方向。', group: 'evolution', rows: 3 },
  { key: 'evolutionForbidden', label: '禁止的进化', hint: '明确哪些变化即使有短期信号也不应发生。', group: 'evolution', rows: 3 },
];

@Component({
  selector: 'app-persona-config',
  standalone: true,
  imports: [
    AppButtonComponent,
    AppIconComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
  ],
  template: `
    <div class="persona-config">
      @if (persona(); as p) {
        <div class="editor-shell">
          <aside class="editor-sidebar">
            <nav class="config-sidebar" aria-label="设置分区">
              @for (section of configSections; track section.id) {
                <button
                  type="button"
                  class="sidebar-link"
                  [class.active]="activeSectionId() === section.id"
                  (click)="scrollToPersonaSection(section.id)"
                >
                  <app-icon [name]="section.icon" size="1.1rem" class="sidebar-link__icon" />
                  <span>{{ section.label }}</span>
                </button>
              }
            </nav>

            <app-panel variant="subtle" class="sidebar-panel" padding="md">
              <div class="sidebar-meta">
                <div class="sidebar-meta__label">保存状态</div>
                <div class="sidebar-meta__hint">
                  @if (saveMsg()) {
                    <span class="save-msg" [class.error]="saveMsg() === '保存失败'">{{ saveMsg() }}</span>
                  } @else {
                    修改后统一保存，保持人格层级的一致性。
                  }
                </div>
              </div>

              <app-button type="button" variant="primary" size="sm" [stretch]="true" (click)="save()" [disabled]="saving()">
                {{ saving() ? '保存中...' : '保存全部' }}
              </app-button>
            </app-panel>

            <app-panel variant="subtle" class="sidebar-panel" padding="md">
              <div class="sidebar-meta">
                <div class="sidebar-meta__label">人格切换</div>
                <div class="sidebar-meta__hint">决定当前“默认人格”，并影响对话注入。</div>
              </div>

              <div class="persona-switch">
                @for (slot of personaSlots(); track slot.personaKey) {
                  <app-button
                    variant="ghost"
                    size="sm"
                    [stretch]="true"
                    type="button"
                    (click)="switchPersona(slot.personaKey)"
                    [disabled]="selectedPersonaKey() === slot.personaKey"
                  >
                    {{ getPersonaLabel(slot) }}
                  </app-button>
                }
              </div>

              <div class="persona-switch__actions">
                <app-button
                  variant="primary"
                  size="sm"
                  [stretch]="true"
                  type="button"
                  (click)="createPersona()"
                  [disabled]="creatingPersona()"
                >
                  新建人格
                </app-button>
              </div>
            </app-panel>

            <app-panel variant="soft" class="sidebar-panel sidebar-note" padding="md">
              <div class="sidebar-eyebrow">编辑原则</div>
              <div class="sidebar-meta__hint">优先保持稳定人格，只改真正长期有效的设定，避免把短期情绪写进核心人格。</div>
            </app-panel>

            @if (pendingEvolution()) {
              <app-panel variant="warning" class="sidebar-panel" padding="md">
                <div class="sidebar-eyebrow">待确认进化</div>
                <div class="sidebar-meta__hint">有新的进化建议等待你确认，本页底部可以查看完整预览。</div>
                <button
                  type="button"
                  class="sidebar-link sidebar-link--warning"
                  (click)="scrollToPersonaSection('persona-pending-evolution')"
                >
                  跳转查看
                </button>
              </app-panel>
            }
          </aside>

          <div class="editor-main">
            <section class="group-section" id="persona-core">
              <app-panel variant="workbench" class="section-panel" padding="md">
                <app-section-header
                  class="section-header"
                  title="人格层"
                  description="定义小晴是谁、站在你身边时坚持什么，以及什么事情不能做。"
                />
                <div class="field-stack">
                  @for (f of personaFields; track f.key) {
                    <label class="field-card">
                      <span class="field-card__header">
                        <span class="group-label">{{ f.label }}</span>
                        <span class="field-hint">{{ f.hint }}</span>
                      </span>
                      <textarea
                        [rows]="f.rows"
                        [value]="fieldValues()[f.key]"
                        (input)="setField(f.key, $any($event.target).value)"
                        [placeholder]="f.label"
                      ></textarea>
                    </label>
                  }
                </div>
              </app-panel>
            </section>

            <section class="group-section" id="persona-expression">
              <app-panel variant="workbench" class="section-panel" padding="md">
                <app-section-header
                  class="section-header"
                  title="表达调度层"
                  description="决定小晴怎么说、如何适应当下对话，以及什么时候保留留白。"
                />
                <div class="field-stack">
                  @for (f of expressionFields; track f.key) {
                    <label class="field-card">
                      <span class="field-card__header">
                        <span class="group-label">{{ f.label }}</span>
                        <span class="field-hint">{{ f.hint }}</span>
                      </span>
                      <textarea
                        [rows]="f.rows"
                        [value]="fieldValues()[f.key]"
                        (input)="setField(f.key, $any($event.target).value)"
                        [placeholder]="f.label"
                      ></textarea>
                    </label>
                  }
                </div>
                <p class="expression-note">
                  当前表达纪律以 <code>persona.expressionRules</code> 为注入来源；如果你把它置空，系统才会回退到结构化表达规则。
                </p>
              </app-panel>
            </section>

            <section class="group-section" id="persona-meta">
              <app-panel variant="subtle" class="section-panel" padding="md">
                <app-section-header
                  class="section-header"
                  title="Meta 层"
                  description="处理系统级的过滤与表达守门规则，尽量保持简洁和稳定。"
                />
                <div class="field-stack field-stack--compact">
                  @for (f of metaFields; track f.key) {
                    <label class="field-card">
                      <span class="field-card__header">
                        <span class="group-label">{{ f.label }}</span>
                        <span class="field-hint">{{ f.hint }}</span>
                      </span>
                      <textarea
                        [rows]="f.rows"
                        [value]="fieldValues()[f.key]"
                        (input)="setField(f.key, $any($event.target).value)"
                        [placeholder]="f.label"
                      ></textarea>
                    </label>
                  }
                </div>
              </app-panel>
            </section>

            <section class="group-section" id="persona-evolution">
              <app-panel variant="subtle" class="section-panel" padding="md">
                <app-section-header
                  class="section-header"
                  title="进化约束"
                  description="给自动进化明确边界，让人格调整只发生在你允许的范围内。"
                />
                <div class="field-stack field-stack--compact">
                  @for (f of evolutionFields; track f.key) {
                    <label class="field-card">
                      <span class="field-card__header">
                        <span class="group-label">{{ f.label }}</span>
                        <span class="field-hint">{{ f.hint }}</span>
                      </span>
                      <textarea
                        [rows]="f.rows"
                        [value]="fieldValues()[f.key]"
                        (input)="setField(f.key, $any($event.target).value)"
                        [placeholder]="f.label"
                      ></textarea>
                    </label>
                  }
                </div>
              </app-panel>
            </section>

            @if (pendingEvolution(); as evo) {
              <section class="group-section" id="persona-pending-evolution">
                <app-panel variant="warning" class="section-panel pending-section" padding="md">
                  <app-section-header
                    class="section-header"
                    title="进化建议"
                    [description]="evo.triggerReason"
                  />
                  @if (evolutionPreview(); as preview) {
                    <div class="pending-hint">以下是合并后的预览。确认后才会真正写入人格。</div>
                    @if (preview.expressionRuleDrafts?.length) {
                      <div class="pending-card">
                        <div class="pending-field">表达纪律（结构化草案）</div>
                        <div class="pending-reason">将经 PersonaRule 合并：LOCKED 规则不会被覆盖</div>
                        @for (d of preview.expressionRuleDrafts; track d.key) {
                          <div class="rule-draft-row">
                            <div class="rule-draft-key">{{ d.key }} · {{ d.category }}</div>
                            <pre class="pending-preview">{{ d.content }}</pre>
                            <div class="pending-reason">{{ d.reason }}</div>
                          </div>
                        }
                      </div>
                    }
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
                    <div class="pending-hint">以下是本轮待确认的变化摘要。</div>
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
                </app-panel>
              </section>
            }
          </div>
        </div>
      } @else {
        <app-panel variant="subtle" padding="md">
          <p class="placeholder">加载中...</p>
        </app-panel>
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
      padding: 0;
    }

    .editor-shell {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      gap: var(--space-6);
      min-height: 0;
      align-items: start;
    }

    .editor-sidebar {
      position: sticky;
      top: var(--space-2);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .config-sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-2);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      border: 1px solid var(--color-border-light);
    }

    .sidebar-panel,
    .section-panel {
      gap: var(--space-4);
    }

    .sidebar-note {
      gap: var(--space-2);
    }

    .sidebar-eyebrow {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    button.sidebar-link {
      font-family: inherit;
      width: 100%;
      text-align: left;
    }

    .sidebar-link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: all var(--transition-base);
      border: 1px solid transparent;
      cursor: pointer;
      background: transparent;
    }

    .sidebar-link:hover {
      background: var(--color-surface-hover);
      color: var(--color-text);
    }

    .sidebar-link.active {
      background: var(--color-surface-highlight);
      color: var(--color-text);
      border-color: var(--color-border);
      font-weight: var(--font-weight-semibold);
    }

    .sidebar-link__icon {
      flex-shrink: 0;
    }

    .sidebar-link--warning {
      color: var(--color-warning-soft-text);
      background: var(--color-warning-soft-bg);
      border-color: var(--color-warning-soft-border);
    }

    .sidebar-link--warning:hover {
      color: var(--color-warning-soft-text);
      filter: brightness(0.97);
    }

    .sidebar-meta {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .sidebar-meta__label {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .sidebar-meta__value {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .sidebar-meta__hint {
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .editor-main {
      display: flex;
      flex-direction: column;
      gap: var(--workbench-section-gap);
    }

    .group-section {
      margin: 0;
    }

    .section-header {
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-light);
    }

    .field-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .field-stack--compact {
      gap: var(--space-2);
    }

    .field-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3);
      border-radius: var(--workbench-card-radius);
      border: 1px solid var(--color-border-light);
      background: var(--color-surface);
    }

    .field-card__header {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .group-label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      letter-spacing: 0.01em;
    }

    .field-hint {
      font-size: var(--font-size-xs);
      line-height: 1.6;
      color: var(--color-text-muted);
    }

    textarea {
      width: 100%;
      padding: var(--space-3);
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
      gap: var(--space-4);
    }

    .pending-card {
      padding: var(--space-3);
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

    .expression-note {
      margin-top: var(--space-2);
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: var(--line-height-base);
    }

    .persona-switch {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .persona-switch__actions {
      margin-top: var(--space-3);
    }

    .rule-draft-row {
      margin-top: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border-light);
    }

    .rule-draft-key {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-1);
    }

    @media (max-width: 1120px) {
      .editor-shell {
        grid-template-columns: 1fr;
      }

      .editor-sidebar {
        position: static;
        top: auto;
      }
    }
  `],
})
export class PersonaConfigComponent implements OnInit, OnDestroy {
  protected readonly FIELD_LAYOUT = FIELD_LAYOUT;
  protected readonly configSections: readonly { id: string; label: string; icon: AppIconName }[] = [
    { id: 'persona-core', label: '人格层', icon: 'sparkles' },
    { id: 'persona-expression', label: '表达调度', icon: 'chatBubble' },
    { id: 'persona-meta', label: 'Meta 层', icon: 'layers' },
    { id: 'persona-evolution', label: '进化约束', icon: 'chartLine' },
  ];
  protected readonly activeSectionId = signal<string>('persona-core');

  private personaService = inject(PersonaService);
  private conversationService = inject(ConversationService);
  private userProfileService = inject(UserProfileService);
  private refreshSub?: Subscription;

  persona = signal<PersonaDto | null>(null);
  fieldValues = signal<Record<string, string>>({});
  personaSlots = signal<PersonaSlotDto[]>([]);
  selectedPersonaKey = signal<string>('default');
  creatingPersona = signal(false);
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
    const profile = await this.userProfileService.get().toPromise();
    this.selectedPersonaKey.set(profile?.preferredPersonaKey || 'default');

    const slots = await this.personaService.getActiveSlots().toPromise();
    this.personaSlots.set(slots ?? []);

    const p = await this.personaService.get(this.selectedPersonaKey()).toPromise();
    if (p) {
      this.persona.set(p);
      this.fieldValues.set({
        identity: p.identity,
        personality: p.personality,
        valueBoundary: p.valueBoundary,
        behaviorForbidden: p.behaviorForbidden,
        expressionRules: p.expressionRules,
        metaFilterPolicy: p.metaFilterPolicy,
        evolutionAllowed: p.evolutionAllowed,
        evolutionForbidden: p.evolutionForbidden,
      });
    }

    // 创建新 personaKey 时列表可能落后；这里再刷新一次兜底。
    const slots2 = await this.personaService.getActiveSlots().toPromise();
    this.personaSlots.set(slots2 ?? []);

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

  scrollToPersonaSection(id: string): void {
    this.activeSectionId.set(id);
    globalThis.document?.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private async reloadPersonaForKey(personaKey: string) {
    const p = await this.personaService.get(personaKey).toPromise();
    if (!p) return;
    this.persona.set(p);
    this.fieldValues.set({
      identity: p.identity,
      personality: p.personality,
      valueBoundary: p.valueBoundary,
      behaviorForbidden: p.behaviorForbidden,
      expressionRules: p.expressionRules,
      metaFilterPolicy: p.metaFilterPolicy,
      evolutionAllowed: p.evolutionAllowed,
      evolutionForbidden: p.evolutionForbidden,
    });
  }

  getPersonaLabel(slot: PersonaSlotDto): string {
    const line = slot.identity
      ?.split('\n')
      .map((s) => s.trim())
      .find((s) => !!s);
    return line || slot.personaKey;
  }

  async switchPersona(personaKey: string) {
    if (!personaKey?.trim() || this.selectedPersonaKey() === personaKey) return;
    try {
      await this.userProfileService.update({ preferredPersonaKey: personaKey }).toPromise();
      this.selectedPersonaKey.set(personaKey);
      await this.reloadPersonaForKey(personaKey);
      await this.loadPendingEvolution();
    } catch {
      // 静默失败：避免打断配置页编辑；用户可稍后重试
    }
  }

  async createPersona() {
    if (this.creatingPersona()) return;
    this.creatingPersona.set(true);
    try {
      const created = await this.personaService
        .createPersonaSlot({ basePersonaKey: this.selectedPersonaKey() })
        .toPromise();

      if (!created?.personaKey) return;

      await this.userProfileService.update({ preferredPersonaKey: created.personaKey }).toPromise();
      this.selectedPersonaKey.set(created.personaKey);

      const slots = await this.personaService.getActiveSlots().toPromise();
      this.personaSlots.set(slots ?? []);

      await this.reloadPersonaForKey(created.personaKey);
      await this.loadPendingEvolution();
    } catch {
      // ignore
    } finally {
      this.creatingPersona.set(false);
    }
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
          expressionRules: vals['expressionRules'],
          metaFilterPolicy: vals['metaFilterPolicy'],
          evolutionAllowed: vals['evolutionAllowed'],
          evolutionForbidden: vals['evolutionForbidden'],
        }, this.selectedPersonaKey())
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
    expressionRules: '表达纪律',
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
