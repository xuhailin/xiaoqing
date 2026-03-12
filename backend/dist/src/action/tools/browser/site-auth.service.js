"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteAuthService = exports.LoginFailedError = void 0;
class LoginFailedError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'LoginFailedError';
        if (cause instanceof Error)
            this.cause = cause;
    }
}
exports.LoginFailedError = LoginFailedError;
class SiteAuthService {
    browser;
    session;
    config;
    page = null;
    constructor(browser, session, config) {
        this.browser = browser;
        this.session = session;
        this.config = config;
    }
    async getPage() {
        if (this.page)
            return this.page;
        this.page = await this.browser.newPage();
        return this.page;
    }
    async ensureLoggedIn() {
        const { email, password } = this.config;
        if (!email || !password)
            return;
        const useStorageState = this.config.useStorageState ?? true;
        if (useStorageState) {
            const saved = await this.session.load(this.config.siteKey);
            if (saved) {
                await this.browser.createContext(saved);
                this.page = null;
                if (await this.isLoggedIn()) {
                    return;
                }
                await this.session.clear(this.config.siteKey);
            }
        }
        await this.browser.createContext();
        this.page = null;
        await this.login();
        if (useStorageState) {
            const state = await this.browser.getStorageState();
            await this.session.save(this.config.siteKey, state);
        }
    }
    async isLoggedIn() {
        const { baseUrl } = this.config;
        if (!baseUrl)
            return false;
        try {
            const page = await this.getPage();
            await this.browser.goto(page, baseUrl);
            await this.waitForLoginSuccess(page);
            return true;
        }
        catch {
            return false;
        }
    }
    async login() {
        const { baseUrl, loginSelector, loginEmailSelector, loginPasswordSelector, loginSubmitSelector, loginEmailLabelSelector, loginPasswordLabelSelector, email, password, } = this.config;
        if (!baseUrl)
            throw new LoginFailedError('未配置 baseUrl');
        const page = await this.getPage();
        try {
            await this.browser.goto(page, baseUrl);
            await this.browser.waitFor(page, loginSelector);
            await this.browser.waitFor(page, loginEmailSelector);
            await this.fillWithLabelFallback(page, loginEmailSelector, email, loginEmailLabelSelector);
            await this.fillWithLabelFallback(page, loginPasswordSelector, password, loginPasswordLabelSelector);
            await this.browser.click(page, loginSubmitSelector);
            await this.waitForLoginSuccess(page);
        }
        catch (e) {
            throw new LoginFailedError('登录失败', e);
        }
    }
    async waitForLoginSuccess(page) {
        const { loginSuccessSelector, loginSuccessUrlPattern } = this.config;
        let urlErr = null;
        if (loginSuccessUrlPattern) {
            try {
                await this.browser.waitForURL(page, loginSuccessUrlPattern);
                return;
            }
            catch (e) {
                urlErr = e;
            }
        }
        if (loginSuccessSelector) {
            await this.browser.waitFor(page, loginSuccessSelector);
            return;
        }
        if (urlErr)
            throw urlErr;
        throw new Error('未配置登录成功判定条件');
    }
    async fillWithLabelFallback(page, inputSelector, value, labelSelector) {
        try {
            await this.browser.fill(page, inputSelector, value);
            return;
        }
        catch (firstErr) {
            if (!labelSelector)
                throw firstErr;
            await this.browser.click(page, labelSelector);
            await this.browser.fill(page, inputSelector, value);
        }
    }
}
exports.SiteAuthService = SiteAuthService;
//# sourceMappingURL=site-auth.service.js.map