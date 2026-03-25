import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConversationService } from '../../core/services/conversation.service';
import {
  WorldStateService,
  WorldStateDto,
} from '../../core/services/world-state.service';
import { AppButtonComponent } from '../../shared/ui/app-button.component';
import { AppPageHeaderComponent } from '../../shared/ui/app-page-header.component';
import { AppPanelComponent } from '../../shared/ui/app-panel.component';
import { AppStateComponent } from '../../shared/ui/app-state.component';

@Component({
  selector: 'app-world-state-page',
  standalone: true,
  imports: [AppButtonComponent, AppPageHeaderComponent, AppPanelComponent, AppStateComponent],
  template: `
    <div class="page-container">
      <app-page-header
        class="page-container__header"
        title="世界状态"
        description="会话级默认前提，用于地点、时区、语言等补全，不写入长期记忆。"
      />

      <div class="page-content">
        @if (!currentConversationId()) {
          <app-state
            title="暂无当前会话"
            description="进入聊天后可编辑默认世界状态。"
          />
        } @else {
          <app-panel variant="workbench" class="state-panel">
            <div class="state-form">
              <div class="form-group">
                <label>地点</label>
                <input
                  type="text"
                  [value]="form().city"
                  (input)="setField('city', $any($event.target).value)"
                  placeholder="如：北京"
                />
              </div>

              <div class="form-group">
                <label>时区</label>
                <input
                  type="text"
                  [value]="form().timezone"
                  (input)="setField('timezone', $any($event.target).value)"
                  placeholder="如：Asia/Shanghai"
                />
              </div>

              <div class="form-group">
                <label>语言</label>
                <input
                  type="text"
                  [value]="form().language"
                  (input)="setField('language', $any($event.target).value)"
                  placeholder="如：zh-CN"
                />
              </div>

              <div class="form-group">
                <label>设备</label>
                <input
                  type="text"
                  [value]="form().device"
                  (input)="setField('device', $any($event.target).value)"
                  placeholder="如：desktop"
                />
              </div>

              <div class="form-group">
                <label>对话模式</label>
                <select
                  [value]="form().conversationMode"
                  (change)="setField('conversationMode', $any($event.target).value)"
                >
                  <option value="">未设置</option>
                  <option value="chat">chat</option>
                  <option value="thinking">thinking</option>
                  <option value="decision">decision</option>
                  <option value="task">task</option>
                </select>
              </div>

              <div class="form-actions">
                <app-button variant="primary" (click)="save()" [disabled]="saving()">
                  {{ saving() ? '保存中...' : '保存' }}
                </app-button>
                <app-button variant="ghost" (click)="load()" [disabled]="saving()">
                  重载
                </app-button>
              </div>
            </div>
          </app-panel>
        }
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

    .state-panel {
      max-width: 480px;
    }

    .state-form {
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

    input, select {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      color: var(--color-text);
      background: var(--color-surface);
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

    select {
      cursor: pointer;
    }

    .form-actions {
      display: flex;
      gap: var(--space-3);
      padding-top: var(--space-2);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorldStatePageComponent implements OnInit {
  private conversationService = inject(ConversationService);
  private worldStateService = inject(WorldStateService);

  readonly currentConversationId = signal<string | null>(null);
  readonly form = signal<Required<WorldStateDto>>({
    city: '',
    timezone: '',
    language: '',
    device: '',
    conversationMode: '',
  });
  readonly saving = signal(false);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const current = await firstValueFrom(this.conversationService.getOrCreateCurrent());
      const conversationId = current?.id ?? null;
      this.currentConversationId.set(conversationId);

      if (!conversationId) return;

      const state = await firstValueFrom(this.worldStateService.get(conversationId));
      this.form.set({
        city: state?.city ?? '',
        timezone: state?.timezone ?? '',
        language: state?.language ?? '',
        device: state?.device ?? '',
        conversationMode: state?.conversationMode ?? '',
      });
    } catch {
      this.currentConversationId.set(null);
    }
  }

  setField(key: keyof WorldStateDto, value: string) {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  async save() {
    const conversationId = this.currentConversationId();
    if (!conversationId) return;

    this.saving.set(true);
    const f = this.form();
    try {
      const updated = await firstValueFrom(
        this.worldStateService.update(conversationId, {
          city: f.city.trim() || undefined,
          timezone: f.timezone.trim() || undefined,
          language: f.language.trim() || undefined,
          device: f.device.trim() || undefined,
          conversationMode: f.conversationMode.trim() || undefined,
        })
      );

      this.form.set({
        city: updated?.city ?? '',
        timezone: updated?.timezone ?? '',
        language: updated?.language ?? '',
        device: updated?.device ?? '',
        conversationMode: updated?.conversationMode ?? '',
      });
    } catch {
      // Ignore
    } finally {
      this.saving.set(false);
    }
  }
}
