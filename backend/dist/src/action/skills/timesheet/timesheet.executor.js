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
exports.executeTimesheetWorkflow = executeTimesheetWorkflow;
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs/promises"));
const browser_tool_1 = require("../../tools/browser/browser.tool");
const browser_session_manager_1 = require("../../tools/browser/browser-session.manager");
const site_auth_service_1 = require("../../tools/browser/site-auth.service");
const timesheet_config_1 = require("./timesheet.config");
const git_log_reader_1 = require("./git-log.reader");
const timesheet_errors_1 = require("./timesheet.errors");
const MAX_ERROR_CHAIN_DEPTH = 5;
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
class TimesheetWorkflow {
    browser;
    config;
    auth;
    page = null;
    formPage = null;
    constructor(browser, config, auth) {
        this.browser = browser;
        this.config = config;
        this.auth = auth;
    }
    async ensurePage() {
        if (this.page)
            return this.page;
        this.page = await this.auth.getPage();
        return this.page;
    }
    async navigateToTimesheetForm(targetDate) {
        const page = await this.ensurePage();
        try {
            await this.waitForPostLoginLandingReady(page, 10000);
            const existing = await this.tryOpenExistingRequestForDate(page, targetDate);
            if (existing)
                return { formPage: existing, skipDateSelection: true };
            await this.tryRevealPortalAndClickFlow(page);
            const opened1 = await this.tryOpenTimesheetEntry(page, 5000);
            if (opened1)
                return { formPage: opened1, skipDateSelection: false };
            await this.browser.goto(page, this.config.workflowEntryUrl);
            const opened2 = await this.tryOpenTimesheetEntry(page, 5000);
            if (opened2)
                return { formPage: opened2, skipDateSelection: false };
            const currentUrl = this.readPageUrl(page) ?? 'unknown';
            throw new Error(`未找到工时流程入口，当前页面 URL: ${currentUrl}`);
        }
        catch (e) {
            throw new timesheet_errors_1.TimesheetNavigationError(`导航到工时录入表单失败: ${flattenErrorMessages(e)}`, e);
        }
    }
    async waitForPostLoginLandingReady(page, timeoutMs) {
        await this.waitForAnySelectorCount(page, [
            '.e9header-top-menu',
            '.e9header-top-menu-name[title="门户"]',
            'a[data-requestid]',
            '.wf-title-wrap',
            'a[title="产研医工时录入流程(Redmine Sync)"]',
        ], timeoutMs).catch(() => false);
        await new Promise((resolve) => setTimeout(resolve, 800));
    }
    async tryOpenExistingRequestForDate(page, targetDate) {
        const dateVariants = this.buildDateVariants(targetDate);
        const allLinks = page.locator('a[data-requestid][title*="产研医工时录入流程"][title*="工时填报日期:"]');
        if ((await allLinks.count()) === 0)
            return null;
        const linkElements = allLinks.all ? await allLinks.all() : [];
        if (linkElements.length === 0)
            return null;
        for (const link of linkElements) {
            try {
                const title = (await link.getAttribute('title')) ?? '';
                const dateMatch = title.match(/工时填报日期:([^\s,;，；)）\]】]+)/);
                if (!dateMatch)
                    continue;
                const titleDate = dateMatch[1].trim();
                if (!dateVariants.includes(titleDate))
                    continue;
                await link.click();
                await this.waitForTimesheetDetailPage(page, Math.max(this.config.timeoutMs, 30000));
                await this.waitForProjectTimesheetSectionReady(page, 30000);
                this.formPage = page;
                return this.formPage;
            }
            catch {
            }
        }
        return null;
    }
    buildDateVariants(targetDate) {
        const trimmed = String(targetDate ?? '').trim();
        if (!trimmed)
            return [];
        return this.buildNormalizedDateVariants(trimmed);
    }
    buildNormalizedDateVariants(dateInput) {
        const trimmed = String(dateInput ?? '').trim();
        if (!trimmed)
            return [];
        const unique = new Set([trimmed]);
        const pushVariants = (y, m, d) => {
            if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
                return;
            if (m <= 0 || m > 12 || d <= 0 || d > 31)
                return;
            const mm = String(m).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            unique.add(`${y}-${m}-${d}`);
            unique.add(`${y}-${mm}-${dd}`);
            unique.add(`${y}-${mm}-${d}`);
            unique.add(`${y}-${m}-${dd}`);
        };
        const parts = trimmed.split('-');
        if (parts.length === 3) {
            pushVariants(Number(parts[0]), Number(parts[1]), Number(parts[2]));
        }
        else {
            const dateObj = new Date(trimmed);
            if (!Number.isNaN(dateObj.getTime())) {
                pushVariants(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
            }
        }
        return Array.from(unique);
    }
    flowEntrySelectors() {
        return [
            'a[title="产研医工时录入流程(Redmine Sync)"]',
            'a[title*="工时录入流程"]:not([title*="工时填报日期:"])',
            'a:not([data-requestid]):has-text("产研医工时录入流程(Redmine Sync)")',
        ];
    }
    async tryOpenTimesheetEntry(page, timeoutMs) {
        for (const selector of this.flowEntrySelectors()) {
            try {
                await page.waitForSelector(selector, { timeout: timeoutMs });
                const popupPromise = page.waitForEvent('popup', { timeout: 1200 }).catch(() => null);
                await page.click(selector, { timeout: timeoutMs });
                const popup = await popupPromise;
                if (popup) {
                    this.formPage = popup;
                    return this.formPage;
                }
                await this.waitForTimesheetDetailPage(page, Math.max(this.config.timeoutMs, 30000));
                this.formPage = page;
                return this.formPage;
            }
            catch {
            }
        }
        return null;
    }
    async tryRevealPortalAndClickFlow(page) {
        const portalSelectors = [
            '.e9header-top-menu',
            '.e9header-top-menu-name[title="门户"]',
            'text=门户',
        ];
        for (const selector of portalSelectors) {
            try {
                const p = page;
                if (typeof p.hover === 'function') {
                    await p.hover(selector, { timeout: 2000 });
                }
                else {
                    await page.click(selector, { timeout: 2000 });
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
                break;
            }
            catch {
            }
        }
        const flowSelectors = [
            'text=流程',
            '.e9header-top-menu-card:has-text("流程")',
            '.ant-menu-submenu-title:has-text("流程")',
            '.header-menu-item:has-text("流程")',
        ];
        for (const selector of flowSelectors) {
            try {
                await page.click(selector, { timeout: 2000 });
                await new Promise((resolve) => setTimeout(resolve, 500));
                return;
            }
            catch {
            }
        }
    }
    async selectDateAndSubmit(formPage, targetDate) {
        try {
            await this.openDatePicker(formPage);
            const dateTitles = this.buildNormalizedDateVariants(targetDate);
            const dateCellCandidates = dateTitles.map((title) => `td[title="${title}"]`);
            const dateCellSelector = await this.waitForFirstExistingSelector(formPage, dateCellCandidates, this.config.timeoutMs);
            if (!dateCellSelector) {
                throw new Error(`未找到目标日期单元格，尝试 title: ${dateTitles.join(', ')}`);
            }
            await formPage.click(dateCellSelector, { timeout: this.config.timeoutMs });
            await new Promise((resolve) => setTimeout(resolve, 1000));
            let dialogHandled = null;
            let dialogAppeared = false;
            let dialogMessage = '';
            if (formPage.once) {
                formPage.once('dialog', (dialog) => {
                    dialogAppeared = true;
                    dialogMessage = String(dialog.message?.() ?? '').trim();
                    dialogHandled = dialog.accept().catch(() => { });
                });
            }
            const popupPromise = formPage.waitForEvent('popup', { timeout: 1200 }).catch(() => null);
            await this.clickAny(formPage, [
                'button[title="提交"]',
                'button.ant-btn.ant-btn-primary[title="提交"]',
                'button:has(.wf-req-top-button)',
                'button:has-text("提 交")',
                'button:has-text("提交")',
            ], this.config.timeoutMs);
            const popupPage = await popupPromise;
            const activePage = popupPage ?? formPage;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (dialogHandled) {
                await dialogHandled;
            }
            try {
                await this.waitForTimesheetDetailPage(activePage, 30000);
                await this.waitForProjectTimesheetSectionReady(activePage, 30000);
                this.formPage = activePage;
                return activePage;
            }
            catch (e) {
                const popupInfo = dialogAppeared
                    ? `检测到弹窗提示：${dialogMessage || '（未读取到文案）'}`
                    : '未检测到弹窗提示';
                throw new Error(`点击日期并提交后 30 秒仍未进入可录入状态；${popupInfo}；${flattenErrorMessages(e)}`);
            }
        }
        catch (e) {
            throw new timesheet_errors_1.TimesheetNavigationError(`日期选择或表单跳转失败: ${flattenErrorMessages(e)}`, e);
        }
    }
    async openDatePicker(formPage) {
        await this.clickAny(formPage, [
            '[title="工时填报日期"] .picker-icon',
            '[title="工时填报日期"] .ant-calendar-picker-icon',
            '[title="工时填报日期"] .ant-calendar-picker-input',
            '[title*="工时填报日期"] .picker-icon',
            '[title*="工时填报日期"] .ant-calendar-picker-icon',
            '[title*="工时填报日期"] .ant-calendar-picker-input',
            '[title*="工时填报日期"] input',
            '.picker-icon',
            '.ant-calendar-picker-icon',
            '.ant-calendar-picker-input',
        ], this.config.timeoutMs);
    }
    async clickAny(page, selectors, timeoutMs) {
        let lastErr = null;
        for (const selector of selectors) {
            try {
                await page.click(selector, { timeout: timeoutMs });
                return;
            }
            catch (e) {
                lastErr = e;
            }
        }
        if (lastErr)
            throw lastErr;
        throw new Error('未提供可点击选择器');
    }
    async waitForTimesheetDetailPage(formPage, timeoutOverrideMs) {
        const timeoutMs = Math.max(timeoutOverrideMs ?? this.config.timeoutMs, 30000);
        const preUrl = this.readPageUrl(formPage);
        const pageAny = formPage;
        if (typeof pageAny.waitForURL === 'function') {
            try {
                await pageAny.waitForURL((urlObj) => {
                    const next = String(urlObj?.toString?.() ?? '');
                    if (!next)
                        return false;
                    if (next.includes('/spa/workflow/static4form/index.html'))
                        return true;
                    return Boolean(preUrl && next !== preUrl);
                }, { timeout: timeoutMs });
            }
            catch {
            }
        }
        await this.ensureFormTabActive(formPage);
        const ready = await this.waitForAnySelectorCount(formPage, [
            '#addbutton0',
            '[id^="addbutton"]',
            '[title="添加"]',
            '.ant-select-selection',
            'input[id*="19767"]',
            'textarea[id*="19759"]',
            '.wf-req-top-button',
        ], timeoutMs);
        if (!ready) {
            const currentUrl = this.readPageUrl(formPage) ?? 'unknown';
            throw new Error(`工时表单未就绪（未检测到可交互控件），当前 URL: ${currentUrl}`);
        }
    }
    async waitForProjectTimesheetSectionReady(formPage, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const hasTitle = (await formPage.locator('text=项目类工时').count()) > 0;
            const hasTable = (await this.safeCount(formPage, '#oTable0:visible')) > 0;
            const hasAddButton = (await this.safeCount(formPage, '#oTable0 #addbutton0:visible, #oTable0 i[id^="addbutton"]:visible, #oTable0 i[title="添加"]:visible')) > 0;
            if (hasTitle && hasTable && hasAddButton)
                return;
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
        throw new Error(`等待“项目类工时”区域就绪超时（${Math.ceil(timeoutMs / 1000)} 秒）`);
    }
    async ensureFormTabActive(formPage) {
        try {
            await this.clickAny(formPage, [
                'text=流程表单',
                '.ant-tabs-tab:has-text("流程表单")',
                '.wea-tab-title:has-text("流程表单")',
            ], 1500);
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
        catch {
        }
    }
    async waitForAnySelectorCount(page, selectors, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            for (const selector of selectors) {
                try {
                    const count = await page.locator(selector).count();
                    if (count > 0)
                        return true;
                }
                catch {
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return false;
    }
    async fillProjectRows(formPage, projects) {
        await this.waitForProjectTimesheetSectionReady(formPage, 30000);
        for (let i = 0; i < projects.length; i++) {
            const proj = projects[i];
            try {
                await this.ensureProjectRowReady(formPage, i);
                const workContent = proj.commits.join('；');
                await this.searchAndSelectProject(formPage, i, 'rdProject', proj.mapping.rdProjectCode);
                await this.searchAndSelectProject(formPage, i, 'customerProject', proj.mapping.customerProjectCode);
                await this.fillCellByColumnName(formPage, i, '工作内容', workContent);
                await this.fillCellByColumnName(formPage, i, '工时', String(proj.hours));
            }
            catch (e) {
                throw new timesheet_errors_1.TimesheetFormFillError(`填写第 ${i + 1} 行（${proj.mapping.displayName}）失败: ${flattenErrorMessages(e)}`, e);
            }
        }
    }
    async fillCellByColumnName(formPage, rowIndex, columnName, value) {
        try {
            await this.ensureProjectRowReady(formPage, rowIndex);
            const columnIndex = this.getProjectDetailColumnIndex(columnName);
            if (columnIndex === null) {
                throw new Error(`不支持填写列 "${columnName}"`);
            }
            const rowSelector = this.projectRowSelector(rowIndex);
            const cellSelector = `${rowSelector} td.detail_1_3_${columnIndex}`;
            const inputSelector = await this.findFirstExistingSelector(formPage, [
                `${cellSelector} textarea`,
                `${cellSelector} input[type="text"]`,
                `${cellSelector} input.wf-input-detail`,
                `${cellSelector} input`,
            ]);
            if (!inputSelector) {
                throw new Error(`未找到列 "${columnName}" 对应的输入框（行 ${rowIndex}，列 ${columnIndex}）`);
            }
            await formPage.click(inputSelector, { timeout: this.config.timeoutMs });
            await formPage.fill(inputSelector, value, { timeout: this.config.timeoutMs });
            return;
        }
        catch (e) {
            if (e instanceof timesheet_errors_1.TimesheetFormFillError)
                throw e;
            throw new timesheet_errors_1.TimesheetFormFillError(`填写单元格 [行${rowIndex}, ${columnName}] 失败: ${flattenErrorMessages(e)}`, e);
        }
    }
    async searchAndSelectProject(formPage, rowIndex, type, projectCode) {
        try {
            await this.ensureProjectRowReady(formPage, rowIndex);
            const columnIndex = type === 'rdProject' ? 5 : 8;
            const rowSelector = this.projectRowSelector(rowIndex);
            const cellSelector = `${rowSelector} td.detail_1_3_${columnIndex}`;
            const fieldId = this.getProjectHiddenFieldId(type, rowIndex);
            await this.openProjectLookupModal(formPage, cellSelector, rowIndex, type);
            await this.fillAndPickProjectInLookupModal(formPage, projectCode);
            const selected = await this.waitForInputValue(formPage, `#${fieldId}`, 5000);
            if (!selected) {
                throw new Error(`项目编码未被系统选中（行 ${rowIndex}，${type}，字段 ${fieldId} 仍为空）`);
            }
        }
        catch (e) {
            if (e instanceof timesheet_errors_1.TimesheetFormFillError)
                throw e;
            throw new timesheet_errors_1.TimesheetFormFillError(`搜索并选择项目失败 [行${rowIndex}, ${type}, 编码${projectCode}]: ${flattenErrorMessages(e)}`, e);
        }
    }
    async openProjectLookupModal(formPage, cellSelector, rowIndex, type) {
        const openButtonSelector = await this.waitForFirstExistingSelector(formPage, [
            `${cellSelector} button.ant-btn-icon-only:visible`,
            `${cellSelector} button.ant-btn-icon-only`,
        ], 5000);
        if (!openButtonSelector) {
            throw new Error(`行 ${rowIndex} 的 ${type} 未找到搜索按钮`);
        }
        await formPage.click(openButtonSelector, { timeout: this.config.timeoutMs });
        const modalSelector = await this.waitForFirstExistingSelector(formPage, ['.ant-modal:visible', '.ant-modal-wrap:visible .ant-modal'], 5000);
        if (!modalSelector) {
            throw new Error(`行 ${rowIndex} 的 ${type} 点击搜索后未出现弹窗`);
        }
    }
    async fillAndPickProjectInLookupModal(formPage, projectCode) {
        await this.clickAny(formPage, [
            '.ant-modal .wea-advanced-search',
            '.ant-modal button:has-text("高级搜索")',
        ], this.config.timeoutMs);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const modalInputSelector = await this.waitForFirstExistingSelector(formPage, [
            '.ant-modal input#con13043_value:visible',
            '.ant-modal input[id^="con"][id$="_value"]:visible',
            '.ant-modal .wea-advanced-searchsAd input.ant-input:visible',
        ], 5000);
        if (!modalInputSelector) {
            throw new Error('项目选择弹窗中未找到可输入项目编号的输入框（已展开高级搜索）');
        }
        await formPage.click(modalInputSelector, { timeout: this.config.timeoutMs });
        await formPage.fill(modalInputSelector, projectCode, { timeout: this.config.timeoutMs });
        await new Promise((resolve) => setTimeout(resolve, 300));
        await this.clickAny(formPage, [
            '.ant-modal button.ant-btn-primary:has-text("搜 索")',
            '.ant-modal button.ant-btn-primary:has-text("搜索")',
        ], this.config.timeoutMs);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const rowSelector = await this.waitForFirstExistingSelector(formPage, [
            `.ant-modal tr.ant-table-row:has(td[stsdata="${projectCode}"])`,
            `.ant-modal tr.ant-table-row:has-text("${projectCode}")`,
            '.ant-modal tr.ant-table-row',
        ], 5000);
        if (!rowSelector) {
            throw new Error(`弹窗未检索到项目编码 ${projectCode} 的结果行`);
        }
        await this.singleClickRow(formPage, rowSelector);
        const modalClosed = await this.waitForSelectorsGone(formPage, ['.ant-modal:visible'], 5000);
        if (!modalClosed) {
            throw new Error('单击项目行后弹窗未关闭');
        }
    }
    async singleClickRow(formPage, rowSelector) {
        await formPage.click(rowSelector, { timeout: this.config.timeoutMs });
    }
    async waitForSelectorsGone(page, selectors, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            let anyVisible = false;
            for (const selector of selectors) {
                if ((await this.safeCount(page, selector)) > 0) {
                    anyVisible = true;
                    break;
                }
            }
            if (!anyVisible)
                return true;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return false;
    }
    async ensureProjectRowReady(formPage, rowIndex) {
        const requiredRows = rowIndex + 1;
        const maxAttempts = Math.max(requiredRows + 2, 8);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const rowCount = await this.countProjectRows(formPage);
            const targetRowCount = await formPage.locator(this.projectRowSelector(rowIndex)).count();
            if (rowCount >= requiredRows && targetRowCount > 0)
                return;
            if (rowCount < requiredRows) {
                await this.tryClickAddRowButton(formPage);
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const currentRows = await this.countProjectRows(formPage);
        throw new Error(`未能创建工时明细行：需要至少 ${requiredRows} 行，当前 ${currentRows} 行`);
    }
    projectRowSelector(rowIndex) {
        return `#oTable0 tr.detail_data_row[data-rowindex="${rowIndex}"]:visible`;
    }
    async countProjectRows(formPage) {
        return formPage.locator('#oTable0 tr.detail_data_row:visible').count();
    }
    getProjectDetailColumnIndex(columnName) {
        if (columnName === '工作内容')
            return 2;
        if (columnName === '工时')
            return 3;
        return null;
    }
    async findFirstExistingSelector(page, selectors) {
        for (const selector of selectors) {
            try {
                if ((await page.locator(selector).count()) > 0)
                    return selector;
            }
            catch {
            }
        }
        return null;
    }
    async waitForFirstExistingSelector(page, selectors, timeoutMs) {
        const ready = await this.waitForAnySelectorCount(page, selectors, timeoutMs);
        if (!ready)
            return null;
        return this.findFirstExistingSelector(page, selectors);
    }
    async safeCount(page, selector) {
        try {
            return await page.locator(selector).count();
        }
        catch {
            return 0;
        }
    }
    getProjectHiddenFieldId(type, rowIndex) {
        const fieldPrefix = type === 'rdProject' ? 'field19760' : 'field19762';
        return `${fieldPrefix}_${rowIndex}`;
    }
    async waitForInputValue(page, selector, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const input = page.locator(selector).first();
                if ((await input.count()) > 0) {
                    const value = ((await input.getAttribute('value')) ?? '').trim();
                    if (value)
                        return true;
                }
            }
            catch {
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return false;
    }
    async tryClickAddRowButton(formPage) {
        const pageAny = formPage;
        if (typeof pageAny.evaluate === 'function') {
            const clicked = await pageAny.evaluate(() => {
                const root = document.querySelector('#oTable0');
                if (!root)
                    return false;
                const candidates = Array.from(root.querySelectorAll('i#addbutton0, i[id^="addbutton"], i[title="添加"], i.detailBtn'));
                for (const el of candidates) {
                    const style = window.getComputedStyle(el);
                    const visible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
                    if (!visible)
                        continue;
                    el.scrollIntoView({ block: 'center', inline: 'center' });
                    el.click();
                    return true;
                }
                return false;
            });
            if (clicked)
                return;
        }
        throw new Error('未找到 #oTable0 内可点击的添加按钮');
    }
    async submit(formPage) {
        try {
            let dialogAppeared = false;
            let dialogMessage = '';
            let dialogHandledPromise = null;
            if (formPage.once) {
                formPage.once('dialog', (dialog) => {
                    dialogAppeared = true;
                    dialogMessage = String(dialog.message?.() ?? '').trim();
                    dialogHandledPromise = dialog.accept().catch(() => { });
                });
            }
            const preSubmitUrl = this.readPageUrl(formPage);
            await this.browser.click(formPage, 'button:has-text("提 交")');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (dialogHandledPromise) {
                await dialogHandledPromise;
            }
            if (dialogAppeared) {
                const progressed = await this.waitForPostSubmitProgress(formPage, preSubmitUrl);
                if (!progressed) {
                    const timeoutSec = Math.ceil(Math.max(this.config.timeoutMs, 8000) / 1000);
                    const popupText = dialogMessage || '（未获取到弹窗文案）';
                    throw new timesheet_errors_1.TimesheetSubmitError(`提交时出现全局弹窗：「${popupText}」，已自动点击“确定”，但在 ${timeoutSec} 秒内未检测到页面进入下一步。请先处理该弹窗提示后重试。`);
                }
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        catch (e) {
            throw new timesheet_errors_1.TimesheetSubmitError(`提交工时表单失败: ${flattenErrorMessages(e)}`, e);
        }
    }
    readPageUrl(page) {
        const p = page;
        if (typeof p.url !== 'function')
            return null;
        try {
            const value = p.url();
            return typeof value === 'string' ? value : null;
        }
        catch {
            return null;
        }
    }
    async waitForPostSubmitProgress(formPage, preSubmitUrl) {
        const timeoutMs = Math.max(this.config.timeoutMs, 8000);
        const pageAny = formPage;
        if (typeof pageAny.waitForURL === 'function') {
            try {
                await pageAny.waitForURL((urlObj) => {
                    const next = String(urlObj?.toString?.() ?? '');
                    if (!next)
                        return false;
                    if (preSubmitUrl && next !== preSubmitUrl)
                        return true;
                    return !next.includes('/spa/workflow/static4form/index.html');
                }, { timeout: timeoutMs });
                return true;
            }
            catch {
            }
        }
        if (typeof pageAny.url === 'function') {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const next = this.readPageUrl(formPage);
                if (next) {
                    if (preSubmitUrl && next !== preSubmitUrl)
                        return true;
                    if (!next.includes('/spa/workflow/static4form/index.html'))
                        return true;
                }
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
        }
        return false;
    }
    async screenshotOnError(stepName) {
        const pages = [
            { key: 'form', page: this.formPage },
            { key: 'main', page: this.page },
        ];
        const validPages = pages.filter((p) => Boolean(p.page?.screenshot));
        if (validPages.length === 0)
            return null;
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const dir = path.isAbsolute(this.config.screenshotDir)
                ? this.config.screenshotDir
                : path.join(process.cwd(), this.config.screenshotDir);
            await fs.mkdir(dir, { recursive: true });
            const saved = [];
            for (const item of validPages) {
                const savePath = path.join(dir, `${stepName}_${item.key}_${timestamp}.png`);
                await item.page.screenshot({ path: savePath, fullPage: true });
                saved.push(savePath);
            }
            return saved.join(', ');
        }
        catch {
            return null;
        }
    }
    async close() {
        this.page = null;
        this.formPage = null;
    }
}
async function executeTimesheetWorkflow(targetDate, deps) {
    const date = String(targetDate ?? '').trim();
    if (!date)
        return { ok: false, message: '目标日期为空。' };
    const config = deps?.config ?? (0, timesheet_config_1.getTimesheetConfig)();
    if (!config.loginId || !config.password) {
        return { ok: false, message: '未配置 TIMESHEET_LOGIN_ID 或 TIMESHEET_PASSWORD。' };
    }
    let mappings;
    if (deps?.mappings?.length) {
        mappings = deps.mappings;
    }
    else {
        try {
            mappings = (0, timesheet_config_1.loadProjectMappings)(config.projectsConfigPath);
        }
        catch (e) {
            return { ok: false, message: `加载项目映射失败: ${e instanceof Error ? e.message : String(e)}` };
        }
    }
    if (mappings.length === 0) {
        return { ok: false, message: '项目映射配置为空，请检查 TIMESHEET_PROJECTS_CONFIG 指向的配置文件。' };
    }
    const projectsWithCommits = [];
    if (deps?.overrides?.length) {
        for (const ov of deps.overrides) {
            const mapping = mappings.find((m) => m.displayName === ov.displayName);
            if (!mapping)
                continue;
            projectsWithCommits.push({
                mapping,
                commits: ov.content ? [ov.content] : [],
                hours: ov.hours,
            });
        }
    }
    else {
        for (const mapping of mappings) {
            try {
                const logEntry = (0, git_log_reader_1.readGitLogForDate)(mapping.repoPath, date, config.gitAuthor || undefined);
                if (logEntry.commits.length > 0) {
                    projectsWithCommits.push({ mapping, commits: logEntry.commits, hours: 0 });
                }
            }
            catch (e) {
                console.warn(`[Timesheet] 读取 ${mapping.displayName} git log 失败:`, e);
            }
        }
    }
    if (projectsWithCommits.length === 0) {
        return { ok: false, message: `${date} 没有任何配置项目的 git 提交记录，无需录入工时。` };
    }
    let cappedProjects;
    if (!deps?.overrides?.length) {
        const hoursList = (0, git_log_reader_1.distributeHours)(projectsWithCommits.length);
        for (let i = 0; i < projectsWithCommits.length && i < hoursList.length; i++) {
            projectsWithCommits[i].hours = hoursList[i];
        }
        cappedProjects = projectsWithCommits.slice(0, hoursList.length);
    }
    else {
        cappedProjects = projectsWithCommits;
    }
    const browser = deps?.browser ?? new browser_tool_1.BrowserTool({
        headless: config.headless,
        timeoutMs: config.timeoutMs,
    });
    const sessionManager = deps?.sessionManager ?? new browser_session_manager_1.BrowserSessionManager(config.sessionDir);
    const auth = new site_auth_service_1.SiteAuthService(browser, sessionManager, {
        siteKey: config.siteKey,
        baseUrl: config.oaBaseUrl,
        email: config.loginId,
        password: config.password,
        loginSelector: '#loginid',
        loginEmailSelector: '#loginid',
        loginEmailLabelSelector: '.e9login-form-item:has(#loginid) .e9login-form-label',
        loginPasswordSelector: '#userpassword',
        loginPasswordLabelSelector: '.e9login-form-item:has(#userpassword) .e9login-form-label',
        loginSubmitSelector: 'button:has-text("登 录")',
        loginSuccessSelector: 'a[title="产研医工时录入流程(Redmine Sync)"]',
        loginSuccessUrlPattern: /\/wui\/index\.html#\/main(?:\/|$)/i,
        useStorageState: false,
    });
    const workflow = new TimesheetWorkflow(browser, config, auth);
    try {
        await auth.ensureLoggedIn();
        const nav = await workflow.navigateToTimesheetForm(date);
        let formPage = nav.formPage;
        const { skipDateSelection } = nav;
        if (!skipDateSelection) {
            formPage = await workflow.selectDateAndSubmit(formPage, date);
        }
        await workflow.fillProjectRows(formPage, cappedProjects);
        await workflow.submit(formPage);
        await workflow.close();
        const submittedProjects = cappedProjects.map((p) => ({
            rdProjectCode: p.mapping.rdProjectCode,
            customerProjectCode: p.mapping.customerProjectCode,
            displayName: p.mapping.displayName,
            hours: p.hours,
            contentPreview: p.commits.slice(0, 3).join('；'),
        }));
        const totalHours = cappedProjects.reduce((sum, p) => sum + p.hours, 0);
        const projectNames = cappedProjects.map((p) => `${p.mapping.displayName}(${p.hours}h)`).join('、');
        return {
            ok: true,
            message: `${date} 工时已提交：${projectNames}，共 ${totalHours} 小时。`,
            submittedProjects,
            totalHours,
        };
    }
    catch (e) {
        const stepName = e instanceof timesheet_errors_1.TimesheetLoginError
            ? 'login'
            : e instanceof timesheet_errors_1.TimesheetNavigationError
                ? 'navigation'
                : e instanceof timesheet_errors_1.TimesheetFormFillError
                    ? 'form-fill'
                    : e instanceof timesheet_errors_1.TimesheetSubmitError
                        ? 'submit'
                        : 'unknown';
        const screenshotPath = await workflow.screenshotOnError(stepName);
        await workflow.close();
        const errorMsg = flattenErrorMessages(e);
        const screenshotHint = screenshotPath ? `（截图已保存: ${screenshotPath}）` : '';
        if (e instanceof timesheet_errors_1.TimesheetLoginError)
            return { ok: false, message: `登录 OA 失败：${errorMsg}${screenshotHint}` };
        if (e instanceof timesheet_errors_1.TimesheetNavigationError)
            return { ok: false, message: `导航到工时表单失败：${errorMsg}${screenshotHint}` };
        if (e instanceof timesheet_errors_1.TimesheetFormFillError)
            return { ok: false, message: `填写工时表单失败：${errorMsg}${screenshotHint}` };
        if (e instanceof timesheet_errors_1.TimesheetSubmitError)
            return { ok: false, message: `提交工时失败：${errorMsg}${screenshotHint}` };
        return { ok: false, message: `工时上报发生错误：${errorMsg}${screenshotHint}` };
    }
}
//# sourceMappingURL=timesheet.executor.js.map