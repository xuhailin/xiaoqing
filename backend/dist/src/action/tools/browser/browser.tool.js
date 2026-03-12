"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserTool = void 0;
const tool_error_1 = require("../core/tool-error");
class BrowserTool {
    headless;
    timeoutMs;
    browser = null;
    context = null;
    constructor(opts = {}) {
        this.headless = opts.headless ?? process.env.LOCAL_ACTION_BROWSER_HEADLESS !== 'false';
        this.timeoutMs = opts.timeoutMs ?? (Number(process.env.LOCAL_ACTION_TIMEOUT_MS) || 10000);
    }
    async launch() {
        if (this.browser)
            return;
        try {
            const moduleName = 'playwright';
            const playwright = (await import(moduleName));
            this.browser = await playwright.chromium.launch({ headless: this.headless });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', '无法启动浏览器（playwright 可能未安装）', e);
        }
    }
    async createContext(storageState) {
        await this.launch();
        if (this.context) {
            await this.context.close().catch(() => { });
            this.context = null;
        }
        try {
            this.context = storageState
                ? await this.browser.newContext({ storageState })
                : await this.browser.newContext();
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', '无法创建浏览器上下文', e);
        }
    }
    async getStorageState() {
        if (!this.context)
            throw new tool_error_1.ToolError('EXECUTION_ERROR', '无活跃的浏览器上下文');
        return this.context.storageState();
    }
    async newPage() {
        await this.launch();
        if (!this.context) {
            await this.createContext();
        }
        try {
            return await this.context.newPage();
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', '无法创建页面', e);
        }
    }
    async goto(page, url, waitUntil = 'domcontentloaded') {
        const target = this.normalizeUrl(url);
        try {
            await page.goto(target, { waitUntil, timeout: this.timeoutMs });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `打开页面失败: ${target}`, e);
        }
    }
    async click(page, selector) {
        const parsed = this.normalizeSelector(selector);
        try {
            await page.click(parsed, { timeout: this.timeoutMs });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `点击失败: ${parsed}`, e);
        }
    }
    async fill(page, selector, value) {
        const parsed = this.normalizeSelector(selector);
        try {
            await page.fill(parsed, String(value ?? ''), { timeout: this.timeoutMs });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `输入失败: ${parsed}`, e);
        }
    }
    async waitFor(page, selector) {
        const parsed = this.normalizeSelector(selector);
        try {
            await page.waitForSelector(parsed, { timeout: this.timeoutMs });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `等待元素失败: ${parsed}`, e);
        }
    }
    async waitForURL(page, url) {
        try {
            await page.waitForURL(url, { timeout: this.timeoutMs });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `等待页面跳转失败: ${String(url)}`, e);
        }
    }
    async waitForDownload(page) {
        try {
            return await page.waitForEvent('download', { timeout: Math.max(this.timeoutMs, 30000) });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', '等待下载事件失败', e);
        }
    }
    async waitForPopup(page) {
        try {
            return await page.waitForEvent('popup', { timeout: this.timeoutMs });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', '等待弹窗页面失败', e);
        }
    }
    async screenshot(page, savePath) {
        if (!page.screenshot) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', '当前 page 不支持截图');
        }
        try {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            await fs.mkdir(path.dirname(savePath), { recursive: true });
            await page.screenshot({ path: savePath, fullPage: true });
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `截图失败: ${savePath}`, e);
        }
    }
    async saveDownload(download, savePath) {
        const target = String(savePath ?? '').trim();
        if (!target) {
            throw new tool_error_1.ToolError('VALIDATION_ERROR', '保存路径不能为空');
        }
        try {
            await download.saveAs(target);
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `保存下载文件失败: ${target}`, e);
        }
    }
    async close() {
        if (this.context) {
            await this.context.close().catch(() => { });
        }
        if (this.browser) {
            await this.browser.close().catch(() => { });
        }
        this.browser = null;
        this.context = null;
    }
    normalizeUrl(value) {
        const raw = String(value ?? '').trim();
        if (!raw)
            throw new tool_error_1.ToolError('VALIDATION_ERROR', 'URL 不能为空');
        if (!/^https?:\/\//i.test(raw)) {
            throw new tool_error_1.ToolError('VALIDATION_ERROR', `URL 仅支持 http/https: ${raw}`);
        }
        return raw;
    }
    normalizeSelector(value) {
        const selector = String(value ?? '').trim();
        if (!selector)
            throw new tool_error_1.ToolError('VALIDATION_ERROR', 'selector 不能为空');
        return selector;
    }
}
exports.BrowserTool = BrowserTool;
//# sourceMappingURL=browser.tool.js.map