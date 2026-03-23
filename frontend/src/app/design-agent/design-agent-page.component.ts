import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { AppPageHeaderComponent } from '../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import {
  DesignAgentService,
  type DesignAuditMode,
  type DesignPageType,
  type DesignPreset,
  type RunDesignAuditResultDto,
} from '../core/services/design-agent.service';

type AuditTemplate = {
  label: string;
  pageType: DesignPageType;
  pageName: string;
  pageUrl: string;
  mode: DesignAuditMode;
  preset: DesignPreset;
  notes: string;
};

const DEFAULT_PRESET_BY_TYPE: Record<DesignPageType, DesignPreset> = {
  chat: 'warm-tech',
  workbench: 'serious-workbench',
  memory: 'quiet-personal',
};

const AUDIT_TEMPLATES: readonly AuditTemplate[] = [
  {
    label: '聊天主界面',
    pageType: 'chat',
    pageName: 'chat-main',
    pageUrl: '/chat',
    mode: 'full',
    preset: 'warm-tech',
    notes: '重点看聊天主舞台、空状态、输入区和左右密度是否协调。',
  },
  {
    label: '工作台首页',
    pageType: 'workbench',
    pageName: 'workspace-home',
    pageUrl: '/workspace',
    mode: 'full',
    preset: 'serious-workbench',
    notes: '重点看工作流信息层级、操作优先级和面板间距。',
  },
  {
    label: '记忆-认识你',
    pageType: 'memory',
    pageName: 'memory-understanding',
    pageUrl: '/memory/understanding',
    mode: 'full',
    preset: 'quiet-personal',
    notes: '重点看卡片节奏、说明文案层级和信息拥挤度。',
  },
];

