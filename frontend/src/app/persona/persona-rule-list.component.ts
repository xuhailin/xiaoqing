import { Component, OnInit, inject, signal } from '@angular/core';
import { PersonaRuleCardComponent } from './persona-rule-card.component';
import { PersonaRuleDto, PersonaService } from '../core/services/persona.service';

@Component({
  selector: 'app-persona-rule-list',
  standalone: true,
  imports: [PersonaRuleCardComponent],
  template: `
    <div class="rule-list">
      <p class="rule-list__intro">
        表达纪律以结构化规则注入对话；按 weight 降序排列。弃用规则不再进入 system prompt。
      </p>
      @if (loading()) {
        <p class="rule-list__loading">加载中…</p>
      } @else if (loadError()) {
        <p class="rule-list__error">加载规则失败，请稍后重试。</p>
      } @else if (rules().length === 0) {
        <p class="rule-list__empty">暂无规则（将回退到人格字段中的表达纪律文本）。</p>
      } @else {
        @for (r of rules(); track r.id) {
          <app-persona-rule-card [rule]="r" (changed)="reload()" />
        }
      }
    </div>
  `,
  styles: [`
    .rule-list__intro {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: var(--line-height-base);
      margin: 0 0 var(--space-3);
    }
    .rule-list__error {
      color: var(--color-error);
      font-size: var(--font-size-sm);
    }
    .rule-list__empty {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .rule-list__loading {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }
  `],
})
export class PersonaRuleListComponent implements OnInit {
  private personaApi = inject(PersonaService);

  rules = signal<PersonaRuleDto[]>([]);
  loading = signal(true);
  loadError = signal(false);

  ngOnInit() {
    this.reload();
  }

  async reload() {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const list = await this.personaApi.getRules().toPromise();
      this.rules.set(list ?? []);
    } catch {
      this.loadError.set(true);
      this.rules.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
