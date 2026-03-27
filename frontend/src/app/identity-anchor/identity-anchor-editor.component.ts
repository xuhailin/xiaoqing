import { Component, OnInit, signal, inject } from '@angular/core';
import {
  IdentityAnchorService,
  IdentityAnchorDto,
} from '../core/services/identity-anchor.service';
import { MemoryService, Memory } from '../core/services/memory.service';
import { ConversationService } from '../core/services/conversation.service';
import {
  WorldStateService,
  WorldStateDto,
} from '../core/services/world-state.service';
import {
  UserProfileService,
  UserProfileDto,
} from '../core/services/user-profile.service';
import { AuthService } from '../core/services/auth.service';
import { AppIconComponent } from '../shared/ui/app-icon.component';

const LABEL_OPTIONS: { value: string; text: string }[] = [
  { value: 'basic', text: '基本身份' },
  { value: 'location', text: '常住地' },
  { value: 'occupation', text: '职业' },
  { value: 'interest', text: '兴趣' },
  { value: 'custom', text: '自定义' },
];

/** 用户相关的记忆 category 分区 */
const USER_MEMORY_SECTIONS: { category: string; title: string; hint: string }[] = [
  { category: 'soft_preference', title: '软偏好', hint: '用户的口味、习惯、偏好倾向，由对话自动提取。' },
  { category: 'shared_fact', title: '共识事实', hint: '双方确认过的事实性信息。' },
  { category: 'commitment', title: '承诺感知', hint: '用户提到的计划、约定或承诺。' },
];

const COGNITIVE_SECTIONS: { category: string; title: string }[] = [
  { category: 'judgment_pattern', title: '判断模式' },
  { category: 'value_priority', title: '价值排序' },
  { category: 'rhythm_pattern', title: '关系节奏' },
];