@Component({
  selector: 'app-design-agent-page',
  standalone: true,
  imports: [
    FormsModule,
    AppBadgeComponent,
    AppButtonComponent,
    AppIconComponent,
    AppPageHeaderComponent,
    AppPanelComponent,
  ],
  template: `
    <div class="design-agent-page">
      <app-page-header
        eyebrow="Design Agent"
        title="设计审查台"
        description="统一发起页面设计审查，适合检查聊天、工作台和记忆页的代码结构与视觉一致性。"
      />

      <div class="design-agent-page__grid">
        <app-panel variant="subtle" padding="lg">
          <div class="design-agent-page__section-head">
            <div>
              <h2>一句话触发审查</h2>
              <p>输入你想检查的页面与关注点。</p>
            </div>
            <app-badge tone="info" appearance="outline">POST /design-agent/audits/run</app-badge>
          </div>

          <label class="field design-agent-page__field--wide">
            <span>审查目标（一句话）</span>
            <textarea
              class="ui-textarea"
              rows="4"
              [ngModel]="userSentence()"
              (ngModelChange)="userSentence.set($event)"
              placeholder="例如：审查 memory 页面 /memory/understanding，看看这个页面 UI 有没有问题"
            ></textarea>
            <p class="design-agent-page__field-help">
              MVP：目前可识别 memory + understanding（或直接包含 /memory/understanding）。
            </p>
          </label>

          <details class="design-agent-page__advanced">
            <summary>Advanced / Debug（保留原表单）</summary>
            <div class="design-agent-page__templates">
              @for (template of templates; track template.label) {
                <app-button variant="ghost" size="sm" (click)="applyTemplate(template)">
                  <app-icon name="sparkles" size="0.8rem" />
                  <span>{{ template.label }}</span>
                </app-button>
              }
            </div>

            <div class="design-agent-page__form">
            <label class="field">
              <span>页面类型</span>
              <select
                class="ui-select"
                [ngModel]="pageType()"
                (ngModelChange)="setPageType($event)"
              >
                <option value="chat">chat</option>
                <option value="workbench">workbench</option>
                <option value="memory">memory</option>
              </select>
            </label>

            <label class="field">
              <span>Preset</span>
              <select
                class="ui-select"
                [ngModel]="preset()"
                (ngModelChange)="preset.set($event)"
              >
                <option value="warm-tech">warm-tech</option>
                <option value="serious-workbench">serious-workbench</option>
                <option value="quiet-personal">quiet-personal</option>
              </select>
            </label>

            <label class="field">
              <span>审查模式</span>
              <select
                class="ui-select"
                [ngModel]="mode()"
                (ngModelChange)="mode.set($event)"
              >
                <option value="full">完整（代码 + 视觉）</option>
                <option value="code">代码结构（更偏实现）</option>
                <option value="visual">视觉一致性（更偏观感）</option>
              </select>
              <p class="design-agent-page__field-help">
                这只影响 Design Agent 的检查范围，不是切换到 DevAgent 执行。
              </p>
            </label>

            <label class="field design-agent-page__field--wide">
              <span>页面名称</span>
              <input
                class="ui-input"
                [ngModel]="pageName()"
                (ngModelChange)="pageName.set($event)"
                placeholder="例如：memory-understanding"
              />
            </label>

            <label class="field design-agent-page__field--wide">
              <span>页面 URL</span>
              <input
                class="ui-input"
                [ngModel]="pageUrl()"
                (ngModelChange)="pageUrl.set($event)"
                placeholder="/memory/understanding"
              />
            </label>

            <label class="field design-agent-page__field--wide">
              <span>目标文件（每行一个，可选）</span>
              <textarea
                class="ui-textarea"
                rows="5"
                [ngModel]="targetFilesText()"
                (ngModelChange)="targetFilesText.set($event)"
                placeholder="frontend/src/app/memory/memory-hub.component.ts"
              ></textarea>
            </label>

            <label class="field design-agent-page__field--wide">
              <span>补充说明（可选）</span>
              <textarea
                class="ui-textarea"
                rows="4"
                [ngModel]="notes()"
                (ngModelChange)="notes.set($event)"
                placeholder="补充本次最关注的视觉问题、布局问题或不想改动的区域"
              ></textarea>
            </label>
            </div>

            <div class="design-agent-page__actions">
              <app-button variant="primary" [disabled]="loading()" (click)="runAudit()">
                {{ loading() ? '审查中...' : '运行设计审查' }}
              </app-button>
              <app-button variant="ghost" [disabled]="loading()" (click)="resetForm()">
                重置
              </app-button>
            </div>

          </details>

          <div class="design-agent-page__actions">
            <app-button variant="primary" [disabled]="loading() || !userSentence().trim()" (click)="runFromSentence()">
              {{ loading() ? '审查中...' : '运行设计审查' }}
            </app-button>
          </div>

          @if (errorMessage()) {
            <div class="design-agent-page__notice design-agent-page__notice--error" role="alert">
              {{ errorMessage() }}
            </div>
          }
        </app-panel>

        <app-panel variant="workbench" padding="lg">
          <div class="design-agent-page__section-head">
            <div>
              <h2>审查结果</h2>
              <p>这里展示当前运行的摘要、发现项和建议操作（如果有）。</p>
              <p class="design-agent-page__field-help">目标：{{ pageUrl() }}</p>
            </div>
            @if (result(); as res) {
              <app-badge
                [tone]="summaryTone(res.auditResult?.summary?.riskLevel)"
                appearance="outline"
              >
                {{ res.auditResult?.summary?.riskLevel || 'unknown' }}
              </app-badge>
            }
          </div>

          @if (loading()) {
            <div class="design-agent-page__placeholder">
              <app-icon name="sparkles" size="1rem" />
              <span>Design Agent 正在审查页面，通常需要几十秒。</span>
            </div>
          } @else if (result(); as res) {
            <div class="design-agent-page__summary">
              @if (!res.success && errorMessage()) {
                <div class="design-agent-page__notice design-agent-page__notice--error" role="alert">
                  {{ errorMessage() }}
                </div>
              }
              <div class="design-agent-page__summary-card">
                <span class="design-agent-page__summary-label">状态</span>
                <strong>{{ res.auditResult?.summary?.status || 'unknown' }}</strong>
              </div>
              <div class="design-agent-page__summary-card">
                <span class="design-agent-page__summary-label">模式</span>
                <strong>{{ modeLabel(res.actualMode) }}</strong>
              </div>
              <div class="design-agent-page__summary-card">
                <span class="design-agent-page__summary-label">耗时</span>
                <strong>{{ formatDuration(res.durationMs) }}</strong>
              </div>
              <div class="design-agent-page__summary-card">
                <span class="design-agent-page__summary-label">费用</span>
                <strong>{{ formatCost(res.costUsd) }}</strong>
              </div>
            </div>

            @if (res.auditResult?.summary?.overallAssessment) {
              <div class="design-agent-page__assessment">
                {{ res.auditResult?.summary?.overallAssessment }}
              </div>
            }

            <div class="design-agent-page__actions design-agent-page__actions--results">
              <app-button
                variant="ghost"
                [disabled]="loading()"
                (click)="rerunAudit()"
              >
                重新审查
              </app-button>
              <app-button
                variant="ghost"
                [disabled]="loading()"
                (click)="deepAudit()"
              >
                深度审查
              </app-button>
              <app-button
                variant="ghost"
                [disabled]="loading()"
                (click)="generateModificationPlan()"
              >
                生成修改方案
              </app-button>
              <app-button
                variant="ghost"
                [disabled]="loading()"
                (click)="handoffToDevAgent()"
              >
                交给 devAgent 修改
              </app-button>
            </div>
            @if (actionHint()) {
              <p class="design-agent-page__field-help">{{ actionHint() }}</p>
            }

            @if (res.auditResult?.findings?.length) {
              <div class="design-agent-page__findings">
                @for (finding of res.auditResult?.findings; track finding.id) {
                  <article class="design-agent-page__finding">
                    <div class="design-agent-page__finding-head">
                      <strong>{{ finding.rule }}</strong>
                      <div class="design-agent-page__finding-meta">
                        <app-badge [tone]="severityTone(finding.severity)" appearance="outline">
                          {{ finding.severity }}
                        </app-badge>
                        @if (finding.source) {
                          <app-badge tone="neutral" appearance="outline">
                            {{ finding.source }}
                          </app-badge>
                        }
                      </div>
                    </div>
                    <p>{{ finding.problem }}</p>
                    <p class="design-agent-page__finding-impact">影响：{{ finding.impact }}</p>
                    <div class="design-agent-page__finding-location">{{ finding.location }}</div>
                  </article>
                }
              </div>
            } @else {
              <div class="design-agent-page__placeholder">
                <app-icon name="check" size="1rem" />
                <span>这次没有返回具体 finding。</span>
              </div>
            }

            @if (res.auditResult?.minimalFixPlan?.length) {
              <div class="design-agent-page__assessment" id="design-agent-fix-plan">
                建议操作（minimalFixPlan）：
              </div>
              <div class="design-agent-page__findings">
                @for (fix of res.auditResult?.minimalFixPlan; track fix.target) {
                  <article class="design-agent-page__finding">
                    <div class="design-agent-page__finding-head">
                      <strong>{{ fix.type }}</strong>
                      <div class="design-agent-page__finding-meta">
                        <app-badge tone="neutral" appearance="outline">fix</app-badge>
                      </div>
                    </div>
                    <p>{{ fix.action }}</p>
                    <div class="design-agent-page__finding-location">{{ fix.target }}</div>
                  </article>
                }
              </div>
            }

            <details class="design-agent-page__raw">
              <summary>查看完整 JSON</summary>
              <pre>{{ rawJson() }}</pre>
            </details>
          } @else {
            <div class="design-agent-page__placeholder">
              <app-icon name="tool" size="1rem" />
              <span>还没有运行审查。输入一句话后就可以开始。</span>
            </div>
          }
        </app-panel>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 0;
    }

    .design-agent-page {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-4);
      height: 100%;
    }

    .design-agent-page::-webkit-scrollbar {
      width: 4px;
    }

    .design-agent-page::-webkit-scrollbar-track {
      background: transparent;
    }

    .design-agent-page::-webkit-scrollbar-thumb {
      background: var(--color-border-light);
      border-radius: var(--radius-pill);
    }

    .design-agent-page__grid {
      display: grid;
      grid-template-columns: minmax(320px, 440px) minmax(0, 1fr);
      gap: var(--space-4);
      min-height: 0;
    }

    .design-agent-page__section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .design-agent-page__section-head h2 {
      margin: 0;
      font-size: var(--font-size-lg);
    }

    .design-agent-page__section-head p {
      margin: var(--space-1) 0 0;
      color: var(--color-text-secondary);
      line-height: var(--line-height-base);
    }

    .design-agent-page__templates {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .design-agent-page__form {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .design-agent-page__field--wide {
      grid-column: 1 / -1;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .field > span {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
    }

    .design-agent-page__field-help {
      margin: var(--space-1) 0 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      line-height: 1.5;
    }

    .design-agent-page__actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }

    .design-agent-page__notice {
      margin-top: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-lg);
      font-size: var(--font-size-sm);
      line-height: var(--line-height-base);
    }

    .design-agent-page__notice--error {
      background: var(--color-error-bg);
      color: var(--color-error);
      border: 1px solid var(--color-error-border);
    }

    .design-agent-page__placeholder,
    .design-agent-page__assessment {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface) 84%, transparent);
      border: 1px solid var(--color-border-light);
      color: var(--color-text-secondary);
    }

    .design-agent-page__assessment {
      align-items: flex-start;
      color: var(--color-text);
      line-height: var(--line-height-base);
      margin-top: var(--space-3);
    }

    .design-agent-page__summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .design-agent-page__summary-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface) 88%, transparent);
      border: 1px solid var(--color-border-light);
    }

    .design-agent-page__summary-label {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .design-agent-page__findings {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    .design-agent-page__finding {
      padding: var(--space-3);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface) 86%, transparent);
    }

    .design-agent-page__finding-head,
    .design-agent-page__finding-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .design-agent-page__finding p {
      margin: var(--space-2) 0 0;
      line-height: var(--line-height-base);
    }

    .design-agent-page__finding-impact {
      color: var(--color-text-secondary);
    }

    .design-agent-page__finding-location {
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
        'Courier New', monospace;
    }

    .design-agent-page__raw {
      margin-top: var(--space-4);
    }

    .design-agent-page__raw summary {
      cursor: pointer;
      color: var(--color-text-secondary);
    }

    .design-agent-page__raw pre {
      margin: var(--space-2) 0 0;
      padding: var(--space-3);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface) 92%, transparent);
      border: 1px solid var(--color-border-light);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: var(--font-size-xs);
      line-height: var(--line-height-base);
    }

    @media (max-width: 1180px) {
      .design-agent-page__grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 780px) {
      .design-agent-page {
        padding: var(--space-3);
      }

      .design-agent-page__form,
      .design-agent-page__summary {
        grid-template-columns: 1fr;
      }

      .design-agent-page__section-head,
      .design-agent-page__actions {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `],
})
export class DesignAgentPageComponent {
  private readonly designAgent = inject(DesignAgentService);

