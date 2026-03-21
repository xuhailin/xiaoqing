import { Component, signal, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import {
  ModelConfigService,
  type ModelConfigView,
  type ModelScenario,
} from '../core/services/model-config.service';

interface MemoryStats {
  total: number;
  byType: { mid: number; long: number };
  byCategory: Record<string, number>;
  decayCandidates: number;
  frozen: number;
}

interface PersonaInfo {
  version: number;
  evolutionAllowed: string;
  evolutionForbidden: string;
}

interface PendingEvolution {
  changes: Array<{ field: string; content: string; reason: string }>;
  triggerReason: string;
  createdAt: string;
}

@Component({
  selector: 'app-debug-dashboard',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="debug-panel">
      <div class="section">
        <h3 class="section-title">记忆概览</h3>
        @if (memoryStats()) {
          <div class="stat-grid">
            <div class="stat-card">
              <span class="stat-value">{{ memoryStats()!.total }}</span>
              <span class="stat-label">总记忆数</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ memoryStats()!.byType.long }}</span>
              <span class="stat-label">长期记忆</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ memoryStats()!.byType.mid }}</span>
              <span class="stat-label">中期记忆</span>
            </div>
            <div class="stat-card warn">
              <span class="stat-value">{{ memoryStats()!.decayCandidates }}</span>
              <span class="stat-label">衰减候选</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ memoryStats()!.frozen }}</span>
              <span class="stat-label">已冻结</span>
            </div>
          </div>
          <div class="category-list">
            <h4>按分类</h4>
            @for (entry of categoryEntries(); track entry[0]) {
              <div class="category-row">
                <span class="category-name">{{ entry[0] }}</span>
                <span class="category-count">{{ entry[1] }}</span>
              </div>
            }
          </div>
        } @else {
          <p class="loading">加载中...</p>
        }
      </div>

      <div class="section">
        <h3 class="section-title">人格状态</h3>
        @if (personaInfo()) {
          <div class="stat-grid">
            <div class="stat-card">
              <span class="stat-value">v{{ personaInfo()!.version }}</span>
              <span class="stat-label">当前版本</span>
            </div>
          </div>
        } @else {
          <p class="loading">加载中...</p>
        }
      </div>

      <div class="section">
        <h3 class="section-title">待确认进化</h3>
        @if (pendingEvolution()) {
          <div class="evolution-card">
            <p class="trigger-reason">{{ pendingEvolution()!.triggerReason }}</p>
            @for (change of pendingEvolution()!.changes; track change.field) {
              <div class="change-item">
                <span class="change-field">{{ change.field }}</span>
                <span class="change-content">{{ change.content }}</span>
                <span class="change-reason">{{ change.reason }}</span>
              </div>
            }
          </div>
        } @else {
          <p class="empty">暂无待确认进化建议</p>
        }
      </div>

      <div class="section">
        <h3 class="section-title">Token 用量</h3>
        @if (tokenStats()) {
          <div class="stat-grid">
            <div class="stat-card">
              <span class="stat-value">{{ tokenStats()!.totalTokens | number }}</span>
              <span class="stat-label">总 Token</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ tokenStats()!.userTokens | number }}</span>
              <span class="stat-label">用户</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ tokenStats()!.assistantTokens | number }}</span>
              <span class="stat-label">助手</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ tokenStats()!.totalMessages }}</span>
              <span class="stat-label">消息数</span>
            </div>
          </div>
        } @else {
          <p class="empty">选择对话后显示</p>
        }
      </div>

      <div class="section">
        <h3 class="section-title">模型配置（只读）</h3>
        @if (modelConfig()) {
          <p class="model-notice">{{ modelConfig()!.notice }}</p>
          <p class="model-source">配置来源：{{ modelConfig()!.source.path }}</p>

          <div class="scenario-grid">
            @for (entry of scenarioEntries(); track entry.scenario) {
              <div class="scenario-card">
                <div class="scenario-name">{{ entry.scenario }}</div>
                <div class="scenario-model">{{ entry.view.displayName }} ({{ entry.view.modelId }})</div>
                <div class="scenario-meta">
                  route={{ entry.view.routingKey }} · provider={{ entry.view.provider }} · enabled={{ entry.view.enabled }}
                </div>
                @if (entry.view.fallbackApplied) {
                  <div class="scenario-warning">该场景发生了 fallback（配置模型不可用）。</div>
                }
              </div>
            }
          </div>

          <div class="model-list">
            <h4>模型列表</h4>
            @for (model of modelConfig()!.models; track model.id) {
              <div class="model-row">
                <div class="model-main">
                  <span class="model-name">{{ model.displayName }}</span>
                  <span class="model-id">({{ model.id }})</span>
                </div>
                <div class="model-meta">
                  provider={{ model.provider }} · type={{ model.type }} · enabled={{ model.enabled }}
                </div>
                <div class="model-tags">tags: {{ model.tags.join(', ') || '-' }}</div>
              </div>
            }
          </div>

          <div class="model-list">
            <h4>流程映射</h4>
            @for (flow of modelConfig()!.flowMapping; track flow.flow) {
              <div class="flow-row">
                <div class="flow-title">{{ flow.flow }}</div>
                <div class="flow-meta">scenario={{ flow.scenario }} · route={{ flow.routingKey }}</div>
                <div class="flow-entry">入口：{{ flow.entrypoints.join('；') }}</div>
                @if (flow.note) {
                  <div class="flow-note">{{ flow.note }}</div>
                }
              </div>
            }
          </div>
        } @else {
          <p class="loading">加载中...</p>
        }
      </div>

      <button class="refresh-btn" (click)="loadAll()">刷新</button>
    </div>
  `,
  styles: [`
    .debug-panel {
      font-family: var(--font-family);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .section {
      padding: var(--workbench-card-padding);
      border-radius: var(--workbench-card-radius);
      border: 1px solid var(--color-workbench-border);
      background: var(--workbench-surface-gradient-soft);
      box-shadow: var(--chat-panel-shadow);
    }

    .section-title {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 var(--space-2);
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .stat-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      padding: var(--space-2);
      text-align: center;
    }

    .stat-card.warn .stat-value {
      color: var(--color-warning);
    }

    .stat-value {
      display: block;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
    }

    .stat-label {
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
    }

    .category-list {
      background: var(--color-surface);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      padding: var(--space-2);
    }

    .category-list h4 {
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
      margin: 0 0 var(--space-1);
    }

    .category-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: var(--font-size-xs);
    }

    .category-name {
      color: var(--color-text-secondary);
    }

    .category-count {
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .field-group {
      margin-bottom: var(--space-2);
    }

    .field-group label {
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
      display: block;
      margin-bottom: 2px;
    }

    .field-value {
      background: var(--color-surface);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      padding: var(--space-2);
      font-size: var(--font-size-xs);
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
      max-height: 100px;
      overflow-y: auto;
      font-family: var(--font-family);
      color: var(--color-text);
    }

    .evolution-card {
      background: var(--color-surface);
      border: 1px solid var(--color-primary-light);
      border-radius: var(--radius-md);
      padding: var(--space-2);
    }

    .trigger-reason {
      font-size: var(--font-size-xxs);
      color: var(--color-primary);
      margin: 0 0 var(--space-1);
    }

    .change-item {
      padding: var(--space-1) 0;
      border-top: 1px solid var(--color-border-light);
      font-size: var(--font-size-xs);
    }

    .change-field {
      display: inline-block;
      background: var(--color-primary-light);
      color: var(--color-primary);
      padding: 0 var(--space-1);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xxs);
      font-weight: var(--font-weight-semibold);
      margin-right: var(--space-1);
    }

    .change-content {
      color: var(--color-text);
      display: block;
      margin-top: 2px;
    }

    .change-reason {
      color: var(--color-text-tertiary);
      font-size: var(--font-size-xxs);
    }

    .loading, .empty {
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
      margin: 0;
    }

    .model-notice {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .model-source {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
      word-break: break-all;
    }

    .scenario-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .scenario-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      padding: var(--space-2);
    }

    .scenario-name {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-primary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }

    .scenario-model {
      font-size: var(--font-size-xs);
      color: var(--color-text);
      margin-bottom: 2px;
    }

    .scenario-meta {
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
    }

    .scenario-warning {
      margin-top: 4px;
      color: var(--debug-warning-text);
      font-size: var(--font-size-xxs);
    }

    .model-list {
      background: var(--color-surface);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      padding: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .model-list h4 {
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
      margin: 0 0 var(--space-1);
    }

    .model-row {
      padding: var(--space-1) 0;
      border-top: 1px solid var(--color-border-light);
    }

    .model-row:first-of-type {
      border-top: none;
    }

    .model-main {
      font-size: var(--font-size-xs);
      color: var(--color-text);
    }

    .model-name {
      font-weight: var(--font-weight-semibold);
    }

    .model-id {
      color: var(--color-text-tertiary);
      margin-left: 4px;
    }

    .model-meta, .model-tags {
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
      margin-top: 2px;
    }

    .flow-row {
      padding: var(--space-1) 0;
      border-top: 1px solid var(--color-border-light);
    }

    .flow-row:first-of-type {
      border-top: none;
    }

    .flow-title {
      font-size: var(--font-size-xs);
      color: var(--color-text);
      font-weight: var(--font-weight-medium);
    }

    .flow-meta, .flow-entry, .flow-note {
      font-size: var(--font-size-xxs);
      color: var(--color-text-tertiary);
      margin-top: 2px;
      line-height: 1.5;
    }

    .refresh-btn {
      width: 100%;
      padding: var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: pointer;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      font-family: var(--font-family);
      transition: all var(--transition-fast);
    }

    .refresh-btn:hover {
      background: var(--color-bg);
      color: var(--color-text);
    }
  `],
})
export class DebugDashboardComponent implements OnInit {
  private api = environment.apiUrl;
  private readonly scenarioOrder: ModelScenario[] = ['chat', 'dev', 'python', 'reasoning', 'summary'];

  memoryStats = signal<MemoryStats | null>(null);
  personaInfo = signal<PersonaInfo | null>(null);
  pendingEvolution = signal<PendingEvolution | null>(null);
  tokenStats = signal<{ totalTokens: number; userTokens: number; assistantTokens: number; totalMessages: number } | null>(null);
  categoryEntries = signal<[string, number][]>([]);
  modelConfig = signal<ModelConfigView | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly modelConfigService: ModelConfigService,
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loadMemoryStats();
    this.loadPersonaInfo();
    this.loadPendingEvolution();
    this.loadTokenStats();
    this.loadModelConfig();
  }

  scenarioEntries() {
    const config = this.modelConfig();
    if (!config) return [] as Array<{ scenario: ModelScenario; view: ModelConfigView['scenarios'][ModelScenario] }>;
    return this.scenarioOrder.map((scenario) => ({ scenario, view: config.scenarios[scenario] }));
  }

  private loadMemoryStats() {
    this.http.get<Array<{
      id: string; type: string; category: string; decayScore: number; frozen: boolean;
    }>>(`${this.api}/memories`).subscribe(memories => {
      const byType = { mid: 0, long: 0 };
      const byCategory: Record<string, number> = {};
      let decayCandidates = 0;
      let frozen = 0;

      for (const m of memories) {
        if (m.type === 'mid') byType.mid++;
        else byType.long++;
        byCategory[m.category] = (byCategory[m.category] || 0) + 1;
        if (m.decayScore < 0.3) decayCandidates++;
        if (m.frozen) frozen++;
      }

      this.memoryStats.set({
        total: memories.length,
        byType,
        byCategory,
        decayCandidates,
        frozen,
      });
      this.categoryEntries.set(
        Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      );
    });
  }

  private loadPersonaInfo() {
    this.http.get<PersonaInfo>(`${this.api}/persona`).subscribe(p => {
      this.personaInfo.set(p);
    });
  }

  private loadPendingEvolution() {
    this.http.get<PendingEvolution | null>(`${this.api}/persona/evolve/pending`).subscribe(e => {
      this.pendingEvolution.set(e);
    });
  }

  private loadTokenStats() {
    // 获取最近的对话来展示 token 统计
    this.http.get<Array<{ id: string }>>(`${this.api}/conversations`).subscribe(convs => {
      if (convs.length > 0) {
        this.http.get<{
          totalTokens: number; userTokens: number; assistantTokens: number; totalMessages: number;
        }>(`${this.api}/conversations/${convs[0].id}/token-stats`).subscribe(stats => {
          this.tokenStats.set(stats);
        });
      }
    });
  }

  private loadModelConfig() {
    this.modelConfigService.getConfig().subscribe({
      next: (config) => this.modelConfig.set(config),
      error: () => this.modelConfig.set(null),
    });
  }
}
