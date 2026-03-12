import { BrowserTool, type PageHandle } from './browser.tool';
import { BrowserSessionManager } from './browser-session.manager';

export interface SiteAuthConfig {
  siteKey: string;
  baseUrl: string;
  email: string;
  password: string;
  loginSelector: string;
  loginEmailSelector: string;
  loginPasswordSelector: string;
  loginSubmitSelector: string;
  /** 登录成功后页面上应出现的元素，用于判断 session 是否有效 */
  loginSuccessSelector: string;
  /** 登录成功后 URL 规则（可选，和 loginSuccessSelector 二选一命中即可） */
  loginSuccessUrlPattern?: string | RegExp;
  /** 可选：账号输入框浮层标签（用于遮挡输入框时先点标签） */
  loginEmailLabelSelector?: string;
  /** 可选：密码输入框浮层标签（用于遮挡输入框时先点标签） */
  loginPasswordLabelSelector?: string;
  /** 是否复用并持久化 storageState，默认 true */
  useStorageState?: boolean;
}

export class LoginFailedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LoginFailedError';
    if (cause instanceof Error) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export class SiteAuthService {
  private readonly browser: BrowserTool;
  private readonly session: BrowserSessionManager;
  private readonly config: SiteAuthConfig;
  private page: PageHandle | null = null;

  constructor(browser: BrowserTool, session: BrowserSessionManager, config: SiteAuthConfig) {
    this.browser = browser;
    this.session = session;
    this.config = config;
  }

  /** 获取当前复用的 page（如果没有则创建） */
  async getPage(): Promise<PageHandle> {
    if (this.page) return this.page;
    this.page = await this.browser.newPage();
    return this.page;
  }

  /**
   * 确保已登录：优先恢复 session，失效则重新登录。
   * 调用方只需调用此方法，无需关心具体登录流程。
   */
  async ensureLoggedIn(): Promise<void> {
    const { email, password } = this.config;
    if (!email || !password) return; // 无凭证则跳过
    const useStorageState = this.config.useStorageState ?? true;

    if (useStorageState) {
      // 1. 尝试从磁盘恢复 storageState
      const saved = await this.session.load(this.config.siteKey);
      if (saved) {
        await this.browser.createContext(saved);
        this.page = null; // context 已换，旧 page 失效
        if (await this.isLoggedIn()) {
          return; // session 仍然有效
        }
        // session 失效，清理后走登录流程
        await this.session.clear(this.config.siteKey);
      }
    }

    // 2. 无有效 session，执行登录
    await this.browser.createContext();
    this.page = null;
    await this.login();

    // 3. 登录成功，保存 storageState
    if (useStorageState) {
      const state = await this.browser.getStorageState();
      await this.session.save(this.config.siteKey, state);
    }
  }

  /** 检查当前 session 是否有效：导航到首页并检测登录成功标识 */
  async isLoggedIn(): Promise<boolean> {
    const { baseUrl } = this.config;
    if (!baseUrl) return false;
    try {
      const page = await this.getPage();
      await this.browser.goto(page, baseUrl);
      await this.waitForLoginSuccess(page);
      return true;
    } catch {
      return false;
    }
  }

  /** 执行完整的登录流程（填表单 + 提交） */
  private async login(): Promise<void> {
    const {
      baseUrl,
      loginSelector,
      loginEmailSelector,
      loginPasswordSelector,
      loginSubmitSelector,
      loginEmailLabelSelector,
      loginPasswordLabelSelector,
      email,
      password,
    } = this.config;
    if (!baseUrl) throw new LoginFailedError('未配置 baseUrl');
    const page = await this.getPage();
    try {
      await this.browser.goto(page, baseUrl);
      await this.browser.waitFor(page, loginSelector);
      await this.browser.waitFor(page, loginEmailSelector);
      await this.fillWithLabelFallback(page, loginEmailSelector, email, loginEmailLabelSelector);
      await this.fillWithLabelFallback(page, loginPasswordSelector, password, loginPasswordLabelSelector);
      await this.browser.click(page, loginSubmitSelector);
      await this.waitForLoginSuccess(page);
    } catch (e) {
      throw new LoginFailedError('登录失败', e);
    }
  }

  private async waitForLoginSuccess(page: PageHandle): Promise<void> {
    const { loginSuccessSelector, loginSuccessUrlPattern } = this.config;
    let urlErr: unknown = null;

    if (loginSuccessUrlPattern) {
      try {
        await this.browser.waitForURL(page, loginSuccessUrlPattern);
        return;
      } catch (e) {
        urlErr = e;
      }
    }

    if (loginSuccessSelector) {
      await this.browser.waitFor(page, loginSuccessSelector);
      return;
    }

    if (urlErr) throw urlErr;
    throw new Error('未配置登录成功判定条件');
  }

  private async fillWithLabelFallback(
    page: PageHandle,
    inputSelector: string,
    value: string,
    labelSelector?: string,
  ): Promise<void> {
    try {
      await this.browser.fill(page, inputSelector, value);
      return;
    } catch (firstErr) {
      if (!labelSelector) throw firstErr;
      await this.browser.click(page, labelSelector);
      await this.browser.fill(page, inputSelector, value);
    }
  }
}
