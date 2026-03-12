import * as path from 'node:path';
import { BrowserTool, type DownloadHandle, type LocatorHandle, type PageHandle } from '../../tools/browser/browser.tool';
import { BrowserSessionManager } from '../../tools/browser/browser-session.manager';
import { SiteAuthService } from '../../tools/browser/site-auth.service';
import { FileTool } from '../../tools/file/file.tool';
import { getResourceConfig, type ResourceConfig } from './book-download.config';
import { DownloadFailedError, SearchFailedError } from './book-download.errors';

export type BookItem = {
  title: string;
  author: string;
  publisher?: string;
  format: string;
  detailUrl: string;
};

/** 供 trace 使用的调试信息（列表/过滤数量） */
export type BookDownloadDebug = {
  listItemCount: number;
  searchResultCount: number;
  filteredCount: number;
};

export type BookDownloadHandleResult =
  | { ok: true; message: string; debug?: BookDownloadDebug }
  | { ok: false; message: string; choices?: { title: string; index: number }[]; debug?: BookDownloadDebug };

const MAX_SEARCH_ITEMS = 10;
const MAX_FILTERED = 10;
const ALLOWED_FORMATS = ['epub', 'mobi'] as const;
const MAX_ERROR_CHAIN_DEPTH = 5;

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'book';
}

function resolveBooksDownloadDir(): string {
  const baseDir = process.env.BOOKS_DOWNLOAD_DIR ?? 'assets/books';
  return path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
}

function getDownloadPath(bookName: string, format: string = 'epub'): string {
  const ext = ALLOWED_FORMATS.includes(format.toLowerCase() as (typeof ALLOWED_FORMATS)[number])
    ? format.toLowerCase()
    : 'epub';
  const fileName = `${sanitizeFileName(bookName)}.${ext}`;
  return path.join(resolveBooksDownloadDir(), fileName);
}

function normalizeBookTitle(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}

function filterBooks(list: BookItem[], requestedBookName: string): BookItem[] {
  const requestedNormalized = normalizeBookTitle(requestedBookName);
  if (!requestedNormalized) return [];
  const normalized = list
    .slice(0, MAX_FILTERED)
    .map((item) => ({
      ...item,
      titleNormalized: normalizeBookTitle(item.title),
      formatLower: item.format?.trim().toLowerCase() ?? '',
    }));
  const exactMatched = normalized.filter((x) => x.titleNormalized === requestedNormalized);
  const typed = exactMatched.filter((x) => ALLOWED_FORMATS.includes(x.formatLower as (typeof ALLOWED_FORMATS)[number]));
  const epub = typed.filter((x) => x.formatLower === 'epub');
  if (epub.length > 0) return epub.map(({ formatLower: _, titleNormalized: __, ...rest }) => rest);
  const mobi = typed.filter((x) => x.formatLower === 'mobi');
  return mobi.map(({ formatLower: _, titleNormalized: __, ...rest }) => rest);
}

function flattenErrorMessages(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current instanceof Error && depth < MAX_ERROR_CHAIN_DEPTH) {
    const msg = String(current.message ?? '').trim();
    if (msg && !messages.includes(msg)) messages.push(msg);
    current = (current as Error & { cause?: unknown }).cause;
    depth += 1;
  }
  if (messages.length === 0) return String(error ?? '未知错误');
  return messages.join(' <- ');
}

class BookDownloaderWorkflow {
  private page: PageHandle | null = null;

  constructor(
    private readonly browser: BrowserTool,
    private readonly file: FileTool,
    private readonly config: ResourceConfig,
    private readonly auth: SiteAuthService,
  ) {}

  private async ensurePage(): Promise<PageHandle> {
    if (this.page) return this.page;
    // 复用 auth service 管理的 page（登录后的 page 带有 session）
    this.page = await this.auth.getPage();
    return this.page;
  }

