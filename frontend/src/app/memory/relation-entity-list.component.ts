import { DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  RelationService,
  SocialEntityRecord,
  SocialRelation,
  SocialRelationSortBy,
} from '../core/services/relation.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

type RelationFilter = 'all' | SocialRelation;

type RelationGroup = {
  relation: SocialRelation;
  label: string;
  items: SocialEntityRecord[];
};

const RELATION_ORDER: SocialRelation[] = [
  'family',
  'friend',
  'colleague',
  'romantic',
  'pet',
  'other',
];

const RELATION_META: Record<SocialRelation, {
  label: string;
  dot: string;
  hint: string;
}> = {
  family: { label: '家人', dot: '#f29b77', hint: '更贴近长期稳定的陪伴关系。' },
  friend: { label: '朋友', dot: '#68a8ff', hint: '日常陪伴与情绪支持通常会落在这里。' },
  colleague: { label: '同事', dot: '#6fc1a6', hint: '和工作、协作相关的人物。' },
  romantic: { label: '亲密关系', dot: '#d977b5', hint: '恋爱或暧昧关系相关人物。' },
  pet: { label: '宠物', dot: '#c8a354', hint: '宠物和日常照料对象。' },
  other: { label: '其他', dot: '#8a96b6', hint: '暂时还没分到更明确类型的人物。' },
};

