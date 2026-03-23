import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import {
  DesignAgentService,
  type RunDesignAuditResultDto,
} from '../core/services/design-agent.service';

export type MemoryDesignAuditTab =
  | 'understanding'
  | 'life-record'
  | 'cognitive-trace'
  | 'relations'
  | 'persona';

@Component({
  selector: 'app-memory-design-audit-bar',
  standalone: true,
  imports: [AppButtonComponent],
  template: `
    <div class="memory-design-audit-bar">
      <app-button
        type="button"
        variant="ghost"
        size="sm"
        [disabled]="loading()"
        (click)="runAudit()"
        title="调用后端 Design Agent，对当前记忆区页面做代码+截图审查（需本机后端与 Claude Code / Playwright 可用）"
      >
        {{ loading() ? '审查中…' : '设计审查' }}
      </app-button>
    </div>
    @if (errorMessage()) {
      <p class="memory-design-audit-bar__msg memory-design-audit-bar__msg--error" role="alert">
        {{ errorMessage() }}
      </p>
    }
    @if (successHint()) {
      <p class="memory-design-audit-bar__msg memory-design-audit-bar__msg--ok">
        {{ successHint() }}
      </p>
    }
    @if (rawJson()) {
      <details class="memory-design-audit-bar__raw">
        <summary>完整 JSON</summary>
        <pre>{{ rawJson() }}</pre>
      </details>
    }
  `,
  styleUrl: './memory-design-audit-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemoryDesignAuditBarComponent {
  @Input({ required: true }) memoryTab!: MemoryDesignAuditTab;

  private readonly router = inject(Router);
  private readonly designAgent = inject(DesignAgentService);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successHint = signal<string | null>(null);
  protected readonly rawJson = signal<string | null>(null);

  runAudit(): void {
    this.errorMessage.set(null);
    this.successHint.set(null);
    this.rawJson.set(null);
    this.loading.set(true);

    const pageUrl = (this.router.url.split('?')[0] || '/memory').trim() || '/memory';

    this.designAgent
      .runAudit({
        pageName: `memory-${this.memoryTab}`,
        pageType: 'memory',
        mode: 'full',
        pageUrl,
      })
      .subscribe({
        next: (res) => this.onResult(res),
        error: (err: unknown) => this.onHttpError(err),
      });
  }

  private onResult(res: RunDesignAuditResultDto): void {
    this.loading.set(false);
    this.rawJson.set(JSON.stringify(res, null, 2));

    if (!res.success) {
      this.errorMessage.set(res.error ?? '审查失败');
      return;
    }

    const s = res.auditResult?.summary;
    if (s) {
      const partial =
        res.error != null && res.error.length > 0
          ? `（部分成功：${res.error}）`
          : '';
      this.successHint.set(
        `状态 ${s.status} · 风险 ${s.riskLevel} · 耗时 ${(res.durationMs / 1000).toFixed(1)}s${partial}`,
      );
    } else {
      this.successHint.set(`完成（${res.actualMode}）`);
    }
  }

  private onHttpError(err: unknown): void {
    this.loading.set(false);
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      const msg =
        typeof body?.message === 'string'
          ? body.message
          : Array.isArray(body?.message)
            ? body.message.join('; ')
            : err.message;
      this.errorMessage.set(msg || `HTTP ${err.status}`);
      return;
    }
    this.errorMessage.set(String(err));
  }
}
