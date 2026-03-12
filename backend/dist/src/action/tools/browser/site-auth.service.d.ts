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
    loginSuccessSelector: string;
    loginSuccessUrlPattern?: string | RegExp;
    loginEmailLabelSelector?: string;
    loginPasswordLabelSelector?: string;
    useStorageState?: boolean;
}
export declare class LoginFailedError extends Error {
    constructor(message: string, cause?: unknown);
}
export declare class SiteAuthService {
    private readonly browser;
    private readonly session;
    private readonly config;
    private page;
    constructor(browser: BrowserTool, session: BrowserSessionManager, config: SiteAuthConfig);
    getPage(): Promise<PageHandle>;
    ensureLoggedIn(): Promise<void>;
    isLoggedIn(): Promise<boolean>;
    private login;
    private waitForLoginSuccess;
    private fillWithLabelFallback;
}