  protected readonly templates = AUDIT_TEMPLATES;
  protected readonly loading = signal(false);
  protected readonly result = signal<RunDesignAuditResultDto | null>(null);
  protected readonly rawJson = signal<string>('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly actionHint = signal<string | null>(null);

  protected readonly userSentence = signal('审查 memory 页面 /memory/understanding，看看这个页面 UI 有没有问题');

  protected readonly pageType = signal<DesignPageType>('memory');
  protected readonly preset = signal<DesignPreset>('quiet-personal');
  protected readonly mode = signal<DesignAuditMode>('full');
  protected readonly pageName = signal('memory-understanding');
  protected readonly pageUrl = signal('/memory/understanding');
  protected readonly targetFilesText = signal('');
  protected readonly notes = signal('重点看信息层级、设计系统一致性和不必要的视觉装饰。');

  protected setPageType(value: DesignPageType): void {
    this.pageType.set(value);
    this.preset.set(DEFAULT_PRESET_BY_TYPE[value]);
  }

  protected applyTemplate(template: AuditTemplate): void {
    this.pageType.set(template.pageType);
    this.preset.set(template.preset);
    this.mode.set(template.mode);
    this.pageName.set(template.pageName);
    this.pageUrl.set(template.pageUrl);
    this.notes.set(template.notes);
    this.errorMessage.set(null);
  }

  protected resetForm(): void {
    this.result.set(null);
    this.rawJson.set('');
    this.errorMessage.set(null);
    this.actionHint.set(null);
    this.userSentence.set('审查 memory 页面 /memory/understanding，看看这个页面 UI 有没有问题');
    this.applyTemplate(AUDIT_TEMPLATES[2]);
    this.targetFilesText.set('');
  }

  /**
   * MVP：一句话解析 -> 映射到固定的设计审查 task（当前仅 memory-understanding）
   */
  protected runFromSentence(): void {
    this.errorMessage.set(null);
    this.actionHint.set(null);
    this.result.set(null);
    this.rawJson.set('');
    this.targetFilesText.set('');

    const sentence = this.userSentence().trim();
    if (!sentence) {
      this.errorMessage.set('请输入审查目标。');
      return;
    }

    const normalized = sentence.toLowerCase();
    let route: string | null = null;
    if (normalized.includes('/memory/understanding')) {
      route = '/memory/understanding';
    } else if (normalized.includes('memory') && normalized.includes('understanding')) {
      route = '/memory/understanding';
    } else if (normalized.includes('memory') && (normalized.includes('理解') || normalized.includes('understand'))) {
      route = '/memory/understanding';
    }

    if (!route) {
      this.errorMessage.set('MVP：当前仅支持 memory + understanding（或 /memory/understanding）。');
      return;
    }

    this.pageType.set('memory');
    this.preset.set(DEFAULT_PRESET_BY_TYPE['memory']);
    this.mode.set('full');
    this.pageName.set('memory-understanding');
    this.pageUrl.set(route);
    // 保持 notes 使用默认值；如需从句子提取更多约束，后续再扩展解析器。

    this.runAudit();
  }

  protected runAudit(): void {
    this.errorMessage.set(null);
    this.actionHint.set(null);
    this.loading.set(true);

    const trimmedPageName = this.pageName().trim();
    const trimmedPageUrl = this.pageUrl().trim();
    const trimmedNotes = this.notes().trim();
    const targetFiles = this.targetFilesText()
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    this.designAgent
      .runAudit({
        pageName: trimmedPageName,
        pageType: this.pageType(),
        preset: this.preset(),
        mode: this.mode(),
        pageUrl: trimmedPageUrl || undefined,
        targetFiles: targetFiles.length ? targetFiles : undefined,
        notes: trimmedNotes || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.result.set(res);
          this.rawJson.set(JSON.stringify(res, null, 2));
          if (!res.success) {
            this.errorMessage.set(this.resolveDesignAgentError(res.error || '设计审查失败'));
          }
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.result.set(null);
          this.rawJson.set('');
          this.errorMessage.set(this.resolveHttpError(err));
        },
      });
  }

