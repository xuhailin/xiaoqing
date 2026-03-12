import { Component, OnInit, signal, inject } from '@angular/core';
import { PersonaService, PersonaDto } from '../core/services/persona.service';
import { UserProfileService, UserProfileDto } from '../core/services/user-profile.service';

@Component({
  selector: 'app-persona-summary',
  standalone: true,
  template: `
    <div class="persona-top">
      <div class="header-row">
        <span class="app-name">LongMemory</span>
        @if (persona(); as p) {
          <sup class="version-sup">v{{ p.version }}</sup>
        } @else {
          <sup class="version-sup version-sup--muted">—</sup>
        }
      </div>
      @if (persona(); as p) {
        <div class="identity-row">
          <span class="row-label">身份</span>
          <span class="row-value identity-value">{{ identityFull(p) }}</span>
        </div>
        <div class="impression-row">
          <span class="row-label">印象</span>
          <span class="row-value impression-value">{{ mergedImpression() }}</span>
        </div>
        <div class="impression-row">
          <span class="row-label">偏好</span>
          <span class="row-value impression-value">{{ preferenceSummary() }}</span>
        </div>
      } @else {
        <div class="identity-row">
          <span class="row-label">身份</span>
          <span class="row-value row-value--muted">加载中...</span>
        </div>
        <div class="impression-row">
          <span class="row-label">印象</span>
          <span class="row-value row-value--muted">加载中...</span>
        </div>
        <div class="impression-row">
          <span class="row-label">偏好</span>
          <span class="row-value row-value--muted">加载中...</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .persona-top {
      padding: var(--space-4) var(--space-4) var(--space-3);
      border-bottom: 1px solid var(--color-border-light);
      flex-shrink: 0;
    }

    .header-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-1);
      margin-bottom: var(--space-2);
    }

    .app-name {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-primary);
      letter-spacing: -0.01em;
    }

    .version-sup {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-success);
      vertical-align: super;
      line-height: 0;
    }

    .version-sup--muted {
      font-style: italic;
    }

    .identity-row,
    .impression-row {
      margin-bottom: var(--space-2);
    }

    .identity-row:last-child,
    .impression-row:last-child {
      margin-bottom: 0;
    }

    .row-label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-muted);
      display: block;
      margin-bottom: var(--space-1);
    }

    .row-value {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      display: block;
    }

    .row-value.identity-value {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 5em;
      overflow-y: auto;
    }

    .row-value.identity-value::-webkit-scrollbar { width: 4px; }
    .row-value.identity-value::-webkit-scrollbar-track { background: transparent; }
    .row-value.identity-value::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: var(--radius-pill);
    }

    .row-value.impression-value {
      white-space: pre-wrap;
      text-overflow: clip;
      max-height: 4em;
      overflow-y: auto;
    }

    .row-value.impression-value::-webkit-scrollbar { width: 4px; }
    .row-value.impression-value::-webkit-scrollbar-track { background: transparent; }
    .row-value.impression-value::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: var(--radius-pill);
    }

    .row-value--muted {
      color: var(--color-text-muted);
      font-style: italic;
    }
  `],
})
export class PersonaSummaryComponent implements OnInit {
  private personaService = inject(PersonaService);
  private userProfileService = inject(UserProfileService);
  persona = signal<PersonaDto | null>(null);
  userProfile = signal<UserProfileDto | null>(null);

  async ngOnInit() {
    try {
      const [p, profile] = await Promise.all([
        this.personaService.get().toPromise(),
        this.userProfileService.get().toPromise(),
      ]);
      if (p) this.persona.set(p);
      if (profile) this.userProfile.set(profile);
    } catch {
      /* persona not yet created */
    }
  }

  async reload() {
    const [p, profile] = await Promise.all([
      this.personaService.get().toPromise(),
      this.userProfileService.get().toPromise(),
    ]);
    if (p) this.persona.set(p);
    if (profile) this.userProfile.set(profile);
  }

  identityFull(p: PersonaDto): string {
    const raw = p.identity?.trim() || '';
    return raw || '（空）';
  }

  mergedImpression(): string {
    const profile = this.userProfile();
    if (!profile) return '（空）';
    const parts = [profile.impressionCore, profile.impressionDetail].filter(Boolean) as string[];
    const merged = parts.join('\n\n').trim();
    return merged || '（空）';
  }

  preferenceSummary(): string {
    const profile = this.userProfile();
    if (!profile) return '（空）';

    const lines = (text: string) =>
      text
        .split('\n')
        .map((line) => line.trim().replace(/^[\-\s]+/, ''))
        .filter(Boolean);

    const voice = lines(profile.preferredVoiceStyle);
    const praise = lines(profile.praisePreference);
    const rhythm = lines(profile.responseRhythm);
    const parts: string[] = [];
    if (voice.length) parts.push(`语气：${voice.join('、')}`);
    if (praise.length) parts.push(`夸赞：${praise.join('、')}`);
    if (rhythm.length) parts.push(`节奏：${rhythm.join('、')}`);
    return parts.length ? parts.join('；') : '当前暂无稳定偏好。';
  }
}
