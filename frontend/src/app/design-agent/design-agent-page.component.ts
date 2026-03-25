import { NgClass } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { marked } from 'marked';
import { AgentChatComponent } from '../shared/components/agent-chat/agent-chat.component';
import type { AgentSession } from '../shared/components/agent-chat/agent-session.types';
import { AppButtonComponent } from '../shared/ui/app-button.component';
import { AppIconComponent } from '../shared/ui/app-icon.component';
import { AppMessageComposerComponent } from '../shared/ui/app-message-composer.component';
import { AppStateComponent } from '../shared/ui/app-state.component';
import {
  DesignAgentService,
  type DesignConversationDto,
  type DesignImageInput,
} from '../core/services/design-agent.service';

@Component({
  selector: 'app-design-agent-page',
  standalone: true,
  imports: [
    FormsModule,
    NgClass,
    AgentChatComponent,
    AppButtonComponent,
    AppIconComponent,
    AppMessageComposerComponent,
    AppStateComponent,
  ],
  template: `
    <app-agent-chat
      [sessions]="agentSessions()"
      [activeSession]="activeAgentSession()"
      (selectSession)="selectConversation($event.id)"
      (newSession)="createNewConversation()"
    >
      @if (currentConversation()) {

        <!-- 消息列表 -->
        <div class="message-list ui-scrollbar" #messagesContainer>

          @for (msg of messages(); track msg.id) {

            @if (msg.role === 'user') {
              <!-- ── User 消息（右侧气泡）────────────────── -->
              <article class="msg-row msg-row--user">
                <div class="msg-label">你</div>
                @if (msg.metadata?.images?.length) {
                  <div class="msg-images">
                    @for (img of msg.metadata!.images!; track $index) {
                      <img
                        class="msg-image"
                        [src]="'data:' + img.mimeType + ';base64,' + img.base64"
                        alt="上传的截图"
                      />
                    }
                  </div>
                }
                <div class="bubble bubble--user">{{ msg.content }}</div>
                <div class="msg-time">{{ formatTime(msg.createdAt) }}</div>
              </article>

            } @else if (msg.role === 'assistant') {
              <!-- ── Assistant 消息（左侧气泡）────────────── -->
              <article class="msg-row msg-row--assistant">
                <div class="msg-label">Design Agent</div>

                <!-- 审查详情折叠块 -->
                @if (msg.metadata?.auditResult?.findings?.length) {
                  <div class="audit-block" [class.is-expanded]="isAuditExpanded(msg.id)">
                    <button
                      type="button"
                      class="audit-header"
                      (click)="toggleAudit(msg.id)"
                    >
                      <span class="audit-icon" aria-hidden="true">🔍</span>
                      <span class="audit-label">
                        查看审查详情 · {{ msg.metadata!.auditResult!.findings.length }} 个问题
                        @if (highFindingCount(msg) > 0) {
                          <span class="audit-high-badge">{{ highFindingCount(msg) }} 高危</span>
                        }
                      </span>
                      <span class="audit-toggle">{{ isAuditExpanded(msg.id) ? '↑' : '↓' }}</span>
                    </button>

                    @if (isAuditExpanded(msg.id)) {
                      <div class="audit-findings">
                        @for (finding of msg.metadata!.auditResult!.findings; track finding.id) {
                          <div
                            class="finding"
                            [ngClass]="'finding--' + findingSeverity(finding.severity)"
                          >
                            <div class="finding-head">
                              <span class="finding-severity-tag finding-severity-tag--{{ findingSeverity(finding.severity) }}">
                                {{ finding.severity }}
                              </span>
                              <span class="finding-rule">{{ finding.rule }}</span>
                              @if (finding.location) {
                                <code class="finding-location">{{ finding.location }}</code>
                              }
                            </div>
                            <p class="finding-problem">{{ finding.problem }}</p>
                            @if (finding.impact) {
                              <p class="finding-impact">影响：{{ finding.impact }}</p>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }

                <!-- 回复气泡 -->
                @if (msg.content.trim()) {
                  <div
                    class="bubble bubble--assistant"
                    [innerHTML]="renderMarkdown(msg.content)"
                  ></div>
                }

                <!-- 建议修改方案 -->
                @if (msg.metadata?.proposedChanges?.length) {
                  <div class="proposed-changes">
                    <div class="proposed-changes__header">建议修改</div>
                    @for (change of msg.metadata!.proposedChanges!; track change.filePath) {
                      <div class="change-item">
                        <code class="change-path">{{ change.filePath }}</code>
                        <p class="change-desc">{{ change.description }}</p>
                      </div>
                    }
                    @if (!applyingChanges()) {
                      <app-button
                        variant="primary"
                        size="sm"
                        (click)="applyChanges(currentConversation()!.id)"
                      >
                        确认修改
                      </app-button>
                    } @else {
                      <span class="applying-hint">应用中...</span>
                    }
                  </div>
                }

                <!-- 执行结果 -->
                @if (msg.metadata?.executionResult) {
                  <div
                    class="exec-result"
                    [class.exec-result--success]="msg.metadata!.executionResult!.success"
                    [class.exec-result--error]="!msg.metadata!.executionResult!.success"
                  >
                    @if (msg.metadata!.executionResult!.success) {
                      已修改 {{ msg.metadata!.executionResult!.changedFiles.length }} 个文件
                    } @else {
                      修改失败：{{ msg.metadata!.executionResult!.error }}
                    }
                  </div>
                }

                <div class="msg-time">{{ formatTime(msg.createdAt) }}</div>
              </article>
            }

          } @empty {
            <app-state
              title="开始设计审查"
              description="描述想审查的页面，或上传截图指出 UI 问题。"
            />
          }

          @if (loading()) {
            <div class="typing-indicator">
              <span class="typing-spinner" aria-hidden="true"></span>
              <span>正在思考...</span>
            </div>
          }

          @if (sendError()) {
            <div class="send-error">
              <span>{{ sendError() }}</span>
            </div>
          }

        </div>

        <!-- 输入区 -->
        <app-message-composer
          [taskInput]="inputText()"
          [sending]="loading()"
          placeholder="描述页面问题或上传截图..."
          hint="支持上传截图 · 确认修改后自动应用"
          submitLabel="发送"
          [submitDisabled]="!inputText().trim() && !pendingImages().length"
          (taskInputChange)="inputText.set($event)"
          (submit)="sendMessage()"
        >
          @if (pendingImages().length) {
            <div class="image-preview" composerTop>
              @for (img of pendingImages(); track $index) {
                <div class="preview-item">
                  <img [src]="img.previewUrl" alt="待上传" />
                  <button
                    type="button"
                    class="preview-remove"
                    (click)="removePendingImage($index)"
                  >×</button>
                </div>
              }
            </div>
          }

          <label class="upload-btn" composerPrefix>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              (change)="handleImageUpload($event)"
            />
            <app-icon name="image" size="1.1rem" />
          </label>
        </app-message-composer>

      } @else {

        <!-- 未选择对话 -->
        <div class="empty-main">
          <app-state
            title="选择或创建对话"
            description="从左侧选择一个已有对话，或新建一个开始审查。"
          >
            <app-button variant="primary" size="sm" (click)="createNewConversation()">
              开始新对话
            </app-button>
          </app-state>
        </div>

      }
    </app-agent-chat>
  `,
  styles: [`
    :host {
      display: block;
      flex: 1;
      height: 100%;
      min-height: 0;
      padding: var(--workbench-shell-padding);
      --agent-chat-sidebar-width: 240px;
    }

    app-agent-chat {
      display: block;
      height: 100%;
    }

    // ── 消息列表 ────────────────────────────────

    .message-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: var(--workbench-chat-padding);
      display: flex;
      flex-direction: column;
      gap: var(--workbench-chat-gap);
    }

    .empty-main {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    // ── 消息行 ────────────────────────────────

    .msg-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      max-width: min(var(--workbench-message-measure, 640px), 88%);
    }

    .msg-row--user {
      align-items: flex-end;
      margin-left: auto;
    }

    .msg-row--assistant {
      align-items: flex-start;
    }

    .msg-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .msg-time {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    // ── 气泡 ────────────────────────────────

    .bubble {
      padding: var(--workbench-message-padding, var(--space-3) var(--space-4));
      border-radius: var(--workbench-card-radius, var(--radius-lg));
      font-size: var(--font-size-sm);
      line-height: 1.65;
      word-break: break-word;
      box-shadow: var(--chat-bubble-shadow);
    }

    .bubble--user {
      background: var(--color-user-bubble);
      border: 1px solid var(--dev-agent-user-border);
      color: var(--color-text);
      white-space: pre-wrap;
    }

    .bubble--assistant {
      background: var(--color-surface);
      border: 1px solid var(--color-border-light);
      color: var(--color-text);

      ::ng-deep {
        p { margin: var(--space-1) 0; }
        p:first-child { margin-top: 0; }
        p:last-child { margin-bottom: 0; }
        h1, h2, h3, h4 {
          margin: var(--space-3) 0 var(--space-1);
          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-semibold);
        }
        code {
          padding: 0.1em 0.35em;
          background: color-mix(in srgb, var(--color-primary) 7%, transparent);
          border-radius: var(--radius-sm);
          font-size: 0.9em;
        }
        ul, ol { margin: var(--space-1) 0; padding-left: var(--space-5); }
        li { margin: var(--space-1) 0; }
        pre {
          margin: var(--space-2) 0;
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface-muted, color-mix(in srgb, var(--color-border) 20%, transparent));
          border-radius: var(--radius-md);
          overflow-x: auto;
          font-size: var(--font-size-xs);
        }
      }
    }

    // ── 上传图片 ────────────────────────────────

    .msg-images {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: flex-end;
    }

    .msg-image {
      max-width: 200px;
      max-height: 150px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border-light);
    }

    // ── 审查详情折叠块 ────────────────────────────────

    .audit-block {
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      background: var(--chat-work-card-bg, color-mix(in srgb, var(--color-surface) 80%, var(--color-bg)));
      overflow: hidden;
    }

    .audit-block.is-expanded {
      border-color: color-mix(in srgb, var(--color-primary) 20%, var(--color-border-light));
    }

    .audit-header {
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: none;
      background: transparent;
      cursor: pointer;
      font-family: var(--font-family);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      text-align: left;
    }

    .audit-icon {
      flex-shrink: 0;
      font-size: 12px;
      line-height: 1;
    }

    .audit-label {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .audit-high-badge {
      font-size: 10px;
      font-weight: var(--font-weight-medium);
      color: var(--color-error);
      background: color-mix(in srgb, var(--color-error) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
      border-radius: var(--radius-pill);
      padding: 1px var(--space-2);
    }

    .audit-toggle {
      font-size: 10px;
      color: var(--color-text-muted);
      flex-shrink: 0;
    }

    // ── Findings ────────────────────────────────

    .audit-findings {
      border-top: 1px solid var(--color-border-light);
      padding: var(--space-2) var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .finding {
      padding: var(--space-2) var(--space-3);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      border-left: 2px solid var(--color-border);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .finding--high {
      border-left-color: var(--color-error);
      background: color-mix(in srgb, var(--color-error) 5%, transparent);
    }

    .finding--medium {
      border-left-color: var(--color-warning);
      background: color-mix(in srgb, var(--color-warning) 5%, transparent);
    }

    .finding--low {
      border-left-color: var(--color-border);
      background: transparent;
    }

    .finding-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .finding-severity-tag {
      font-size: 10px;
      font-weight: var(--font-weight-medium);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 1px var(--space-2);
      border-radius: var(--radius-pill);
      flex-shrink: 0;
    }

    .finding-severity-tag--high {
      color: var(--color-error);
      background: color-mix(in srgb, var(--color-error) 12%, transparent);
    }

    .finding-severity-tag--medium {
      color: var(--color-warning);
      background: color-mix(in srgb, var(--color-warning) 12%, transparent);
    }

    .finding-severity-tag--low {
      color: var(--color-text-muted);
      background: var(--color-badge-neutral-bg);
    }

    .finding-rule {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      min-width: 0;
    }

    .finding-location {
      font-size: var(--font-size-xxs);
      color: var(--color-text-muted);
      background: var(--color-surface-muted, color-mix(in srgb, var(--color-border) 20%, transparent));
      padding: 1px var(--space-2);
      border-radius: var(--radius-sm);
    }

    .finding-problem {
      margin: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text);
      line-height: 1.5;
    }

    .finding-impact {
      margin: 0;
      font-size: var(--font-size-xxs);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    // ── 建议修改方案 ────────────────────────────────

    .proposed-changes {
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-surface) 85%, transparent);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .proposed-changes__header {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .change-item {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--color-surface) 92%, transparent);
      border: 1px solid var(--color-border-light);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .change-path {
      display: block;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .change-desc {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text);
    }

    .applying-hint {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }

    // ── 执行结果 ────────────────────────────────

    .exec-result {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      font-size: var(--font-size-xs);
    }

    .exec-result--success {
      background: color-mix(in srgb, var(--color-success) 8%, transparent);
      color: var(--color-success);
      border: 1px solid color-mix(in srgb, var(--color-success) 20%, transparent);
    }

    .exec-result--error {
      background: color-mix(in srgb, var(--color-error) 8%, transparent);
      color: var(--color-error);
      border: 1px solid color-mix(in srgb, var(--color-error) 20%, transparent);
    }

    // ── 加载/错误 ────────────────────────────────

    .typing-indicator {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .typing-spinner {
      width: 0.6rem;
      height: 0.6rem;
      border-radius: var(--radius-pill);
      border: 1.5px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
      border-top-color: var(--color-primary);
      animation: spin 0.9s linear infinite;
      flex-shrink: 0;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .send-error {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-badge-danger-bg);
      border: 1px solid var(--color-badge-danger-border);
      color: var(--color-error);
      font-size: var(--font-size-xs);
    }

    // ── 图片上传 ────────────────────────────────

    .image-preview {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .preview-item {
      position: relative;
    }

    .preview-item img {
      width: 80px;
      height: 60px;
      object-fit: cover;
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border-light);
    }

    .preview-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 50%;
      background: var(--color-error);
      color: #fff;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .upload-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--color-text-secondary);
      transition: background 0.15s;
      flex-shrink: 0;
    }

    .upload-btn:hover {
      background: color-mix(in srgb, var(--color-surface) 80%, transparent);
      color: var(--color-text);
    }

    .upload-btn input {
      display: none;
    }

    // ── 响应式 ────────────────────────────────

    @media (max-width: 900px) {
      :host {
        --agent-chat-sidebar-width: 100%;
      }
    }
  `],
})
export class DesignAgentPageComponent {
  private readonly service = inject(DesignAgentService);