  async search(bookName: string): Promise<{ items: BookItem[]; listItemCount: number }> {
    const page = await this.ensurePage();
    const {
      baseUrl,
      searchInputSelector,
      searchButtonSelector,
      resultListSelector,
      resultItemSelector,
      resultItemTitleSelector,
      resultItemAuthorSelector,
      resultItemPublisherSelector,
      resultItemPublisherAttr,
      resultItemFormatSelector,
      resultItemFormatAttr,
      resultItemLinkSelector,
    } = this.config;
    if (!baseUrl) throw new SearchFailedError('未配置 RESOURCE_BASE_URL');

    try {
      await this.browser.goto(page, baseUrl);
      await this.browser.waitFor(page, searchInputSelector);
      await this.browser.fill(page, searchInputSelector, bookName);
      await this.browser.waitFor(page, searchButtonSelector);
      await this.browser.click(page, searchButtonSelector);
      await this.browser.waitFor(page, resultListSelector);

      const locator = page.locator(resultItemSelector);
      const itemHandles = (locator.all ? await locator.all() : []) as LocatorHandle[];
      const results: BookItem[] = [];

      for (let i = 0; i < Math.min(itemHandles.length, MAX_SEARCH_ITEMS); i++) {
        const el = itemHandles[i];
        const title = await this.safeText(el, resultItemTitleSelector);
        const author = await this.safeText(el, resultItemAuthorSelector);
        const publisher =
          resultItemPublisherAttr != null
            ? await this.safeAttr(el, resultItemPublisherSelector, resultItemPublisherAttr)
            : await this.safeText(el, resultItemPublisherSelector);
        const format =
          resultItemFormatAttr != null
            ? await this.safeAttr(el, resultItemFormatSelector, resultItemFormatAttr)
            : await this.safeText(el, resultItemFormatSelector);
        const detailUrl = await this.safeAttr(el, resultItemLinkSelector, 'href');
        if (title || detailUrl) {
          results.push({
            title,
            author,
            ...(publisher ? { publisher } : {}),
            format,
            detailUrl,
          });
        }
      }
      return { items: results, listItemCount: itemHandles.length };
    } catch (e) {
      throw new SearchFailedError(flattenErrorMessages(e), e);
    }
  }

  async download(book: BookItem, savePath: string): Promise<void> {
    const page = await this.ensurePage();
    const { detailPageDownloadSelector, detailPageSecondaryDownloadSelectors, baseUrl } = this.config;

    try {
      const detailUrl = book.detailUrl.startsWith('http')
        ? book.detailUrl
        : new URL(book.detailUrl, baseUrl).href;
      await this.browser.goto(page, detailUrl);
      await this.browser.waitFor(page, detailPageDownloadSelector);
      const download = await this.tryDownloadWithFallback(
        page,
        detailUrl,
        detailPageDownloadSelector,
        detailPageSecondaryDownloadSelectors,
      );
      await this.file.ensureDir(path.dirname(savePath));
      await this.browser.saveDownload(download, savePath);
    } catch (e) {
      throw new DownloadFailedError(flattenErrorMessages(e), e);
    }
  }

  async close(): Promise<void> {
    // 不关闭 browser，只清理 page 引用；browser 由调用方管理生命周期
    this.page = null;
  }

  private async safeText(el: LocatorHandle, selector: string): Promise<string> {
    try {
      const target = el.locator(selector).first();
      if ((await target.count()) === 0) return '';
      return (await target.textContent())?.trim() ?? '';
    } catch {
      return '';
    }
  }

  private async safeAttr(el: LocatorHandle, selector: string, attr: string): Promise<string> {
    try {
      const target = el.locator(selector).first();
      if ((await target.count()) === 0) return '';
      return (await target.getAttribute(attr)) ?? '';
    } catch {
      return '';
    }
  }

  private async clickAndWaitDownload(page: PageHandle, selector: string): Promise<DownloadHandle> {
    const downloadPromise = this.browser.waitForDownload(page);
    await this.browser.click(page, selector);
    return downloadPromise;
  }

  private async gotoAndWaitDownload(page: PageHandle, url: string): Promise<DownloadHandle> {
    const downloadPromise = this.browser.waitForDownload(page);
    await this.browser.goto(page, url);
    return downloadPromise;
  }

  private normalizeCandidateUrl(raw: string, baseUrl: string): string | null {
    const candidate = String(raw ?? '').trim();
    if (!candidate) return null;
    if (candidate.startsWith('javascript:') || candidate === '#' || candidate.startsWith('data:')) return null;
    try {
      return new URL(candidate, baseUrl).href;
    } catch {
      return null;
    }
  }

