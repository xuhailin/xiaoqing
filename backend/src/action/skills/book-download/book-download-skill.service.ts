import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import { executeBookDownloadWorkflow } from './book-download.executor';
import type { BookDownloadSkillExecuteParams, BookDownloadSkillResult } from './book-download-skill.types';

@Injectable()
export class BookDownloadSkillService implements ICapability {
  private readonly logger = new Logger(BookDownloadSkillService.name);
  private readonly baseUrl: string;

  // ── ICapability 元数据 ──────────────────────────────────
  readonly name = 'book-download';
  readonly taskIntent = 'book_download';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '下载电子书（用户说「下载xxx」「帮我找《xxx》」等）';
  readonly surface = 'assistant' as const;
  readonly scope = 'private' as const;
  readonly portability = 'config-bound' as const;
  readonly requiresAuth = true;
  readonly requiresUserContext = true;
  readonly visibility = 'optional' as const;

  constructor(config: ConfigService) {
    this.baseUrl = config.get('RESOURCE_BASE_URL') || '';
  }

  /** 是否已配置资源站（电子书下载能力可用） */
  isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  // ── ICapability.execute — 统一入口 ─────────────────────
  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const adapted = this.parseParams(request.params);
    if (!adapted) {
      return { success: false, content: null, error: 'book_download params invalid' };
    }
    const result = await this.executeBookDownload(adapted);
    return {
      success: result.success,
      content: result.content || null,
      error: result.error ?? null,
      meta: {
        ...(result.debug && { bookDownloadDebug: result.debug }),
        ...(result.choices && { bookChoices: result.choices }),
      },
    };
  }

  /**
   * 执行电子书下载：在 skill 内编排业务流程，底层复用 tools/browser 与 tools/file。
   */
  async executeBookDownload(params: BookDownloadSkillExecuteParams): Promise<BookDownloadSkillResult> {
    const bookName = params?.bookName?.trim();
    if (!bookName) {
      return { success: false, content: '', error: '书名为空' };
    }
    if (!this.baseUrl) {
      return { success: false, content: '', error: '未配置 RESOURCE_BASE_URL' };
    }

    try {
      const parsed = await executeBookDownloadWorkflow(bookName, undefined, params.choiceIndex);
      if (!parsed.ok) {
        this.logger.warn(`Book download workflow failed: ${parsed.message}`, {
          bookName,
          choiceIndex: params.choiceIndex ?? null,
          choicesCount: parsed.choices?.length ?? 0,
          debug: parsed.debug ?? null,
        });
      }
      const content = parsed.ok
        ? parsed.message ?? '已下载。'
        : [parsed.message, parsed.choices?.map((c) => `${c.index}: ${c.title}`).join('；')].filter(Boolean).join(' ');
      return {
        success: parsed.ok === true,
        content,
        error: parsed.ok ? undefined : (parsed.message ?? '下载未成功'),
        debug: parsed.debug,
        choices: parsed.ok ? undefined : parsed.choices,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Book download skill error: ${msg}`);
      return { success: false, content: '', error: msg };
    }
  }

  private parseParams(params: Record<string, unknown>): BookDownloadSkillExecuteParams | null {
    const bookName = typeof params.bookName === 'string' ? params.bookName.trim() : '';
    if (!bookName) return null;
    const choiceIndex = typeof params.bookChoiceIndex === 'number' ? params.bookChoiceIndex : undefined;
    return { bookName, ...(choiceIndex != null && { choiceIndex }) };
  }
}