@Component({
  selector: 'app-relation-entity-list',
  standalone: true,
  imports: [DatePipe, NgClass, AppBadgeComponent, AppPanelComponent, AppStateComponent, AppTabsComponent],
  template: `
    <app-panel variant="workbench" class="entity-panel">
      <div class="panel-header">
        <div>
          <div class="panel-header__title">社会关系人物</div>
          <p class="panel-header__description">从生活记录里提炼出你经常提到的人，方便小晴理解你的社会世界。</p>
        </div>

        <label class="panel-toolbar__sort">
          <span>排序</span>
          <select class="ui-select" [value]="sortBy()" (change)="setSortBy($any($event.target).value)">
            <option value="mentionCount">按提及频次</option>
            <option value="lastSeenAt">按最近提及</option>
            <option value="name">按名称</option>
          </select>
        </label>
      </div>

      <app-tabs
        [items]="relationTabs()"
        [value]="relationFilter()"
        size="sm"
        (valueChange)="setRelationFilter($event)"
      />

      @if (loading()) {
        <app-state
          kind="loading"
          title="人物关系加载中..."
          description="正在整理最近对话里提到的人物。"
        />
      } @else if (errorMessage()) {
        <app-state
          kind="error"
          title="人物关系暂时不可用"
          [description]="errorMessage()"
        />
      } @else if (entities().length === 0) {
        <app-state
          title="还没有观察到明确的人物线索"
          description="小晴还没有观察到你提到身边的人，多和我聊聊吧。"
        />
      } @else if (groupedEntities().length === 0) {
        <app-state
          title="这个分类下还没有人物"
          description="切换到其他关系类型看看，或者继续聊天积累更多线索。"
        />
      } @else {
        <div class="entity-groups">
          @for (group of groupedEntities(); track group.relation) {
            <section class="entity-group">
              @if (relationFilter() === 'all') {
                <div class="entity-group__header">
                  <div class="entity-group__title">
                    <span class="entity-dot" [style.background]="relationMeta(group.relation).dot"></span>
                    <span>{{ group.label }}</span>
                  </div>
                  <div class="entity-group__meta">{{ relationMeta(group.relation).hint }}</div>
                </div>
              }

              <div class="entity-grid">
                @for (entity of group.items; track entity.id) {
                  <article
                    class="entity-card"
                    [ngClass]="cardClasses(entity)"
                    [style.--mention-weight]="mentionWeight(entity)"
                    [style.--relation-accent]="relationMeta(entity.relation).dot"
                  >
                    <div class="entity-card__header">
                      <div class="entity-card__title">
                        <h3>{{ entity.name }}</h3>
                        <div class="entity-card__badges">
                          <app-badge tone="neutral" appearance="outline" size="sm">
                            {{ relationMeta(entity.relation).label }}
                          </app-badge>
                          <app-badge [tone]="isRecentlySeen(entity) ? 'info' : 'neutral'" appearance="outline" size="sm">
                            {{ lastSeenLabel(entity.lastSeenAt) }}
                          </app-badge>
                        </div>
                      </div>

                      <div class="entity-card__weight">
                        <div class="entity-card__count">{{ entity.mentionCount }}</div>
                        <div class="entity-card__count-label">提及次数</div>
                      </div>
                    </div>

                    <div class="entity-card__body">
                      <p class="entity-card__description">
                        {{ entity.description || '暂时还没有关系描述，可以手动补一条，帮助小晴更稳地记住这个人。' }}
                      </p>

                      @if (entity.aliases.length > 0) {
                        <div class="entity-card__aliases">
                          @for (alias of entity.aliases.slice(0, 4); track alias) {
                            <span class="entity-chip">{{ alias }}</span>
                          }
                        </div>
                      }
                    </div>

                    @if (editingId() === entity.id) {
                      <div class="entity-card__editor">
                        <label class="entity-form__field">
                          <span>关系类型</span>
                          <select class="ui-select" [value]="editRelation()" (change)="editRelation.set($any($event.target).value)">
                            @for (option of relationOptions; track option) {
                              <option [value]="option">{{ relationMeta(option).label }}</option>
                            }
                          </select>
                        </label>

                        <label class="entity-form__field">
                          <span>关系描述</span>
                          <textarea
                            class="ui-textarea"
                            rows="3"
                            [value]="editDescription()"
                            (input)="editDescription.set($any($event.target).value)"
                            placeholder="例如：大学室友，最近在准备跳槽。"
                          ></textarea>
                        </label>

                        <div class="entity-card__actions">
                          <button
                            type="button"
                            class="entity-action entity-action--primary"
                            [disabled]="savePendingId() === entity.id"
                            (click)="saveEdit(entity.id)"
                          >
                            {{ savePendingId() === entity.id ? '保存中...' : '保存修改' }}
                          </button>
                          <button type="button" class="entity-action" (click)="cancelEdit()">取消</button>
                        </div>
                      </div>
                    } @else {
                      <div class="entity-card__footer">
                        <div class="entity-card__meta">
                          首次出现 {{ entity.firstSeenAt | date:'yyyy-MM-dd' }}
                        </div>

                        <div class="entity-card__actions">
                          <button type="button" class="entity-action" (click)="startEdit(entity)">编辑</button>
                        </div>
                      </div>

                      @if (mergeTargets(entity).length > 0) {
                        <div class="entity-card__merge">
                          <select
                            class="ui-select"
                            [value]="mergeTarget(entity.id)"
                            (change)="setMergeTarget(entity.id, $any($event.target).value)"
                          >
                            <option value="">选择要合并到的人物</option>
                            @for (target of mergeTargets(entity); track target.id) {
                              <option [value]="target.id">{{ target.name }} · {{ relationMeta(target.relation).label }}</option>
                            }
                          </select>
                          <button
                            type="button"
                            class="entity-action"
                            [disabled]="mergePendingId() === entity.id || !mergeTarget(entity.id)"
                            (click)="mergeEntity(entity)"
                          >
                            {{ mergePendingId() === entity.id ? '合并中...' : '合并重复实体' }}
                          </button>
                        </div>
                      }
                    }
                  </article>
                }
              </div>
            </section>
          }
        </div>
      }
    </app-panel>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 0;
    }

    .entity-panel {
      gap: var(--space-4);
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: var(--space-4);
    }

    .panel-header__title {
      font-size: 1.05rem;
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .panel-header__description {
      margin: var(--space-2) 0 0;
      max-width: 60ch;
      font-size: var(--font-size-sm);
      line-height: 1.6;
      color: var(--color-text-secondary);
    }

    .panel-toolbar__sort {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      min-width: 170px;
    }

    .entity-groups {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .entity-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .entity-group__header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-3);
    }

    .entity-group__title {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .entity-group__meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .entity-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .entity-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--space-3);
    }

    .entity-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: calc(var(--workbench-card-radius) - 4px);
      border: 1px solid color-mix(in srgb, var(--relation-accent) 26%, white);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--relation-accent) calc(4% + (var(--mention-weight) * 10%)), white) 0%, rgba(255, 255, 255, 0.9) 100%);
      box-shadow: 0 14px 40px rgba(25, 37, 64, 0.06);
      min-height: 0;
    }

    .entity-card__header,
    .entity-card__footer,
    .entity-card__merge {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
      align-items: start;
    }

    .entity-card__title {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .entity-card__title h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
      word-break: break-word;
    }

    .entity-card__badges,
    .entity-card__aliases,
    .entity-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .entity-card__weight {
      min-width: 64px;
      text-align: right;
      flex-shrink: 0;
    }

    .entity-card__count {
      font-size: 1.4rem;
      font-weight: var(--font-weight-semibold);
      line-height: 1;
      color: var(--color-text);
    }

    .entity-card__count-label,
    .entity-card__meta {
      font-size: var(--font-size-xs);
      line-height: 1.5;
      color: var(--color-text-secondary);
    }

    .entity-card__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-height: 0;
    }

    .entity-card__description {
      margin: 0;
      font-size: var(--font-size-sm);
      line-height: 1.7;
      color: var(--color-text-secondary);
    }

    .entity-chip {
      padding: 0.3rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      color: var(--color-text-secondary);
      background: rgba(96, 122, 170, 0.08);
      border: 1px solid rgba(96, 122, 170, 0.12);
    }

    .entity-card__editor {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-top: var(--space-2);
      border-top: 1px solid rgba(96, 122, 170, 0.12);
    }

    .entity-form__field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    .entity-card__merge {
      align-items: center;
      padding-top: var(--space-2);
      border-top: 1px dashed rgba(96, 122, 170, 0.18);
    }

    .entity-card__merge .ui-select {
      min-width: 0;
      flex: 1;
    }

    .entity-action {
      border: 1px solid rgba(96, 122, 170, 0.16);
      background: rgba(255, 255, 255, 0.72);
      color: var(--color-text);
      border-radius: var(--radius-xl);
      padding: 0.55rem 0.85rem;
      font-size: 0.8rem;
      cursor: pointer;
      transition:
        border-color var(--transition-base),
        transform var(--transition-base),
        background var(--transition-base);
    }

    .entity-action:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--relation-accent) 35%, white);
      background: rgba(255, 255, 255, 0.92);
    }

    .entity-action:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .entity-action--primary {
      background: color-mix(in srgb, var(--relation-accent) 12%, white);
    }

    @media (max-width: 980px) {
      .panel-header,
      .entity-group__header,
      .entity-card__header,
      .entity-card__footer,
      .entity-card__merge {
        flex-direction: column;
      }

      .panel-toolbar__sort,
      .entity-card__weight {
        min-width: 0;
        width: 100%;
        text-align: left;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelationEntityListComponent implements OnInit {
  private readonly relationService = inject(RelationService);

  protected readonly relationOptions = RELATION_ORDER;
  protected readonly entities = signal<SocialEntityRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly relationFilter = signal<RelationFilter>('all');
  protected readonly sortBy = signal<SocialRelationSortBy>('mentionCount');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editRelation = signal<SocialRelation>('other');
  protected readonly editDescription = signal('');
  protected readonly savePendingId = signal<string | null>(null);
  protected readonly mergePendingId = signal<string | null>(null);
  protected readonly mergeTargetsBySource = signal<Record<string, string>>({});
  protected readonly relationTabs = computed<AppTabItem[]>(() => {
    const counts = new Map<RelationFilter, number>([['all', this.entities().length]]);

    for (const relation of RELATION_ORDER) {
      counts.set(
        relation,
        this.entities().filter((entity) => entity.relation === relation).length,
      );
    }

    return [
      { value: 'all', label: '全部', count: counts.get('all') ?? 0 },
      ...RELATION_ORDER.map((relation) => ({
        value: relation,
        label: this.relationMeta(relation).label,
        count: counts.get(relation) ?? 0,
      })),
    ];
  });
  protected readonly groupedEntities = computed<RelationGroup[]>(() => {
    const filtered = this.filteredEntities();
    if (filtered.length === 0) {
      return [];
    }

    if (this.relationFilter() !== 'all') {
      const relation = this.relationFilter() as SocialRelation;
      return [{ relation, label: this.relationMeta(relation).label, items: filtered }];
    }

    return RELATION_ORDER
      .map((relation) => ({
        relation,
        label: this.relationMeta(relation).label,
        items: filtered.filter((entity) => entity.relation === relation),
      }))
      .filter((group) => group.items.length > 0);
  });

  async ngOnInit() {
    await this.loadEntities();
  }

  protected relationMeta(relation: SocialRelation) {
    return RELATION_META[relation];
  }

  protected setRelationFilter(value: string) {
    this.relationFilter.set(value as RelationFilter);
  }

  protected async setSortBy(value: string) {
    this.sortBy.set(value as SocialRelationSortBy);
    await this.loadEntities();
  }

  protected startEdit(entity: SocialEntityRecord) {
    this.editingId.set(entity.id);
    this.editRelation.set(entity.relation);
    this.editDescription.set(entity.description ?? '');
  }

  protected cancelEdit() {
    this.editingId.set(null);
    this.editDescription.set('');
  }

  protected async saveEdit(entityId: string) {
    this.savePendingId.set(entityId);
    this.errorMessage.set('');

    try {
      await firstValueFrom(this.relationService.updateEntity(entityId, {
        relation: this.editRelation(),
        description: this.editDescription().trim() || null,
      }));
      this.cancelEdit();
      await this.loadEntities();
    } catch {
      this.errorMessage.set('保存失败，请稍后重试。');
    } finally {
      this.savePendingId.set(null);
    }
  }

  protected setMergeTarget(sourceId: string, targetId: string) {
    this.mergeTargetsBySource.set({
      ...this.mergeTargetsBySource(),
      [sourceId]: targetId,
    });
  }

  protected mergeTarget(sourceId: string) {
    return this.mergeTargetsBySource()[sourceId] ?? '';
  }

  protected mergeTargets(entity: SocialEntityRecord) {
    return this.entities().filter((candidate) => candidate.id !== entity.id);
  }

  protected async mergeEntity(entity: SocialEntityRecord) {
    const targetId = this.mergeTarget(entity.id);
    if (!targetId) {
      return;
    }

    const target = this.entities().find((candidate) => candidate.id === targetId);
    if (!target) {
      return;
    }

    if (!window.confirm(`确认将“${entity.name}”合并到“${target.name}”吗？`)) {
      return;
    }

    this.mergePendingId.set(entity.id);
    this.errorMessage.set('');

    try {
      await firstValueFrom(this.relationService.mergeEntities(entity.id, targetId));
      const nextMap = { ...this.mergeTargetsBySource() };
      delete nextMap[entity.id];
      this.mergeTargetsBySource.set(nextMap);
      await this.loadEntities();
    } catch {
      this.errorMessage.set('合并失败，请稍后重试。');
    } finally {
      this.mergePendingId.set(null);
    }
  }

  protected cardClasses(entity: SocialEntityRecord) {
    return [`entity-card--${entity.relation}`];
  }

  protected mentionWeight(entity: SocialEntityRecord) {
    return String(Math.min(1, 0.22 + entity.mentionCount / 14));
  }

  protected isRecentlySeen(entity: SocialEntityRecord) {
    return this.daysSince(entity.lastSeenAt) <= 7;
  }

  protected lastSeenLabel(value: string) {
    const days = this.daysSince(value);
    if (days <= 1) return '最近提及';
    if (days <= 7) return '本周提到';
    if (days <= 30) return `${days} 天前提到`;
    return '较早提及';
  }

  private filteredEntities() {
    const relation = this.relationFilter();
    if (relation === 'all') {
      return this.entities();
    }
    return this.entities().filter((entity) => entity.relation === relation);
  }

  private async loadEntities() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const result = await firstValueFrom(this.relationService.listEntities({
        sortBy: this.sortBy(),
        limit: 120,
      }));
      this.entities.set(result ?? []);
    } catch {
      this.errorMessage.set('请确认社会关系相关接口已经可用。');
    } finally {
      this.loading.set(false);
    }
  }

  private daysSince(value: string) {
    const timestamp = new Date(value).getTime();
    const diff = Date.now() - timestamp;
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
  }
}
