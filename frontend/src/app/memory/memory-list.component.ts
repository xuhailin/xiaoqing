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
  typeFilter = signal<'all' | 'mid' | 'long' | 'pending'>('long');
  categoryFilter = signal<'all' | 'judgment_pattern' | 'value_priority' | 'rhythm_pattern'>('all');
  contextMenuMemoryId = signal<string | null>(null);
  contextMenuPos = signal({ x: 0, y: 0 });

  // Pending growth state
  pendingItems = signal<PendingGrowthItem[]>([]);
  processingId = signal<string | null>(null);
  protected readonly typeTabs: AppTabItem[] = [
    { value: 'all', label: '全部' },
    { value: 'mid', label: '最近留意到的' },
    { value: 'long', label: '一直记着的' },
    { value: 'pending', label: '待确认' },
  ];
  protected readonly categoryTabs: AppTabItem[] = [
    { value: 'all', label: '全部' },
    { value: 'judgment_pattern', label: '你的决策习惯' },
    { value: 'value_priority', label: '你重视的' },
    { value: 'rhythm_pattern', label: '我们的节奏' },
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
    return type === 'cognitive_profile' ? '关于你的新发现' : '关系变化';
  }

  getGrowthKindLabel(kind?: string) {
    const MAP: Record<string, string> = {
      decision_pattern: '决策方式',
      thinking_pattern: '思考习惯',
      support_preference: '支持偏好',
    };
    return MAP[kind ?? ''] ?? '';
  }

  getGrowthStageLabel(stage: string): string {
    const MAP: Record<string, string> = {
      early: '刚开始',
      familiar: '越来越熟',
      steady: '稳定了',
    };
    return MAP[stage] ?? stage;
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
    const MAP: Record<string, string> = {
      judgment_pattern: '决策习惯',
      value_priority: '你重视的',
      rhythm_pattern: '节奏',
      shared_fact: '共识',
      commitment: '约定',
      correction: '纠正',
      soft_preference: '小习惯',
      identity_anchor: '身份',
      general: '留意到的',
    };
    return MAP[category ?? ''] ?? '留意到的';
  }

  getTypeLabel(type: 'mid' | 'long') {
    return type === 'mid' ? '最近留意到的' : '一直记着的';
  }

  sourceDialogCount(ids?: string[]) {
    return (ids ?? []).length;
  }
}