  // ── UI 状态 ────────────────────────────────
  protected readonly loading = signal(false);
  protected readonly applyingChanges = signal(false);
  protected readonly inputText = signal('');
  protected readonly pendingImages = signal<Array<{ base64: string; mimeType: DesignImageInput['mimeType']; previewUrl: string }>>([]);
  protected readonly sendError = signal<string | null>(null);

  // 展开的审查块（msgId set）
  private readonly expandedAudits = signal<Set<string>>(new Set());

  // ── 对话数据 ────────────────────────────────
  protected readonly conversations = signal<DesignConversationDto[]>([]);
  protected readonly currentConversation = signal<DesignConversationDto | null>(null);
  protected readonly messages = computed(() => this.currentConversation()?.messages ?? []);

  // 滚动容器引用
  protected readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');

  // ── AgentSession 适配 ────────────────────────────────

  protected readonly agentSessions = computed(() => {
    const currentId = this.currentConversation()?.id;
    const isLoading = this.loading();
    return this.conversations().map((conv) =>
      this.toAgentSession(conv, isLoading && conv.id === currentId),
    );
  });

  protected readonly activeAgentSession = computed(() => {
    const conv = this.currentConversation();
    return conv ? this.toAgentSession(conv, this.loading()) : null;
  });

  private toAgentSession(conv: DesignConversationDto, isRunning = false): AgentSession {
    const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === 'user');
    return {
      id: conv.id,
      title: conv.title || conv.pageName || '新对话',
      status: isRunning ? 'running' : 'success',
      createdAt: conv.createdAt,
      lastMessage: lastUserMsg?.content?.slice(0, 60) ?? null,
    };
  }

  constructor() {
    this.loadConversations();
  }

  // ── 对话管理 ────────────────────────────────

  protected loadConversations(): void {
    this.service.listConversations().subscribe({
      next: (convs) => this.conversations.set(convs),
      error: (err) => console.error('Failed to load conversations:', err),
    });
  }

  protected createNewConversation(): void {
    this.loading.set(true);
    this.service.createConversation({}).subscribe({
      next: (conv) => {
        this.loading.set(false);
        this.conversations.update((list) => [conv, ...list]);
        this.currentConversation.set(conv);
      },
      error: (err) => {
        this.loading.set(false);
        console.error('Failed to create conversation:', err);
      },
    });
  }

  protected selectConversation(id: string): void {
    this.service.getConversation(id).subscribe({
      next: (conv) => {
        this.currentConversation.set(conv);
        this.scrollToBottom();
      },
      error: (err) => console.error('Failed to load conversation:', err),
    });
  }

  // ── 消息发送 ────────────────────────────────

  protected sendMessage(): void {
    const conv = this.currentConversation();
    if (!conv) return;

    const text = this.inputText().trim();
    const images = this.pendingImages();
    if (!text && !images.length) return;

    this.loading.set(true);
    this.sendError.set(null);
    const pendingText = text;
    const pendingImages = [...images];
    this.inputText.set('');
    this.pendingImages.set([]);

    this.service.sendMessage(conv.id, {
      content: pendingText,
      images: pendingImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType })),
    }).subscribe({
      next: (updated) => {
        this.loading.set(false);
        this.currentConversation.set(updated);
        this.updateConversationInList(updated);
        this.scrollToBottom();
      },
      error: (err) => {
        this.loading.set(false);
        this.inputText.set(pendingText);
        this.pendingImages.set(pendingImages);
        this.sendError.set(err?.error?.message || err?.message || '发送失败，请重试');
      },
    });
  }

  // ── 审查详情折叠 ────────────────────────────────

  protected isAuditExpanded(msgId: string): boolean {
    return this.expandedAudits().has(msgId);
  }

  protected toggleAudit(msgId: string): void {
    this.expandedAudits.update((s) => {
      const next = new Set(s);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }

  protected findingSeverity(severity: string): 'high' | 'medium' | 'low' {
    const s = severity.toLowerCase();
    if (s === 'high' || s === 'critical' || s === 'error') return 'high';
    if (s === 'medium' || s === 'warning' || s === 'warn') return 'medium';
    return 'low';
  }

  protected highFindingCount(msg: { metadata?: { auditResult?: { findings?: Array<{ severity: string }> } } }): number {
    return msg.metadata?.auditResult?.findings?.filter(
      (f) => this.findingSeverity(f.severity) === 'high',
    ).length ?? 0;
  }

  // ── 修改应用 ────────────────────────────────

  protected applyChanges(conversationId: string): void {
    this.applyingChanges.set(true);
    this.service.applyChanges(conversationId).subscribe({
      next: () => {
        this.applyingChanges.set(false);
        this.selectConversation(conversationId);
      },
      error: (err) => {
        this.applyingChanges.set(false);
        console.error('Failed to apply changes:', err);
      },
    });
  }

  // ── 图片上传 ────────────────────────────────

  protected handleImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        const mimeType = file.type as DesignImageInput['mimeType'];
        this.pendingImages.update((list) => [
          ...list,
          { base64, mimeType, previewUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  protected removePendingImage(index: number): void {
    this.pendingImages.update((list) => list.filter((_, i) => i !== index));
  }

  // ── 工具方法 ────────────────────────────────

  protected formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  protected renderMarkdown(text: string): string {
    if (!text?.trim()) return '';
    try {
      const rendered = marked.parse(text, { gfm: true, breaks: true, async: false });
      return typeof rendered === 'string' ? rendered : text;
    } catch {
      return text;
    }
  }

  private updateConversationInList(conv: DesignConversationDto): void {
    this.conversations.update((list) => {
      const index = list.findIndex((c) => c.id === conv.id);
      if (index >= 0) {
        const updated = [...list];
        updated[index] = conv;
        return updated;
      }
      return [conv, ...list];
    });
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const container = this.messagesContainer()?.nativeElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }
}
