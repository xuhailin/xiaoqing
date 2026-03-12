import { ToolError } from '../core/tool-error';

type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';

export interface BrowserToolOptions {
  headless?: boolean;
  timeoutMs?: number;
}

export interface DownloadHandle {
  saveAs(path: string): Promise<void>;
}

export interface DialogHandle {
  message(): string;
  accept(): Promise<void>;
  dismiss(): Promise<void>;
}

export interface LocatorHandle {
  locator(selector: string): LocatorHandle;
  first(): LocatorHandle;
  count(): Promise<number>;
  click(): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  textContent(): Promise<string | null>;
  all?(): Promise<LocatorHandle[]>;
}

export interface PageHandle {
  goto(url: string, opts?: { waitUntil?: WaitUntil; timeout?: number }): Promise<void>;
  click(selector: string, opts?: { timeout?: number }): Promise<void>;
  fill(selector: string, value: string, opts?: { timeout?: number }): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>;
  waitForEvent(event: 'download', opts?: { timeout?: number }): Promise<DownloadHandle>;
  waitForEvent(event: 'popup', opts?: { timeout?: number }): Promise<PageHandle>;
  waitForURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void>;
  locator(selector: string): LocatorHandle;
  once?(event: 'dialog', handler: (dialog: DialogHandle) => void): void;
  screenshot?(opts?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
}

/** Playwright storageState JSON 格式 */
export interface StorageState {
  cookies: Array<Record<string, unknown>>;
  origins: Array<Record<string, unknown>>;
}

interface BrowserLike {
  newContext(opts?: { storageState?: StorageState }): Promise<ContextLike>;
  close(): Promise<void>;
}

interface ContextLike {
  newPage(): Promise<PageHandle>;
  storageState(): Promise<StorageState>;
  close(): Promise<void>;
}

interface PlaywrightLike {
  chromium: {
    launch(opts: { headless: boolean }): Promise<BrowserLike>;
  };
}

export class BrowserTool {
  private readonly headless: boolean;
  private readonly timeoutMs: number;
  private browser: BrowserLike | null = null;
  private context: ContextLike | null = null;

  constructor(opts: BrowserToolOptions = {}) {
    this.headless = opts.headless ?? process.env.LOCAL_ACTION_BROWSER_HEADLESS !== 'false';
    this.timeoutMs = opts.timeoutMs ?? (Number(process.env.LOCAL_ACTION_TIMEOUT_MS) || 10000);
  }

  /** 启动浏览器（如果已启动则跳过） */
  async launch(): Promise<void> {
    if (this.browser) return;
    try {
      const moduleName = 'playwright';
      const playwright = (await import(moduleName)) as unknown as PlaywrightLike;
      this.browser = await playwright.chromium.launch({ headless: this.headless });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', '无法启动浏览器（playwright 可能未安装）', e);
    }
  }

  /** 创建新 context（可选注入 storageState 以复用 session） */
  async createContext(storageState?: StorageState): Promise<void> {
    await this.launch();
    // 关闭旧 context
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    try {
      this.context = storageState
        ? await this.browser!.newContext({ storageState })
        : await this.browser!.newContext();
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', '无法创建浏览器上下文', e);
    }
  }

  /** 导出当前 context 的 storageState（cookies + localStorage） */
  async getStorageState(): Promise<StorageState> {
    if (!this.context) throw new ToolError('EXECUTION_ERROR', '无活跃的浏览器上下文');
    return this.context.storageState();
  }

  async newPage(): Promise<PageHandle> {
    await this.launch();
    if (!this.context) {
      await this.createContext();
    }
    try {
      return await this.context!.newPage();
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', '无法创建页面', e);
    }
  }

  async goto(page: PageHandle, url: string, waitUntil: WaitUntil = 'domcontentloaded'): Promise<void> {
    const target = this.normalizeUrl(url);
    try {
      await page.goto(target, { waitUntil, timeout: this.timeoutMs });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `打开页面失败: ${target}`, e);
    }
  }

  async click(page: PageHandle, selector: string): Promise<void> {
    const parsed = this.normalizeSelector(selector);
    try {
      await page.click(parsed, { timeout: this.timeoutMs });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `点击失败: ${parsed}`, e);
    }
  }

  async fill(page: PageHandle, selector: string, value: string): Promise<void> {
    const parsed = this.normalizeSelector(selector);
    try {
      await page.fill(parsed, String(value ?? ''), { timeout: this.timeoutMs });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `输入失败: ${parsed}`, e);
    }
  }

  async waitFor(page: PageHandle, selector: string): Promise<void> {
    const parsed = this.normalizeSelector(selector);
    try {
      await page.waitForSelector(parsed, { timeout: this.timeoutMs });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `等待元素失败: ${parsed}`, e);
    }
  }

  async waitForURL(page: PageHandle, url: string | RegExp): Promise<void> {
    try {
      await page.waitForURL(url, { timeout: this.timeoutMs });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `等待页面跳转失败: ${String(url)}`, e);
    }
  }

  async waitForDownload(page: PageHandle): Promise<DownloadHandle> {
    try {
      return await page.waitForEvent('download', { timeout: Math.max(this.timeoutMs, 30000) });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', '等待下载事件失败', e);
    }
  }

  async waitForPopup(page: PageHandle): Promise<PageHandle> {
    try {
      return await page.waitForEvent('popup', { timeout: this.timeoutMs });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', '等待弹窗页面失败', e);
    }
  }

  async screenshot(page: PageHandle, savePath: string): Promise<void> {
    if (!page.screenshot) {
      throw new ToolError('EXECUTION_ERROR', '当前 page 不支持截图');
    }
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.mkdir(path.dirname(savePath), { recursive: true });
      await page.screenshot({ path: savePath, fullPage: true });
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `截图失败: ${savePath}`, e);
    }
  }

  async saveDownload(download: DownloadHandle, savePath: string): Promise<void> {
    const target = String(savePath ?? '').trim();
    if (!target) {
      throw new ToolError('VALIDATION_ERROR', '保存路径不能为空');
    }
    try {
      await download.saveAs(target);
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `保存下载文件失败: ${target}`, e);
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    this.browser = null;
    this.context = null;
  }

  private normalizeUrl(value: string): string {
    const raw = String(value ?? '').trim();
    if (!raw) throw new ToolError('VALIDATION_ERROR', 'URL 不能为空');
    if (!/^https?:\/\//i.test(raw)) {
      throw new ToolError('VALIDATION_ERROR', `URL 仅支持 http/https: ${raw}`);
    }
    return raw;
  }

  private normalizeSelector(value: string): string {
    const selector = String(value ?? '').trim();
    if (!selector) throw new ToolError('VALIDATION_ERROR', 'selector 不能为空');
    return selector;
  }
}
