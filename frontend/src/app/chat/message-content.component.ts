import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { MessageContentType } from '../core/services/conversation.service';

@Component({
  selector: 'app-message-content',
  standalone: true,
  template: `
    @if (resolvedContentType === 'markdown') {
      <div class="markdown-content" [innerHTML]="renderedHtml"></div>
    } @else {
      <div class="plain-text">{{ content }}</div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .plain-text {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .markdown-content {
      display: block;
      word-break: break-word;
      color: inherit;
    }

    .markdown-content :first-child {
      margin-top: 0;
    }

    .markdown-content :last-child {
      margin-bottom: 0;
    }

    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3 {
      margin: 0 0 0.5em;
      line-height: 1.35;
      font-weight: var(--font-weight-semibold);
    }

    .markdown-content h1 {
      font-size: 1.25em;
    }

    .markdown-content h2 {
      font-size: 1.15em;
    }

    .markdown-content h3 {
      font-size: 1.05em;
    }

    .markdown-content p,
    .markdown-content ul,
    .markdown-content ol,
    .markdown-content blockquote,
    .markdown-content pre {
      margin: 0 0 0.75em;
    }

    .markdown-content ul,
    .markdown-content ol {
      padding-left: 1.4em;
    }

    .markdown-content li + li {
      margin-top: 0.2em;
    }

    .markdown-content blockquote {
      padding-left: var(--space-3);
      border-left: 3px solid var(--color-border);
      color: var(--color-text-secondary);
    }

    .markdown-content pre {
      overflow-x: auto;
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-workbench-accent);
    }

    .markdown-content code {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.95em;
      padding: 0.12em 0.35em;
      border-radius: 6px;
      background: var(--color-workbench-accent);
    }

    .markdown-content pre code {
      display: block;
      padding: 0;
      background: transparent;
      white-space: pre;
    }

    .markdown-content img {
      max-width: 100%;
      height: auto;
      border-radius: var(--radius-md);
      margin: var(--space-2) 0;
      cursor: pointer;
    }

    .markdown-content a {
      color: var(--color-primary);
      text-decoration: underline;
      text-underline-offset: 0.12em;
    }

    .markdown-content strong {
      font-weight: var(--font-weight-semibold);
    }

    .markdown-content em {
      font-style: italic;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageContentComponent implements OnChanges {
  private static readonly MARKDOWN_OPTIONS = {
    async: false,
    breaks: true,
    gfm: true,
  } as const;
  private static readonly SANITIZE_OPTIONS = {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['audio', 'form', 'iframe', 'input', 'object', 'script', 'style', 'textarea', 'video'],
  };

  @Input() content = '';
  @Input() contentType?: MessageContentType;
  @Input() role = 'assistant';

  resolvedContentType: MessageContentType = 'text';
  renderedHtml = '';

  ngOnChanges() {
    this.resolvedContentType = this.contentType ?? (this.role === 'assistant' ? 'markdown' : 'text');
    if (this.resolvedContentType !== 'markdown') {
      this.renderedHtml = '';
      return;
    }

    const rendered = marked.parse(this.content ?? '', MessageContentComponent.MARKDOWN_OPTIONS);
    this.renderedHtml = DOMPurify.sanitize(
      typeof rendered === 'string' ? rendered : '',
      MessageContentComponent.SANITIZE_OPTIONS,
    );
  }
}
