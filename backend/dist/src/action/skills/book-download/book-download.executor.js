"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginFailedError = void 0;
exports.executeBookDownloadWorkflow = executeBookDownloadWorkflow;
const path = __importStar(require("node:path"));
const browser_tool_1 = require("../../tools/browser/browser.tool");
const browser_session_manager_1 = require("../../tools/browser/browser-session.manager");
const site_auth_service_1 = require("../../tools/browser/site-auth.service");
const file_tool_1 = require("../../tools/file/file.tool");
const book_download_config_1 = require("./book-download.config");
const book_download_errors_1 = require("./book-download.errors");
const MAX_SEARCH_ITEMS = 10;
const MAX_FILTERED = 10;
const ALLOWED_FORMATS = ['epub', 'mobi'];
const MAX_ERROR_CHAIN_DEPTH = 5;
function sanitizeFileName(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'book';
}
function resolveBooksDownloadDir() {
    const baseDir = process.env.BOOKS_DOWNLOAD_DIR ?? 'assets/books';
    return path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
}
function getDownloadPath(bookName, format = 'epub') {
    const ext = ALLOWED_FORMATS.includes(format.toLowerCase())
        ? format.toLowerCase()
        : 'epub';
    const fileName = `${sanitizeFileName(bookName)}.${ext}`;
    return path.join(resolveBooksDownloadDir(), fileName);
}
function normalizeBookTitle(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, '')
        .trim();
}
function filterBooks(list, requestedBookName) {
    const requestedNormalized = normalizeBookTitle(requestedBookName);
    if (!requestedNormalized)
        return [];
    const normalized = list
        .slice(0, MAX_FILTERED)
        .map((item) => ({
        ...item,
        titleNormalized: normalizeBookTitle(item.title),
        formatLower: item.format?.trim().toLowerCase() ?? '',
    }));
    const exactMatched = normalized.filter((x) => x.titleNormalized === requestedNormalized);
    const typed = exactMatched.filter((x) => ALLOWED_FORMATS.includes(x.formatLower));
    const epub = typed.filter((x) => x.formatLower === 'epub');
    if (epub.length > 0)
        return epub.map(({ formatLower: _, titleNormalized: __, ...rest }) => rest);
    const mobi = typed.filter((x) => x.formatLower === 'mobi');
    return mobi.map(({ formatLower: _, titleNormalized: __, ...rest }) => rest);
}
function flattenErrorMessages(error) {
    const messages = [];
    let current = error;
    let depth = 0;
    while (current instanceof Error && depth < MAX_ERROR_CHAIN_DEPTH) {
        const msg = String(current.message ?? '').trim();
        if (msg && !messages.includes(msg))
            messages.push(msg);
        current = current.cause;
        depth += 1;
    }
    if (messages.length === 0)
        return String(error ?? '未知错误');
    return messages.join(' <- ');
}
class BookDownloaderWorkflow {
    browser;
    file;
    config;
    auth;
    page = null;
    constructor(browser, file, config, auth) {
        this.browser = browser;
        this.file = file;
        this.config = config;
        this.auth = auth;
    }
    async ensurePage() {
        if (this.page)
            return this.page;
        this.page = await this.auth.getPage();
        return this.page;
    }
    async search(bookName) {
        const page = await this.ensurePage();
        const { baseUrl, searchInputSelector, searchButtonSelector, resultListSelector, resultItemSelector, resultItemTitleSelector, resultItemAuthorSelector, resultItemPublisherSelector, resultItemPublisherAttr, resultItemFormatSelector, resultItemFormatAttr, resultItemLinkSelector, } = this.config;
        if (!baseUrl)
            throw new book_download_errors_1.SearchFailedError('未配置 RESOURCE_BASE_URL');
        try {
            await this.browser.goto(page, baseUrl);
            await this.browser.waitFor(page, searchInputSelector);
            await this.browser.fill(page, searchInputSelector, bookName);
            await this.browser.waitFor(page, searchButtonSelector);
            await this.browser.click(page, searchButtonSelector);
            await this.browser.waitFor(page, resultListSelector);
            const locator = page.locator(resultItemSelector);
            const itemHandles = (locator.all ? await locator.all() : []);
            const results = [];
            for (let i = 0; i < Math.min(itemHandles.length, MAX_SEARCH_ITEMS); i++) {
                const el = itemHandles[i];
                const title = await this.safeText(el, resultItemTitleSelector);
                const author = await this.safeText(el, resultItemAuthorSelector);
                const publisher = resultItemPublisherAttr != null
                    ? await this.safeAttr(el, resultItemPublisherSelector, resultItemPublisherAttr)
                    : await this.safeText(el, resultItemPublisherSelector);
                const format = resultItemFormatAttr != null
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
        }
        catch (e) {
            throw new book_download_errors_1.SearchFailedError(flattenErrorMessages(e), e);
        }
    }
    async download(book, savePath) {
        const page = await this.ensurePage();
        const { detailPageDownloadSelector, detailPageSecondaryDownloadSelectors, baseUrl } = this.config;
        try {
            const detailUrl = book.detailUrl.startsWith('http')
                ? book.detailUrl
                : new URL(book.detailUrl, baseUrl).href;
            await this.browser.goto(page, detailUrl);
            await this.browser.waitFor(page, detailPageDownloadSelector);
            const download = await this.tryDownloadWithFallback(page, detailUrl, detailPageDownloadSelector, detailPageSecondaryDownloadSelectors);
            await this.file.ensureDir(path.dirname(savePath));
            await this.browser.saveDownload(download, savePath);
        }
        catch (e) {
            throw new book_download_errors_1.DownloadFailedError(flattenErrorMessages(e), e);
        }
    }
    async close() {
        this.page = null;
    }
    async safeText(el, selector) {
        try {
            const target = el.locator(selector).first();
            if ((await target.count()) === 0)
                return '';
            return (await target.textContent())?.trim() ?? '';
        }
        catch {
            return '';
        }
    }
    async safeAttr(el, selector, attr) {
        try {
            const target = el.locator(selector).first();
            if ((await target.count()) === 0)
                return '';
            return (await target.getAttribute(attr)) ?? '';
        }
        catch {
            return '';
        }
    }
    async clickAndWaitDownload(page, selector) {
        const downloadPromise = this.browser.waitForDownload(page);
        await this.browser.click(page, selector);
        return downloadPromise;
    }
    async gotoAndWaitDownload(page, url) {
        const downloadPromise = this.browser.waitForDownload(page);
        await this.browser.goto(page, url);
        return downloadPromise;
    }
    normalizeCandidateUrl(raw, baseUrl) {
        const candidate = String(raw ?? '').trim();
        if (!candidate)
            return null;
        if (candidate.startsWith('javascript:') || candidate === '#' || candidate.startsWith('data:'))
            return null;
        try {
            return new URL(candidate, baseUrl).href;
        }
        catch {
            return null;
        }
    }
    async collectHrefCandidates(page, selectors, baseUrl) {
        const urls = [];
        const seen = new Set();
        for (const selector of selectors) {
            try {
                const href = await page.locator(selector).first().getAttribute('href');
                const normalized = this.normalizeCandidateUrl(href ?? '', baseUrl);
                if (!normalized || seen.has(normalized))
                    continue;
                seen.add(normalized);
                urls.push(normalized);
            }
            catch {
                continue;
            }
        }
        return urls;
    }
    async tryDownloadWithFallback(page, detailUrl, primarySelector, secondarySelectors) {
        const errors = [];
        const selectorChain = this.normalizeSelectorCandidates(primarySelector, secondarySelectors);
        for (const selector of selectorChain) {
            try {
                await this.browser.waitFor(page, selector);
            }
            catch {
                continue;
            }
            try {
                return await this.clickAndWaitDownload(page, selector);
            }
            catch (e) {
                errors.push(`click(${selector}): ${flattenErrorMessages(e)}`);
            }
        }
        const hrefCandidates = await this.collectHrefCandidates(page, selectorChain, detailUrl);
        for (const href of hrefCandidates) {
            try {
                return await this.gotoAndWaitDownload(page, href);
            }
            catch (e) {
                errors.push(`goto(${href}): ${flattenErrorMessages(e)}`);
            }
        }
        throw new book_download_errors_1.DownloadFailedError(`未捕获下载事件；尝试轨迹：${errors.join(' | ') || '无可用下载控件'}`);
    }
    normalizeSelectorCandidates(primarySelector, secondarySelectors) {
        const splitSelectors = (value) => value
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x.length > 0);
        const raw = [...splitSelectors(primarySelector), ...secondarySelectors.flatMap(splitSelectors)];
        const seen = new Set();
        const normalized = [];
        for (const selector of raw) {
            if (seen.has(selector))
                continue;
            seen.add(selector);
            normalized.push(selector);
        }
        return normalized;
    }
}
async function executeBookDownloadWorkflow(bookName, deps, choiceIndex) {
    const name = String(bookName ?? '').trim();
    if (!name)
        return { ok: false, message: '书名为空。' };
    const browser = deps?.browser ?? new browser_tool_1.BrowserTool();
    const file = deps?.file ?? new file_tool_1.FileTool();
    const config = deps?.config ?? (0, book_download_config_1.getResourceConfig)();
    const sessionManager = deps?.sessionManager ?? new browser_session_manager_1.BrowserSessionManager(config.sessionDir);
    const auth = new site_auth_service_1.SiteAuthService(browser, sessionManager, {
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
        await auth.ensureLoggedIn();
        const { items: list, listItemCount } = await workflow.search(name);
        const filtered = filterBooks(list, name);
        const debug = {
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
        await workflow.close();
        return {
            ok: false,
            message: `找到 ${filtered.length} 条资源，请选择序号：`,
            choices: filtered.map((item, i) => ({ title: `${item.title} - ${item.author} [${item.format || 'unknown'}]`, index: i })),
            debug,
        };
    }
    catch (e) {
        await workflow.close();
        if (e instanceof site_auth_service_2.LoginFailedError)
            return { ok: false, message: `登录失败：${e.message}` };
        if (e instanceof book_download_errors_1.SearchFailedError)
            return { ok: false, message: `搜索失败：${e.message}` };
        if (e instanceof book_download_errors_1.DownloadFailedError)
            return { ok: false, message: `下载失败：${e.message}` };
        return { ok: false, message: `发生错误：${e instanceof Error ? e.message : String(e)}` };
    }
}
const site_auth_service_2 = require("../../tools/browser/site-auth.service");
Object.defineProperty(exports, "LoginFailedError", { enumerable: true, get: function () { return site_auth_service_2.LoginFailedError; } });
//# sourceMappingURL=book-download.executor.js.map