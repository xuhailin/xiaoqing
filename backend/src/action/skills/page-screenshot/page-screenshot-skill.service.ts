import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import { BrowserTool } from '../../tools/browser/browser.tool';

interface PageScreenshotParams {
  url: string;
  /** 截指定 CSS selector 对应的元素（展开 overflow 后截图） */
  selector?: string;
  /** 无 selector 时生效，是否截整页，默认 true */
  fullPage?: boolean;
  viewport?: { width?: number; height?: number };
  /** 截图前等待此 selector 出现 */
  waitForSelector?: string;
  /** selector 模式下是否注入 CSS 展开溢出，默认 true */
  expandOverflow?: boolean;
  /** 自定义输出路径，不传则按时间戳落到 SCREENSHOT_DIR */
  outputPath?: string;
}

@Injectable()
export class PageScreenshotSkillService implements ICapability {
  private readonly logger = new Logger(PageScreenshotSkillService.name);
  private readonly screenshotDir: string;

  readonly name = 'page-screenshot';
  readonly taskIntent = 'page_screenshot';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '截取任意网页的完整长图，包括可滚动区域的全部内容，也支持只截页面中的某个区域';
  readonly surface = 'assistant' as const;
  readonly scope = 'public' as const;
  readonly portability = 'environment-bound' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = false;
  readonly visibility = 'default' as const;

  constructor(config: ConfigService) {
    const dir = config.get<string>('SCREENSHOT_DIR') ?? 'screenshots';
    this.screenshotDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const params = this.parseParams(request.params);
    if (!params) {
      return { success: false, content: null, error: 'page-screenshot params invalid: url is required' };
    }

    const browser = new BrowserTool({ timeoutMs: 30000 });

    try {
      await browser.launch();
      await browser.createContext();
      const page = await browser.newPage();

      await browser.goto(page, params.url, 'networkidle');

      if (params.waitForSelector) {
        await browser.waitFor(page, params.waitForSelector);
      }

      const savePath = params.outputPath ?? this.buildSavePath();
      await fs.mkdir(path.dirname(savePath), { recursive: true });

      if (params.selector) {
        const expandOverflow = params.expandOverflow !== false;

        if (expandOverflow && page.evaluate) {
          // 展开目标元素及 3 层父级的 overflow/height 约束，让 bounding box 撑开
          const script = `
            (function() {
              const el = document.querySelector(${JSON.stringify(params.selector)});
              if (!el) return;
              function expand(node) {
                node.style.overflow = 'visible';
                node.style.height = 'auto';
                node.style.maxHeight = 'none';
              }
              expand(el);
              let parent = el.parentElement;
              let depth = 0;
              while (parent && depth < 3) {
                const cs = window.getComputedStyle(parent);
                if (cs.overflow === 'hidden' || cs.overflow === 'scroll' || cs.overflow === 'auto') {
                  expand(parent);
                }
                parent = parent.parentElement;
                depth++;
              }
            })()
          `;
          await page.evaluate(script);
          // 等待浏览器完成重排
          await new Promise<void>((resolve) => setTimeout(resolve, 300));
        }

        const locator = page.locator(params.selector);
        if (locator.screenshot) {
          await locator.screenshot({ path: savePath });
        } else {
          // locator.screenshot 不可用时降级为全页截图
          this.logger.warn(`locator.screenshot not available, falling back to fullPage screenshot`);
          await browser.screenshot(page, savePath);
        }
      } else {
        // 无 selector：走全页截图（BrowserTool.screenshot 默认 fullPage: true）
        await browser.screenshot(page, savePath);
      }

      const stat = await fs.stat(savePath).catch(() => null);
      const fileSizeBytes = stat?.size ?? 0;

      this.logger.log(`Screenshot saved: ${savePath} (${(fileSizeBytes / 1024).toFixed(0)} KB)`);

      return {
        success: true,
        content: `截图已保存：${savePath}`,
        error: null,
        meta: {
          filePath: savePath,
          url: params.url,
          selector: params.selector ?? null,
          fileSizeBytes,
        },
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Screenshot failed: ${message}`);
      return { success: false, content: null, error: message };
    } finally {
      await browser.close();
    }
  }

  private buildSavePath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.screenshotDir, `screenshot-${timestamp}.png`);
  }

  private parseParams(params: Record<string, unknown>): PageScreenshotParams | null {
    const url = typeof params.url === 'string' ? params.url.trim() : '';
    if (!url) return null;

    const selector =
      typeof params.selector === 'string' ? params.selector.trim() || undefined : undefined;
    const waitForSelector =
      typeof params.waitForSelector === 'string'
        ? params.waitForSelector.trim() || undefined
        : undefined;
    const fullPage = typeof params.fullPage === 'boolean' ? params.fullPage : true;
    const expandOverflow =
      typeof params.expandOverflow === 'boolean' ? params.expandOverflow : true;
    const outputPath =
      typeof params.outputPath === 'string' ? params.outputPath.trim() || undefined : undefined;

    const vpRaw = params.viewport;
    const viewport =
      vpRaw && typeof vpRaw === 'object' && !Array.isArray(vpRaw)
        ? {
            width: typeof (vpRaw as Record<string, unknown>).width === 'number'
              ? (vpRaw as Record<string, unknown>).width as number
              : undefined,
            height: typeof (vpRaw as Record<string, unknown>).height === 'number'
              ? (vpRaw as Record<string, unknown>).height as number
              : undefined,
          }
        : undefined;

    return { url, selector, fullPage, viewport, waitForSelector, expandOverflow, outputPath };
  }
}