@Component({
  selector: 'app-identity-anchor-editor',
  standalone: true,
  imports: [AppIconComponent],
  template: `
    <div class="user-profile">

      <!-- ─── 身份锚定 ─── -->
      <section class="profile-section">
        <div class="section-title">身份锚定</div>
        <p class="hint">告诉小晴「你是谁」——始终注入对话，不衰减、不遗忘。最多 5 条。</p>

        @for (anchor of anchors(); track anchor.id) {
          <div class="anchor-card" [class.inactive]="!anchor.isActive">
            <div class="card-header">
              <span class="label-badge">{{ labelText(anchor.label) }}</span>
              @if (anchor.nickname) {
                <span class="nickname">{{ anchor.nickname }}</span>
              }
              @if (!anchor.isActive) {
                <span class="inactive-tag">已停用</span>
              }
            </div>

            @if (editingId() === anchor.id) {
              <div class="edit-form">
                <div class="form-row">
                  <label>分类</label>
                  <select [value]="editLabel()" (change)="editLabel.set($any($event.target).value)">
                    @for (opt of labelOptions; track opt.value) {
                      <option [value]="opt.value">{{ opt.text }}</option>
                    }
                  </select>
                </div>
                <div class="form-row">
                  <label>称呼（可选）</label>
                  <input
                    type="text"
                    [value]="editNickname()"
                    (input)="editNickname.set($any($event.target).value)"
                    placeholder="如：小海"
                  />
                </div>
                <div class="form-row">
                  <label>描述</label>
                  <textarea
                    rows="3"
                    [value]="editContent()"
                    (input)="editContent.set($any($event.target).value)"
                    placeholder="身份描述"
                  ></textarea>
                </div>
                <div class="edit-actions">
                  <button class="btn-primary" (click)="saveEdit(anchor.id)" [disabled]="saving()">保存</button>
                  <button class="btn-ghost" (click)="cancelEdit()">取消</button>
                </div>
              </div>
            } @else {
              <div class="card-content">{{ anchor.content }}</div>
              <div class="card-actions">
                <button class="btn-ghost" (click)="startEdit(anchor)">编辑</button>
                @if (anchor.isActive) {
                  <button class="btn-ghost btn-danger" (click)="removeAnchor(anchor.id)">停用</button>
                }
              </div>
            }
          </div>
        }

        @if (anchors().length === 0) {
          <p class="empty">暂无身份锚定，点击下方按钮添加。</p>
        }

        @if (showAdd()) {
          <div class="anchor-card add-card">
            <div class="edit-form">
              <div class="form-row">
                <label>分类</label>
                <select [value]="newLabel()" (change)="newLabel.set($any($event.target).value)">
                  @for (opt of labelOptions; track opt.value) {
                    <option [value]="opt.value">{{ opt.text }}</option>
                  }
                </select>
              </div>
              <div class="form-row">
                <label>称呼（可选）</label>
                <input
                  type="text"
                  [value]="newNickname()"
                  (input)="newNickname.set($any($event.target).value)"
                  placeholder="如：小海"
                />
              </div>
              <div class="form-row">
                <label>描述</label>
                <textarea
                  rows="3"
                  [value]="newContent()"
                  (input)="newContent.set($any($event.target).value)"
                  placeholder="身份描述"
                ></textarea>
              </div>
              <div class="edit-actions">
                <button class="btn-primary" (click)="createAnchor()" [disabled]="saving()">添加</button>
                <button class="btn-ghost" (click)="showAdd.set(false)">取消</button>
              </div>
            </div>
          </div>
        } @else {
          <button class="btn-add" (click)="showAdd.set(true)" [disabled]="activeCount() >= 5">
            <app-icon name="plus" size="0.95rem" />
            <span>添加身份锚定</span>
          </button>
        }

        @if (msg()) {
          <span class="msg" [class.error]="msgIsError()">{{ msg() }}</span>
        }
      </section>

      <section class="profile-section">
        <div class="section-title">默认用户偏好</div>
        <p class="hint">稳定的用户画像与回应偏好（由 Claim 自动投影）供系统长期参考；仅展示非 draft 且状态为 STABLE/CORE 的规则。</p>

        <div class="memory-card profile-summary-card">
          <div class="memory-content">{{ userPreferenceSummary() }}</div>
        </div>

        <div class="anchor-card add-card">
          <div class="edit-form">
            <div class="form-row">
              <label>偏好语气</label>
              <textarea
                rows="3"
                [value]="userProfileForm().preferredVoiceStyle"
                (input)="setUserProfileField('preferredVoiceStyle', $any($event.target).value)"
                placeholder="如：少点 GPT 味，更口语"
              ></textarea>
            </div>
            <div class="form-row">
              <label>夸赞偏好</label>
              <textarea
                rows="3"
                [value]="userProfileForm().praisePreference"
                (input)="setUserProfileField('praisePreference', $any($event.target).value)"
                placeholder="如：轻一点，具体一点"
              ></textarea>
            </div>
            <div class="form-row">
              <label>回应节奏偏好</label>
              <textarea
                rows="3"
                [value]="userProfileForm().responseRhythm"
                (input)="setUserProfileField('responseRhythm', $any($event.target).value)"
                placeholder="如：记住后简单确认，不要展开"
              ></textarea>
            </div>
            <div class="edit-actions">
              <button class="btn-primary" (click)="saveUserProfile()" [disabled]="userProfileSaving()">
                {{ userProfileSaving() ? '保存中...' : '保存用户画像' }}
              </button>
              <button class="btn-ghost" (click)="reloadUserProfile()" [disabled]="userProfileSaving()">重载</button>
            </div>
          </div>
        </div>

        @if (userProfile().pendingImpressionCore) {
          <div class="memory-card">
            <div class="memory-content">{{ userProfile().pendingImpressionCore }}</div>
            <div class="edit-actions">
              <button class="btn-primary" (click)="confirmImpression('core')" [disabled]="userProfileSaving()">确认核心印象</button>
              <button class="btn-ghost btn-danger" (click)="rejectImpression('core')" [disabled]="userProfileSaving()">拒绝</button>
            </div>
          </div>
        }

        @if (userProfile().pendingImpressionDetail) {
          <div class="memory-card">
            <div class="memory-content">{{ userProfile().pendingImpressionDetail }}</div>
            <div class="edit-actions">
              <button class="btn-primary" (click)="confirmImpression('detail')" [disabled]="userProfileSaving()">确认细节印象</button>
              <button class="btn-ghost btn-danger" (click)="rejectImpression('detail')" [disabled]="userProfileSaving()">拒绝</button>
            </div>
          </div>
        }
      </section>

      <!-- ─── 用户记忆分区（软偏好 / 共识事实 / 承诺） ─── -->
      @for (sec of userMemorySections; track sec.category) {
        <section class="profile-section">
          <div class="section-title">{{ sec.title }}</div>
          <p class="hint">{{ sec.hint }}</p>
          @if (memoryMap()[sec.category]; as items) {
            @if (items.length) {
              @for (m of items; track m.id) {
                <div class="memory-card">
                  <div class="memory-content">{{ m.content }}</div>
                  <div class="memory-meta">
                    <span class="memory-confidence">置信 {{ (m.confidence * 100).toFixed(0) }}%</span>
                    <span class="memory-time">{{ formatDate(m.createdAt) }}</span>
                  </div>
                </div>
              }
            } @else {
              <p class="empty">暂无数据，对话中自动积累。</p>
            }
          } @else {
            <p class="empty">加载中...</p>
          }
        </section>
      }

      <!-- ─── 长期认知（判断模式 / 价值排序 / 关系节奏） ─── -->
      @if (hasCognitive()) {
        <section class="profile-section">
          <div class="section-title">长期认知</div>
          <p class="hint">由记忆分析引擎自动提取的深层用户特征。</p>
          @for (sec of cognitiveSections; track sec.category) {
            @if (memoryMap()[sec.category]; as items) {
              @if (items.length) {
                <div class="cognitive-group">
                  <span class="cognitive-label">{{ sec.title }}</span>
                  @for (m of items; track m.id) {
                    <div class="memory-card memory-card--compact">
                      <div class="memory-content">{{ m.content }}</div>
                    </div>
                  }
                </div>
              }
            }
          }
        </section>
      }

      <!-- ─── World State（会话级默认前提） ─── -->
      <section class="profile-section">
        <div class="section-title">默认世界状态</div>
        <p class="hint">会话级默认前提，用于地点、时区、语言等补全，不写入长期记忆。</p>

        @if (currentConversationId()) {
          <div class="anchor-card add-card">
            <div class="edit-form">
              <div class="form-row">
                <label>地点</label>
                <input
                  type="text"
                  [value]="worldStateForm().city"
                  (input)="setWorldField('city', $any($event.target).value)"
                  placeholder="如：北京"
                />
              </div>
              <div class="form-row">
                <label>时区</label>
                <input
                  type="text"
                  [value]="worldStateForm().timezone"
                  (input)="setWorldField('timezone', $any($event.target).value)"
                  placeholder="如：Asia/Shanghai"
                />
              </div>
              <div class="form-row">
                <label>语言</label>
                <input
                  type="text"
                  [value]="worldStateForm().language"
                  (input)="setWorldField('language', $any($event.target).value)"
                  placeholder="如：zh-CN"
                />
              </div>
              <div class="form-row">
                <label>设备</label>
                <input
                  type="text"
                  [value]="worldStateForm().device"
                  (input)="setWorldField('device', $any($event.target).value)"
                  placeholder="如：desktop"
                />
              </div>
              <div class="form-row">
                <label>对话模式</label>
                <select
                  [value]="worldStateForm().conversationMode"
                  (change)="setWorldField('conversationMode', $any($event.target).value)"
                >
                  <option value="">未设置</option>
                  <option value="chat">chat</option>
                  <option value="thinking">thinking</option>
                  <option value="decision">decision</option>
                  <option value="task">task</option>
                </select>
              </div>
              <div class="edit-actions">
                <button class="btn-primary" (click)="saveWorldState()" [disabled]="worldStateSaving()">
                  {{ worldStateSaving() ? '保存中...' : '保存默认状态' }}
                </button>
                <button class="btn-ghost" (click)="reloadWorldState()" [disabled]="worldStateSaving()">重载</button>
              </div>
            </div>
          </div>
        } @else {
          <p class="empty">暂无当前会话，进入聊天后可编辑。</p>
        }
      </section>

    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    :host::-webkit-scrollbar { width: 4px; }
    :host::-webkit-scrollbar-track { background: transparent; }
    :host::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: var(--radius-pill);
    }

    .user-profile {
      padding: var(--space-1) 0;
    }

    .profile-section {
      margin-bottom: var(--space-4);
    }

    .section-title {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: var(--space-1);
    }

    .hint {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      margin-bottom: var(--space-3);
      line-height: 1.5;
    }

    /* ── 身份锚定卡片（可编辑） ── */
    .anchor-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      margin-bottom: var(--space-2);
      transition: border-color var(--transition-fast);

      &:hover { border-color: var(--color-primary); }
      &.inactive { opacity: 0.5; }
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .label-badge {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-primary);
      background: var(--color-primary-light);
      padding: 2px var(--space-2);
      border-radius: var(--radius-pill);
    }

    .nickname {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text);
    }

    .inactive-tag {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      margin-left: auto;
    }

    .card-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .card-actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }

    /* ── 记忆卡片（只读） ── */
    .memory-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      margin-bottom: var(--space-2);

      &--compact {
        padding: var(--space-1) var(--space-2);
        margin-bottom: var(--space-1);
      }
    }

    .memory-content {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .memory-meta {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-1);
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    /* ── 认知分组 ── */
    .cognitive-group {
      margin-bottom: var(--space-3);
    }

    .cognitive-label {
      display: inline-block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-primary);
      background: var(--color-primary-light);
      padding: 1px var(--space-2);
      border-radius: var(--radius-pill);
      margin-bottom: var(--space-2);
    }

    /* ── 表单样式 ── */
    .edit-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .form-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);

      label {
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
      }
    }

    input, select, textarea {
      width: 100%;
      padding: var(--space-1) var(--space-2);
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

      &::placeholder { color: var(--color-text-muted); }
    }

    textarea { resize: vertical; line-height: var(--line-height-base); }
    select { cursor: pointer; }

    .edit-actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }

    .btn-primary {
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-md);
      border: none;
      background: var(--color-button-primary-bg);
      color: var(--color-button-primary-text);
      cursor: pointer;
      font-size: var(--font-size-xs);
      font-family: var(--font-family);
      font-weight: var(--font-weight-medium);
      transition: background var(--transition-fast), box-shadow var(--transition-fast);

      &:not(:disabled):hover {
        background: var(--color-button-primary-hover-bg);
        box-shadow: var(--color-button-primary-shadow);
      }
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }

    .btn-ghost {
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: transparent;
      cursor: pointer;
      font-size: var(--font-size-xs);
      font-family: var(--font-family);
      color: var(--color-text-secondary);
      transition: all var(--transition-fast);

      &:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
    }

    .btn-danger:hover {
      border-color: var(--color-error);
      color: var(--color-error);
    }

    .btn-add {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-2);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      background: transparent;
      cursor: pointer;
      font-size: var(--font-size-sm);
      font-family: var(--font-family);
      color: var(--color-text-muted);
      transition: all var(--transition-fast);

      &:hover:not(:disabled) {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    .empty {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      font-style: italic;
      text-align: center;
      padding: var(--space-3) 0;
    }

    .msg {
      display: inline-block;
      margin-top: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-success);

      &.error { color: var(--color-error); }
    }

    .profile-summary-card {
      margin-bottom: var(--space-3);
      background: color-mix(in srgb, var(--color-surface-hover) 55%, var(--color-surface));
      border-color: color-mix(in srgb, var(--color-primary-soft) 45%, var(--color-border-light));
      box-shadow: var(--chat-panel-shadow);
    }
  `],
})
export class IdentityAnchorEditorComponent implements OnInit {
  private anchorService = inject(IdentityAnchorService);
  private memoryService = inject(MemoryService);
  private conversationService = inject(ConversationService);
  private worldStateService = inject(WorldStateService);
  private userProfileService = inject(UserProfileService);
  private auth = inject(AuthService);