  protected rerunAudit(): void {
    this.runAudit();
  }

  protected deepAudit(): void {
    const original = this.notes();
    const deepNotes = `${original}\n\n深度审查要求：请更严格地验证设计系统一致性，补充更具体的证据，并给出更小粒度的“minimalFixPlan”。`;
    this.notes.set(deepNotes);
    this.runAudit();
    this.notes.set(original);
  }

  protected generateModificationPlan(): void {
    this.actionHint.set('修改方案已由 minimalFixPlan 生成；可在下方“建议操作”区域查看。');
    this.scrollToFixPlan();
  }

  protected handoffToDevAgent(): void {
    this.actionHint.set('MVP：当前仅生成审查与 minimalFixPlan，暂不自动触发代码修改。后续会接入 devAgent 修改链路。');
  }

  private scrollToFixPlan(): void {
    setTimeout(() => {
      document.getElementById('design-agent-fix-plan')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }

  protected severityTone(
    severity: string | null | undefined,
  ): 'info' | 'warning' | 'danger' | 'neutral' {
    if (severity === 'high') return 'danger';
    if (severity === 'medium') return 'warning';
    if (severity === 'low') return 'info';
    return 'neutral';
  }

  protected summaryTone(
    riskLevel: string | null | undefined,
  ): 'info' | 'warning' | 'danger' | 'neutral' {
    if (riskLevel === 'high') return 'danger';
    if (riskLevel === 'medium') return 'warning';
    if (riskLevel === 'low') return 'info';
    return 'neutral';
  }

  protected formatDuration(durationMs: number): string {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  protected formatCost(costUsd: number): string {
    return `$${costUsd.toFixed(4)}`;
  }

  protected modeLabel(mode: DesignAuditMode | string | null | undefined): string {
    if (mode === 'full') return '完整（代码 + 视觉）';
    if (mode === 'code') return '代码结构（更偏实现）';
    if (mode === 'visual') return '视觉一致性（更偏观感）';
    return String(mode ?? 'unknown');
  }

  private resolveDesignAgentError(message: string): string {
    // 后端知识库缺失通常会抛出“Failed to load design knowledge”，
    // 同时可能附带某个 dist 路径（例如 page-type-patterns.md）。
    if (
      message.includes('Failed to load design knowledge') ||
      message.includes('page-type-patterns.md')
    ) {
      return 'Design Agent 知识库规则文件缺失（后端可能未部署或构建产物未拷贝到 dist）。你仍可以继续查看界面；如需完整审查，请联系管理员或重启/重新部署后端。';
    }
    return message;
  }

  private resolveHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      const rawMessage = body?.message;
      const messageString =
        typeof rawMessage === 'string' ? rawMessage : Array.isArray(rawMessage) ? rawMessage.join('; ') : '';

      if (typeof body?.message === 'string' && body.message.trim()) {
        return this.resolveDesignAgentError(body.message);
      }
      if (Array.isArray(body?.message) && body.message.length) {
        return this.resolveDesignAgentError(body.message.join('; '));
      }
      return err.message || `HTTP ${err.status}`;
    }
    return String(err);
  }
}
