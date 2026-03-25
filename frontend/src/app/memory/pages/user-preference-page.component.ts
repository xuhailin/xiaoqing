import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UserProfileService, type UserProfileDto } from '../../core/services/user-profile.service';
import { AppButtonComponent } from '../../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';

@Component({
  selector: 'app-user-preference-page',
  standalone: true,
  imports: [AppButtonComponent, AppPageHeaderComponent, AppPanelComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="用户偏好"
        description="你偏好的回应方式，帮助我更好地与你沟通。"
      />

      <div class="page-content">
        <app-panel variant="workbench" class="preference-panel">
          <div class="preference-summary">
            <span class="summary-label">当前偏好概览</span>
            <p class="summary-text">{{ preferenceSummary() }}</p>
          </div>

          <div class="preference-form">
            <div class="form-group">
              <label>偏好语气</label>
              <textarea
                rows="3"
                [value]="form().preferredVoiceStyle"
                (input)="setField('preferredVoiceStyle', $any($event.target).value)"
                placeholder="如：少点 GPT 味，更口语"
              ></textarea>
            </div>

            <div class="form-group">
              <label>夸赞偏好</label>
              <textarea
                rows="3"
                [value]="form().praisePreference"
                (input)="setField('praisePreference', $any($event.target).value)"
                placeholder="如：轻一点，具体一点"
              ></textarea>
            </div>

            <div class="form-group">
              <label>回应节奏偏好</label>
              <textarea
                rows="3"
                [value]="form().responseRhythm"
                (input)="setField('responseRhythm', $any($event.target).value)"
                placeholder="如：记住后简单确认，不要展开"
              ></textarea>
            </div>

            <div class="form-actions">
              <app-button variant="primary" (click)="save()" [disabled]="saving()">
                {{ saving() ? '保存中...' : '保存' }}
              </app-button>
            </div>
          </div>

          @if (profile().pendingImpressionCore || profile().pendingImpressionDetail) {
            <div class="pending-section">
              <span class="section-label">待确认印象</span>

              @if (profile().pendingImpressionCore) {
                <div class="pending-card">
                  <span class="pending-tag">核心印象</span>
                  <p class="pending-content">{{ profile().pendingImpressionCore }}</p>
                  <div class="pending-actions">
                    <app-button variant="primary" size="sm" (click)="confirmImpression('core')" [disabled]="saving()">
                      确认
                    </app-button>
                    <app-button variant="ghost" size="sm" (click)="rejectImpression('core')" [disabled]="saving()">
                      拒绝
                    </app-button>
                  </div>
                </div>
              }

              @if (profile().pendingImpressionDetail) {
                <div class="pending-card">
                  <span class="pending-tag">细节印象</span>
                  <p class="pending-content">{{ profile().pendingImpressionDetail }}</p>
                  <div class="pending-actions">
                    <app-button variant="primary" size="sm" (click)="confirmImpression('detail')" [disabled]="saving()">
                      确认
                    </app-button>
                    <app-button variant="ghost" size="sm" (click)="rejectImpression('detail')" [disabled]="saving()">
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
    }

    .page-content {
      flex: 1;
      min-height: 0;
    }

    .preference-panel {
      gap: var(--space-5);
    }

    .preference-summary {
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-muted);
      border-radius: var(--radius-md);
    }

    .summary-label {
      display: block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: var(--space-2);
    }

    .summary-text {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .preference-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
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
      line-height: 1.5;
      transition: border-color var(--transition-fast);

      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-focus-ring);
      }

      &::placeholder {
        color: var(--color-text-muted);
      }
    }

    .form-actions {
      display: flex;
      gap: var(--space-3);
      padding-top: var(--space-2);
    }

    .pending-section {
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border-light);
    }

    .section-label {
      display: block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: var(--space-3);
    }

    .pending-card {
      padding: var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-3);
    }

    .pending-tag {
      display: inline-block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-primary);
      background: var(--color-primary-light);
      padding: 2px var(--space-2);
      border-radius: var(--radius-pill);
      margin-bottom: var(--space-2);
    }

    .pending-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-3);
      line-height: 1.5;
    }

    .pending-actions {
      display: flex;
      gap: var(--space-2);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPreferencePageComponent implements OnInit {
  private userProfileService = inject(UserProfileService);

  readonly profile = signal<UserProfileDto>({
    userKey: 'default-user',
    preferredPersonaKey: 'default',
    preferredVoiceStyle: '',
    praisePreference: '',
    responseRhythm: '',
    impressionCore: null,
    impressionDetail: null,
    pendingImpressionCore: null,
    pendingImpressionDetail: null,
  });

  readonly form = signal({
    preferredVoiceStyle: '',
    praisePreference: '',
    responseRhythm: '',
  });

  readonly saving = signal(false);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const p = await firstValueFrom(this.userProfileService.get());
      if (p) {
        this.profile.set(p);
        this.form.set({
          preferredVoiceStyle: p.preferredVoiceStyle,
          praisePreference: p.praisePreference,
          responseRhythm: p.responseRhythm,
        });
      }
    } catch {
      // Ignore
    }
  }

  setField(key: 'preferredVoiceStyle' | 'praisePreference' | 'responseRhythm', value: string) {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  async save() {
    this.saving.set(true);
    try {
      const f = this.form();
      const p = await firstValueFrom(
        this.userProfileService.update({
          preferredVoiceStyle: f.preferredVoiceStyle,
          praisePreference: f.praisePreference,
          responseRhythm: f.responseRhythm,
        })
      );
      if (p) {
        this.profile.set(p);
      }
    } catch {
      // Ignore
    } finally {
      this.saving.set(false);
    }
  }

  async confirmImpression(target: 'core' | 'detail') {
    this.saving.set(true);
    try {
      const p = await firstValueFrom(this.userProfileService.confirmImpression(target));
      if (p) this.profile.set(p);
    } catch {
      // Ignore
    } finally {
      this.saving.set(false);
    }
  }

  async rejectImpression(target: 'core' | 'detail') {
    this.saving.set(true);
    try {
      const p = await firstValueFrom(this.userProfileService.rejectImpression(target));
      if (p) this.profile.set(p);
    } catch {
      // Ignore
    } finally {
      this.saving.set(false);
    }
  }

  preferenceSummary(): string {
    const p = this.profile();
    const parts: string[] = [];

    if (p.preferredVoiceStyle?.trim()) {
      parts.push(`语气偏好：${p.preferredVoiceStyle.trim()}`);
    }
    if (p.praisePreference?.trim()) {
      parts.push(`夸赞方式：${p.praisePreference.trim()}`);
    }
    if (p.responseRhythm?.trim()) {
      parts.push(`回应节奏：${p.responseRhythm.trim()}`);
    }

    if (!parts.length) {
      return '还没有形成稳定偏好，系统会随对话继续沉淀。';
    }
    return parts.join('；') + '。';
  }
}