  private async collectHrefCandidates(
    page: PageHandle,
    selectors: string[],
    baseUrl: string,
  ): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const selector of selectors) {
      try {
        const href = await page.locator(selector).first().getAttribute('href');
        const normalized = this.normalizeCandidateUrl(href ?? '', baseUrl);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        urls.push(normalized);
      } catch {
        continue;
      }
    }
    return urls;
  }

  private async tryDownloadWithFallback(
    page: PageHandle,
    detailUrl: string,
    primarySelector: string,
    secondarySelectors: string[],
  ): Promise<DownloadHandle> {
    const errors: string[] = [];
    const selectorChain = this.normalizeSelectorCandidates(primarySelector, secondarySelectors);

    // 首次点击可能只是展开下载面板；再按候选 selector 逐一尝试真正下载动作。
    for (const selector of selectorChain) {
      try {
        await this.browser.waitFor(page, selector);
      } catch {
        continue;
      }

      try {
        return await this.clickAndWaitDownload(page, selector);
      } catch (e) {
        errors.push(`click(${selector}): ${flattenErrorMessages(e)}`);
      }
    }

    // 某些站点按钮并不直接触发 download 事件，而是跳转到下载 URL。
    const hrefCandidates = await this.collectHrefCandidates(page, selectorChain, detailUrl);
    for (const href of hrefCandidates) {
      try {
        return await this.gotoAndWaitDownload(page, href);
      } catch (e) {
        errors.push(`goto(${href}): ${flattenErrorMessages(e)}`);
      }
    }

    throw new DownloadFailedError(`未捕获下载事件；尝试轨迹：${errors.join(' | ') || '无可用下载控件'}`);
  }

  private normalizeSelectorCandidates(primarySelector: string, secondarySelectors: string[]): string[] {
    const splitSelectors = (value: string): string[] => value
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    const raw = [...splitSelectors(primarySelector), ...secondarySelectors.flatMap(splitSelectors)];
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const selector of raw) {
      if (seen.has(selector)) continue;
      seen.add(selector);
      normalized.push(selector);
    }
    return normalized;
  }
}

export interface WorkflowDeps {
  browser?: BrowserTool;
  file?: FileTool;
  config?: ResourceConfig;
  sessionManager?: BrowserSessionManager;
}

export async function executeBookDownloadWorkflow(
  bookName: string,
  deps?: WorkflowDeps,
  choiceIndex?: number,
): Promise<BookDownloadHandleResult> {
  const name = String(bookName ?? '').trim();
  if (!name) return { ok: false, message: '书名为空。' };

  const browser = deps?.browser ?? new BrowserTool();
  const file = deps?.file ?? new FileTool();
  const config = deps?.config ?? getResourceConfig();
  const sessionManager = deps?.sessionManager ?? new BrowserSessionManager(config.sessionDir);

  const auth = new SiteAuthService(browser, sessionManager, {
    siteKey: config.siteKey,
    baseUrl: config.baseUrl,
    email: config.email,
    password: config.password,
    loginSelector: config.loginSelector,
    loginEmailSelector: config.loginEmailSelector,
    loginPasswordSelector: config.loginPasswordSelector,
    loginSubmitSelector: config.loginSubmitSelector,
    loginSuccessSelector: config.loginSuccessSelector,
  });

  const workflow = new BookDownloaderWorkflow(browser, file, config, auth);

  try {
    // 优先复用 session，失效自动重新登录
    await auth.ensureLoggedIn();

    const { items: list, listItemCount } = await workflow.search(name);
    const filtered = filterBooks(list, name);
    const debug: BookDownloadDebug = {
      listItemCount,
      searchResultCount: list.length,
      filteredCount: filtered.length,
    };
    if (filtered.length === 0) {
      return { ok: false, message: '前10条中未找到“书名全匹配”的 epub/mobi 资源。', debug };
    }
    if (filtered.length === 1) {
      const savePath = getDownloadPath(name, filtered[0].format);
      await workflow.download(filtered[0], savePath);
      await workflow.close();
      return { ok: true, message: `已保存到：${savePath}`, debug };
    }
    // 用户已选择序号，直接下载
    if (choiceIndex != null) {
      if (choiceIndex < 0 || choiceIndex >= filtered.length) {
        await workflow.close();
        return { ok: false, message: `序号 ${choiceIndex} 超出范围（0-${filtered.length - 1}）。`, debug };
      }
      const target = filtered[choiceIndex];
      const savePath = getDownloadPath(name, target.format);
      await workflow.download(target, savePath);
      await workflow.close();
      return { ok: true, message: `已保存到：${savePath}`, debug };
    }
    // 多条匹配，返回候选列表供用户选择
    await workflow.close();
    return {
      ok: false,
      message: `找到 ${filtered.length} 条资源，请选择序号：`,
      choices: filtered.map((item, i) => ({ title: `${item.title} - ${item.author} [${item.format || 'unknown'}]`, index: i })),
      debug,
    };
  } catch (e) {
    await workflow.close();
    if (e instanceof LoginFailedError) return { ok: false, message: `登录失败：${e.message}` };
    if (e instanceof SearchFailedError) return { ok: false, message: `搜索失败：${e.message}` };
    if (e instanceof DownloadFailedError) return { ok: false, message: `下载失败：${e.message}` };
    return { ok: false, message: `发生错误：${e instanceof Error ? e.message : String(e)}` };
  }
}

// Re-export for backward compatibility in error handling
import { LoginFailedError } from '../../tools/browser/site-auth.service';
export { LoginFailedError };