  labelOptions = LABEL_OPTIONS;
  userMemorySections = USER_MEMORY_SECTIONS;
  cognitiveSections = COGNITIVE_SECTIONS;

  anchors = signal<IdentityAnchorDto[]>([]);
  saving = signal(false);
  msg = signal('');
  msgIsError = signal(false);

  // Memory data by category
  memoryMap = signal<Record<string, Memory[]>>({});
  hasCognitive = signal(false);

  // User profile
  userProfile = signal<UserProfileDto>({
    userKey: this.auth.currentUserId ?? '',
    preferredPersonaKey: 'default',
    preferredVoiceStyle: '',
    praisePreference: '',
    responseRhythm: '',
    impressionCore: null,
    impressionDetail: null,
    pendingImpressionCore: null,
    pendingImpressionDetail: null,
  });
  userProfileSaving = signal(false);
  userProfileForm = signal({
    preferredVoiceStyle: '',
    praisePreference: '',
    responseRhythm: '',
  });

  // World state
  currentConversationId = signal<string | null>(null);
  worldStateSaving = signal(false);
  worldStateForm = signal<Required<WorldStateDto>>({
    city: '',
    timezone: '',
    language: '',
    device: '',
    conversationMode: '',
  });

  // Add form
  showAdd = signal(false);
  newLabel = signal('basic');
  newContent = signal('');
  newNickname = signal('');

