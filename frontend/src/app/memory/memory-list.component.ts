import { Component, OnInit, signal, inject, HostListener } from '@angular/core';
import { MemoryService, Memory } from '../core/services/memory.service';
import { GrowthService, PendingGrowthItem } from '../core/services/growth.service';
import { AppBadgeComponent } from '../shared/ui/app-badge.component';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppPanelComponent } from '../shared/ui/app-panel.component';
import { AppSectionHeaderComponent } from '../shared/ui/app-section-header.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import { AppTabsComponent, type AppTabItem } from '../shared/ui/app-tabs.component';

@Component({
  selector: 'app-memory-list',
  standalone: true,
  imports: [
    AppBadgeComponent,
    AppButtonComponent,
    AppPanelComponent,
    AppSectionHeaderComponent,
    AppStateComponent,
    AppTabsComponent,
  ],
  templateUrl: './memory-list.component.html',
  styleUrl: './memory-list.component.scss',
})
export class MemoryListComponent implements OnInit {
  private memory = inject(MemoryService);
  private growth = inject(GrowthService);

  memories = signal<Memory[]>([]);
  selected = signal<Memory | null>(null);
  editContent = signal('');
  saving = signal(false);
  deletingMemoryId = signal<string | null>(null);
  typeFilter = signal<'all' | 'mid' | 'long' | 'pending'>('all');
  categoryFilter = signal<'all' | 'judgment_pattern' | 'value_priority' | 'rhythm_pattern'>('all');
  contextMenuMemoryId = signal<string | null>(null);
  contextMenuPos = signal({ x: 0, y: 0 });

  // Pending growth state
  pendingItems = signal<PendingGrowthItem[]>([]);
  processingId = signal<string | null>(null);
  protected readonly typeTabs: AppTabItem[] = [
    { value: 'all', label: '全部' },
    { value: 'mid', label: '阶段' },
    { value: 'long', label: '长期' },
    { value: 'pending', label: '待确认' },
  ];
  protected readonly categoryTabs: AppTabItem[] = [
    { value: 'all', label: '全部认知' },
    { value: 'judgment_pattern', label: '判断模式' },
    { value: 'value_priority', label: '价值排序' },
    { value: 'rhythm_pattern', label: '关系节奏' },
  ];

  async ngOnInit() {
    await this.load();
  }

  setTypeFilterAndLoad(f: 'all' | 'mid' | 'long' | 'pending') {
    this.typeFilter.set(f);
    this.selected.set(null);
    if (f === 'mid' && this.categoryFilter() !== 'all') {
      this.categoryFilter.set('all');
    }
    if (f === 'pending') {
      this.loadPending();
    } else {
      this.load();
    }
  }

  setCategoryFilterAndLoad(
    f: 'all' | 'judgment_pattern' | 'value_priority' | 'rhythm_pattern',
  ) {
    this.categoryFilter.set(f);
    this.load();
  }

  setTypeFromTab(value: string) {
    if (value === 'all' || value === 'mid' || value === 'long' || value === 'pending') {
      this.setTypeFilterAndLoad(value);
    }
  }

  setCategoryFromTab(value: string) {
    if (
      value === 'all'
      || value === 'judgment_pattern'
      || value === 'value_priority'
      || value === 'rhythm_pattern'
    ) {
      this.setCategoryFilterAndLoad(value);
    }
  }

  async load() {
    const type = this.typeFilter();
    if (type === 'pending') return;
    const category = this.categoryFilter();
    try {
      const typeArg = type === 'all' ? undefined : type;
      const categoryArg = category === 'all' ? undefined : category;
      const list: Memory[] = (await this.memory.list(typeArg, categoryArg).toPromise()) ?? [];
      this.memories.set(list);
    } catch {
      this.memories.set([]);
    }
  }

  async loadPending() {
    try {
      const items = (await this.growth.getPending().toPromise()) ?? [];
      this.pendingItems.set(items);
    } catch {
      this.pendingItems.set([]);
    }
  }

  async confirmGrowth(item: PendingGrowthItem) {
    this.processingId.set(item.id);
    try {
      await this.growth.confirm(item.id, item.type).toPromise();
      await this.loadPending();
    } finally {
      this.processingId.set(null);
    }
  }

  async rejectGrowth(item: PendingGrowthItem) {
    this.processingId.set(item.id);
    try {
      await this.growth.reject(item.id, item.type).toPromise();
      await this.loadPending();
    } finally {
      this.processingId.set(null);
    }
  }

  getGrowthTypeLabel(type: string) {
    return type === 'cognitive_profile' ? '认知画像' : '关系状态';
  }

  getGrowthKindLabel(kind?: string) {
    if (kind === 'decision_pattern') return '决策模式';
    if (kind === 'thinking_pattern') return '思维模式';
    if (kind === 'support_preference') return '支持偏好';
    return kind ?? '';
  }

  select(m: Memory) {
    this.selected.set(m);
    this.editContent.set(m.content);
  }

  closeDetail() {
    this.selected.set(null);
    this.contextMenuMemoryId.set(null);
  }

  @HostListener('document:click') closeContextMenuOnClick() {
    this.contextMenuMemoryId.set(null);
  }

  onMemoryContextMenu(event: MouseEvent, memoryId: string) {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuPos.set({ x: event.clientX, y: event.clientY });
    this.contextMenuMemoryId.set(memoryId);
  }

  async onDeleteMemoryFromMenu() {
    const id = this.contextMenuMemoryId();
    if (!id) return;
    this.contextMenuMemoryId.set(null);
    if (!confirm('确定删除该条记忆？不可恢复。')) return;
    this.deletingMemoryId.set(id);
    try {
      await this.memory.delete(id).toPromise();
      if (this.selected()?.id === id) {
        this.selected.set(null);
      }
      await this.load();
    } finally {
      this.deletingMemoryId.set(null);
    }
  }

  async save() {
    const m = this.selected();
    if (!m) return;
    this.saving.set(true);
    try {
      await this.memory.update(m.id, { content: this.editContent() }).toPromise();
      this.selected.set(null);
      await this.load();
    } finally {
      this.saving.set(false);
    }
  }

  getCategoryLabel(category?: string) {
    if (category === 'judgment_pattern') return '判断模式';
    if (category === 'value_priority') return '价值排序';
    if (category === 'rhythm_pattern') return '关系节奏';
    if (category === 'shared_fact') return '共识事实';
    if (category === 'commitment') return '约定';
    if (category === 'correction') return '纠错';
    if (category === 'soft_preference') return '软偏好';
    if (category === 'identity_anchor') return '身份锚定';
    return '一般';
  }

  getTypeLabel(type: 'mid' | 'long') {
    return type === 'mid' ? '阶段' : '长期';
  }

  getConfidencePercent(value?: number) {
    const normalized = Math.max(0, Math.min(1, value ?? 0));
    return `${Math.round(normalized * 100)}%`;
  }
}
