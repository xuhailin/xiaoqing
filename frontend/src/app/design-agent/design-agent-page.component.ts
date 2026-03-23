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
              <h2>发起审查</h2>
              <p>先选一个模板，或手动填写页面信息。</p>
            </div>
            <app-badge tone="info" appearance="outline">POST /design-agent/audits</app-badge>
          </div>

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
                <option value="full">full</option>
                <option value="code">code</option>
                <option value="visual">visual</option>
              </select>
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
              <p>这里展示当前运行的摘要、发现项和原始 JSON。</p>
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
              <div class="design-agent-page__summary-card">
                <span class="design-agent-page__summary-label">状态</span>
                <strong>{{ res.auditResult?.summary?.status || 'unknown' }}</strong>
              </div>
              <div class="design-agent-page__summary-card">
                <span class="design-agent-page__summary-label">模式</span>
                <strong>{{ res.actualMode }}</strong>
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

            <details class="design-agent-page__raw">
              <summary>查看完整 JSON</summary>
              <pre>{{ rawJson() }}</pre>
            </details>
          } @else {
            <div class="design-agent-page__placeholder">
              <app-icon name="tool" size="1rem" />
              <span>还没有运行审查。选一个模板后就可以开始。</span>
            </div>
          }
        </app-panel>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100%;
    }

    .design-agent-page {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-height: 100%;
      padding: var(--space-4);
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
      background: color-mix(in srgb, var(--color-danger) 10%, transparent);
      color: var(--color-danger);
      border: 1px solid color-mix(in srgb, var(--color-danger) 18%, transparent);
    }

    .design-agent-page__placeholder,
    .design-agent-page__assessment {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface-elevated) 86%, transparent);
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
      background: color-mix(in srgb, var(--color-surface-elevated) 92%, transparent);
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
      border: 1px solid var(--color-border-soft);
      border-radius: var(--radius-xl);
      background: color-mix(in srgb, var(--color-surface-elevated) 88%, transparent);
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
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
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
      background: var(--color-surface-elevated);
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
    this.applyTemplate(AUDIT_TEMPLATES[2]);
    this.targetFilesText.set('');
  }

  protected runAudit(): void {
    this.errorMessage.set(null);
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
            this.errorMessage.set(res.error || '设计审查失败');
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

  private resolveHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body?.message === 'string' && body.message.trim()) {
        return body.message;
      }
      if (Array.isArray(body?.message) && body.message.length) {
        return body.message.join('; ');
      }
      return err.message || `HTTP ${err.status}`;
    }
    return String(err);
  }
}