  // Edit form
  editingId = signal<string | null>(null);
  editLabel = signal('');
  editContent = signal('');
  editNickname = signal('');

  activeCount = signal(0);

  async ngOnInit() {
    await Promise.all([
      this.loadAnchors(),
      this.loadUserProfile(),
      this.loadUserMemories(),
      this.loadWorldState(),
    ]);
  }

  // ── 身份锚定 ──

  async loadAnchors() {
    try {
      const list = await this.anchorService.list().toPromise();
      if (list) {
        this.anchors.set(list);
        this.activeCount.set(list.filter((a) => a.isActive).length);
      }
    } catch {
      this.showMsg('加载锚定失败', true);
    }
  }

  labelText(value: string): string {
    return LABEL_OPTIONS.find((o) => o.value === value)?.text ?? value;
  }

  startEdit(anchor: IdentityAnchorDto) {
    this.editingId.set(anchor.id);
    this.editLabel.set(anchor.label);
    this.editContent.set(anchor.content);
    this.editNickname.set(anchor.nickname ?? '');
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  async saveEdit(id: string) {
    this.saving.set(true);
    try {
      await this.anchorService.update(id, {
        label: this.editLabel(),
        content: this.editContent(),
        nickname: this.editNickname() || undefined,
      }).toPromise();
      this.editingId.set(null);
      await this.loadAnchors();
      this.showMsg('已保存');
    } catch {
      this.showMsg('保存失败', true);
    } finally {
      this.saving.set(false);
    }
  }

  async createAnchor() {
    if (!this.newContent().trim()) return;
    this.saving.set(true);
    try {
      await this.anchorService.create({
        label: this.newLabel(),
        content: this.newContent(),
        nickname: this.newNickname() || undefined,
      }).toPromise();
      this.showAdd.set(false);
      this.newLabel.set('basic');
      this.newContent.set('');
      this.newNickname.set('');
      await this.loadAnchors();
      this.showMsg('已添加');
    } catch {
      this.showMsg('添加失败', true);
    } finally {
      this.saving.set(false);
    }
  }

  async removeAnchor(id: string) {
    try {
      await this.anchorService.remove(id).toPromise();
      await this.loadAnchors();
      this.showMsg('已停用');
    } catch {
      this.showMsg('操作失败', true);
    }
  }

  // ── 用户记忆加载 ──

  async loadUserMemories() {
    const allCategories = [
      ...USER_MEMORY_SECTIONS.map((s) => s.category),
      ...COGNITIVE_SECTIONS.map((s) => s.category),
    ];

    const results = await Promise.all(
      allCategories.map(async (cat) => {
        try {
          const items = await this.memoryService.list(undefined, cat).toPromise();
          return { cat, items: items ?? [] };
        } catch {
          return { cat, items: [] };
        }
      }),
    );

    const map: Record<string, Memory[]> = {};
    let cogCount = 0;
    for (const r of results) {
      map[r.cat] = r.items;
      if (COGNITIVE_SECTIONS.some((s) => s.category === r.cat) && r.items.length) {
        cogCount++;
      }
    }
    this.memoryMap.set(map);
    this.hasCognitive.set(cogCount > 0);
  }

  async loadUserProfile() {
    try {
      const profile = await this.userProfileService.get().toPromise();
      if (!profile) return;
      this.userProfile.set(profile);
      this.userProfileForm.set({
        preferredVoiceStyle: profile.preferredVoiceStyle,
        praisePreference: profile.praisePreference,
        responseRhythm: profile.responseRhythm,
      });
    } catch {
      this.showMsg('加载用户画像失败', true);
    }
  }

  async reloadUserProfile() {
    await this.loadUserProfile();
    this.showMsg('已重载用户画像');
  }

  setUserProfileField(
    key: 'preferredVoiceStyle' | 'praisePreference' | 'responseRhythm',
    value: string,
  ) {
    this.userProfileForm.update((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async saveUserProfile() {
    this.userProfileSaving.set(true);
    try {
      const form = this.userProfileForm();
      const profile = await this.userProfileService.update({
        preferredVoiceStyle: form.preferredVoiceStyle,
        praisePreference: form.praisePreference,
        responseRhythm: form.responseRhythm,
      }).toPromise();
      if (profile) {
        this.userProfile.set(profile);
        this.userProfileForm.set({
          preferredVoiceStyle: profile.preferredVoiceStyle,
          praisePreference: profile.praisePreference,
          responseRhythm: profile.responseRhythm,
        });
      }
      this.showMsg('用户画像已保存');
    } catch {
      this.showMsg('保存用户画像失败', true);
    } finally {
      this.userProfileSaving.set(false);
    }
  }

  async confirmImpression(target: 'core' | 'detail') {
    this.userProfileSaving.set(true);
    try {
      const profile = await this.userProfileService.confirmImpression(target).toPromise();
      if (profile) this.userProfile.set(profile);
      this.showMsg('已确认印象');
    } catch {
      this.showMsg('确认印象失败', true);
    } finally {
      this.userProfileSaving.set(false);
    }
  }

  async rejectImpression(target: 'core' | 'detail') {
    this.userProfileSaving.set(true);
    try {
      const profile = await this.userProfileService.rejectImpression(target).toPromise();
      if (profile) this.userProfile.set(profile);
      this.showMsg('已拒绝印象');
    } catch {
      this.showMsg('拒绝印象失败', true);
    } finally {
      this.userProfileSaving.set(false);
    }
  }

  // ── 工具方法 ──

  formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  userPreferenceSummary(): string {
    const profile = this.userProfile();
    const clean = (text: string) =>
      text
        .split('\n')
        .map((line) => line.trim().replace(/^[\-\s]+/, ''))
        .filter(Boolean);

    const voice = clean(profile.preferredVoiceStyle);
    const praise = clean(profile.praisePreference);
    const rhythm = clean(profile.responseRhythm);

    const parts: string[] = [];
    if (voice.length) {
      parts.push(`她偏好的表达语气是：${voice.join('、')}。`);
    }
    if (praise.length) {
      parts.push(`在夸赞上更希望：${praise.join('、')}。`);
    }
    if (rhythm.length) {
      parts.push(`在回应节奏上更适合：${rhythm.join('、')}。`);
    }

    if (!parts.length) {
      return '当前还没有形成稳定偏好，系统会随对话继续沉淀。';
    }
    return parts.join('\n');
  }

  // ── World State（会话级默认前提）──

  async loadWorldState() {
    try {
      const current = await this.conversationService.getOrCreateCurrent().toPromise();
      const conversationId = current?.id ?? null;
      this.currentConversationId.set(conversationId);
      if (!conversationId) return;
      const state = await this.worldStateService.get(conversationId).toPromise();
      this.worldStateForm.set({
        city: state?.city ?? '',
        timezone: state?.timezone ?? '',
        language: state?.language ?? '',
        device: state?.device ?? '',
        conversationMode: state?.conversationMode ?? '',
      });
    } catch {
      this.currentConversationId.set(null);
      this.showMsg('加载默认世界状态失败', true);
    }
  }

  async reloadWorldState() {
    await this.loadWorldState();
    this.showMsg('已重载默认世界状态');
  }

  setWorldField(key: keyof WorldStateDto, value: string) {
    this.worldStateForm.update((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async saveWorldState() {
    const conversationId = this.currentConversationId();
    if (!conversationId) return;

    this.worldStateSaving.set(true);
    const form = this.worldStateForm();
    try {
      const updated = await this.worldStateService.update(conversationId, {
        city: form.city.trim() || undefined,
        timezone: form.timezone.trim() || undefined,
        language: form.language.trim() || undefined,
        device: form.device.trim() || undefined,
        conversationMode: form.conversationMode.trim() || undefined,
      }).toPromise();

      this.worldStateForm.set({
        city: updated?.city ?? '',
        timezone: updated?.timezone ?? '',
        language: updated?.language ?? '',
        device: updated?.device ?? '',
        conversationMode: updated?.conversationMode ?? '',
      });
      this.showMsg('默认世界状态已保存');
    } catch {
      this.showMsg('保存默认世界状态失败', true);
    } finally {
      this.worldStateSaving.set(false);
    }
  }

  private showMsg(text: string, isError = false) {
    this.msg.set(text);
    this.msgIsError.set(isError);
    setTimeout(() => this.msg.set(''), 2000);
  }
}
