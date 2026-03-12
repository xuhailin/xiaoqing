import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { BrowserTool, type PageHandle } from '../../tools/browser/browser.tool';
import { BrowserSessionManager } from '../../tools/browser/browser-session.manager';
import { SiteAuthService } from '../../tools/browser/site-auth.service';
import { getTimesheetConfig, loadProjectMappings, type TimesheetConfig, type TimesheetProjectMapping } from './timesheet.config';
import { readGitLogForDate, distributeHours, type GitLogEntry } from './git-log.reader';
import {
  TimesheetLoginError,
  TimesheetNavigationError,
  TimesheetFormFillError,
  TimesheetSubmitError,
} from './timesheet.errors';
import type { TimesheetSubmittedProject } from './timesheet-skill.types';

export interface TimesheetWorkflowResult {
  ok: boolean;
  message: string;
  submittedProjects?: TimesheetSubmittedProject[];
  totalHours?: number;
}

export interface TimesheetOverrideInput {
  displayName: string;
  content?: string;
  hours: number;
}

export interface TimesheetWorkflowDeps {
  browser?: BrowserTool;
  config?: TimesheetConfig;
  sessionManager?: BrowserSessionManager;
  /** 用户确认后的覆盖数据，跳过 git log 读取 */
  overrides?: TimesheetOverrideInput[];
  /** 外部传入的项目映射（配合 overrides 使用） */
  mappings?: TimesheetProjectMapping[];
}

interface ProjectWithCommits {
  mapping: TimesheetProjectMapping;
  commits: string[];
  hours: number;
}

const MAX_ERROR_CHAIN_DEPTH = 5;

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

class TimesheetWorkflow {
  private page: PageHandle | null = null;
  private formPage: PageHandle | null = null;

  constructor(
    private readonly browser: BrowserTool,
    private readonly config: TimesheetConfig,
    private readonly auth: SiteAuthService,
  ) {}

  /** 获取登录后的主页面 */
  private async ensurePage(): Promise<PageHandle> {
    if (this.page) return this.page;
    this.page = await this.auth.getPage();
    return this.page;
  }

  /** 步骤1：导航到工时录入表单（弹窗页面） */
  async navigateToTimesheetForm(targetDate: string): Promise<{ formPage: PageHandle; skipDateSelection: boolean }> {
    const page = await this.ensurePage();
    try {
      // 登录后先等待页面骨架稳定，再判断是否存在当日已提单据
      await this.waitForPostLoginLandingReady(page, 10000);

      // 0) 先查“目标日期”的已存在流程单；命中则直接进入单据页，跳过选日期
      const existing = await this.tryOpenExistingRequestForDate(page, targetDate);
      if (existing) return { formPage: existing, skipDateSelection: true };

      // 1) 登录后按页面导航进入“流程”，避免强依赖 goto
      await this.tryRevealPortalAndClickFlow(page);
      const opened1 = await this.tryOpenTimesheetEntry(page, 5000);
      if (opened1) return { formPage: opened1, skipDateSelection: false };

      // 2) 兜底：若页面导航失效，再使用配置 URL（仍保留作为最后后手）
      await this.browser.goto(page, this.config.workflowEntryUrl);
      const opened2 = await this.tryOpenTimesheetEntry(page, 5000);
      if (opened2) return { formPage: opened2, skipDateSelection: false };

      const currentUrl = this.readPageUrl(page) ?? 'unknown';
      throw new Error(`未找到工时流程入口，当前页面 URL: ${currentUrl}`);
    } catch (e) {
      throw new TimesheetNavigationError(`导航到工时录入表单失败: ${flattenErrorMessages(e)}`, e);
    }
  }

  private async waitForPostLoginLandingReady(page: PageHandle, timeoutMs: number): Promise<void> {
    await this.waitForAnySelectorCount(page, [
      '.e9header-top-menu',
      '.e9header-top-menu-name[title="门户"]',
      'a[data-requestid]',
      '.wf-title-wrap',
      'a[title="产研医工时录入流程(Redmine Sync)"]',
    ], timeoutMs).catch(() => false);
    // 额外给 SPA 一点渲染缓冲，避免“刚登录即查询”漏数据
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  private async tryOpenExistingRequestForDate(page: PageHandle, targetDate: string): Promise<PageHandle | null> {
    const dateVariants = this.buildDateVariants(targetDate);

    // 先用宽泛选择器找到所有工时录入流程链接
    const allLinks = page.locator('a[data-requestid][title*="产研医工时录入流程"][title*="工时填报日期:"]');
    if ((await allLinks.count()) === 0) return null;
    const linkElements = allLinks.all ? await allLinks.all() : [];
    if (linkElements.length === 0) return null;

    // 逐个检查 title 中的日期是否精确匹配（避免 CSS *=子串误匹配）
    for (const link of linkElements) {
      try {
        const title = (await link.getAttribute('title')) ?? '';
        // 从 title 中提取"工时填报日期:"后面的日期部分
        const dateMatch = title.match(/工时填报日期:([^\s,;，；)）\]】]+)/);
        if (!dateMatch) continue;
        const titleDate = dateMatch[1].trim();
        // 精确匹配：title 中的日期必须完全等于某个变体
        if (!dateVariants.includes(titleDate)) continue;

        await link.click();
        await this.waitForTimesheetDetailPage(page, Math.max(this.config.timeoutMs, 30000));
        await this.waitForProjectTimesheetSectionReady(page, 30000);
        this.formPage = page;
        return this.formPage;
      } catch {
        // 继续尝试其他候选
      }
    }
    return null;
  }

  private buildDateVariants(targetDate: string): string[] {
    const trimmed = String(targetDate ?? '').trim();
    if (!trimmed) return [];
    return this.buildNormalizedDateVariants(trimmed);
  }

  private buildNormalizedDateVariants(dateInput: string): string[] {
    const trimmed = String(dateInput ?? '').trim();
    if (!trimmed) return [];

    const unique = new Set<string>([trimmed]);
    const pushVariants = (y: number, m: number, d: number): void => {
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return;
      if (m <= 0 || m > 12 || d <= 0 || d > 31) return;
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
    } else {
      const dateObj = new Date(trimmed);
      if (!Number.isNaN(dateObj.getTime())) {
        pushVariants(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
      }
    }

    return Array.from(unique);
  }

  private flowEntrySelectors(): string[] {
    // 注意：必须排除待办列表中的已有单据链接（其 title 包含"工时填报日期:"后缀）
    // 只匹配"新建流程"入口，其 title 精确为 "产研医工时录入流程(Redmine Sync)"
    return [
      'a[title="产研医工时录入流程(Redmine Sync)"]',
      'a[title*="工时录入流程"]:not([title*="工时填报日期:"])',
      'a:not([data-requestid]):has-text("产研医工时录入流程(Redmine Sync)")',
    ];
  }

  private async tryOpenTimesheetEntry(page: PageHandle, timeoutMs: number): Promise<PageHandle | null> {
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
        // 有些入口是同页 SPA 跳转，不会弹窗
        await this.waitForTimesheetDetailPage(page, Math.max(this.config.timeoutMs, 30000));
        this.formPage = page;
        return this.formPage;
      } catch {
        // 尝试下一个候选选择器
      }
    }
    return null;
  }

  private async tryRevealPortalAndClickFlow(page: PageHandle): Promise<void> {
    const portalSelectors = [
      '.e9header-top-menu',
      '.e9header-top-menu-name[title="门户"]',
      'text=门户',
    ];
    for (const selector of portalSelectors) {
      try {
        const p = page as unknown as { hover?: (s: string, opts?: { timeout?: number }) => Promise<void> };
        if (typeof p.hover === 'function') {
          await p.hover(selector, { timeout: 2000 });
        } else {
          await page.click(selector, { timeout: 2000 });
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        break;
      } catch {
        // 尝试下一个“门户”选择器
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
      } catch {
        // 尝试下一个候选选择器
      }
    }
  }

  /** 步骤2：选择日期并提交进入表单 */
  async selectDateAndSubmit(formPage: PageHandle, targetDate: string): Promise<PageHandle> {
    try {
      await this.openDatePicker(formPage);

      // 按日期单元格 title 点击，兼容 2026-3-11 / 2026-03-11 等格式
      const dateTitles = this.buildNormalizedDateVariants(targetDate);
      const dateCellCandidates = dateTitles.map((title) => `td[title="${title}"]`);
      const dateCellSelector = await this.waitForFirstExistingSelector(
        formPage,
        dateCellCandidates,
        this.config.timeoutMs,
      );
      if (!dateCellSelector) {
        throw new Error(`未找到目标日期单元格，尝试 title: ${dateTitles.join(', ')}`);
      }
      await formPage.click(dateCellSelector, { timeout: this.config.timeoutMs });

      // 等待 1s，给页面联动字段填充时间
      await new Promise((resolve) => setTimeout(resolve, 1000));

      let dialogHandled: Promise<void> | null = null;
      let dialogAppeared = false;
      let dialogMessage = '';
      if (formPage.once) {
        formPage.once('dialog', (dialog) => {
          dialogAppeared = true;
          dialogMessage = String(dialog.message?.() ?? '').trim();
          dialogHandled = dialog.accept().catch(() => {});
        });
      }

      // 点击“提交”进入下一步，并处理可能的 alert 弹窗
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

      // 进入下一步最多等待 20s。若失败，必须回传弹窗信息（或明确无弹窗）
      try {
        await this.waitForTimesheetDetailPage(activePage, 30000);
        await this.waitForProjectTimesheetSectionReady(activePage, 30000);
        this.formPage = activePage;
        return activePage;
      } catch (e) {
        const popupInfo = dialogAppeared
          ? `检测到弹窗提示：${dialogMessage || '（未读取到文案）'}`
          : '未检测到弹窗提示';
        throw new Error(`点击日期并提交后 30 秒仍未进入可录入状态；${popupInfo}；${flattenErrorMessages(e)}`);
      }
    } catch (e) {
      throw new TimesheetNavigationError(`日期选择或表单跳转失败: ${flattenErrorMessages(e)}`, e);
    }
  }

  private async openDatePicker(formPage: PageHandle): Promise<void> {
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

  private async clickAny(page: PageHandle, selectors: string[], timeoutMs: number): Promise<void> {
    let lastErr: unknown = null;
    for (const selector of selectors) {
      try {
        await page.click(selector, { timeout: timeoutMs });
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error('未提供可点击选择器');
  }

  private async waitForTimesheetDetailPage(formPage: PageHandle, timeoutOverrideMs?: number): Promise<void> {
    const timeoutMs = Math.max(timeoutOverrideMs ?? this.config.timeoutMs, 30000);
    const preUrl = this.readPageUrl(formPage);

    const pageAny = formPage as unknown as {
      waitForURL?: (url: string | RegExp | ((url: { toString(): string }) => boolean), opts?: { timeout?: number }) => Promise<void>;
    };

    if (typeof pageAny.waitForURL === 'function') {
      try {
        await pageAny.waitForURL((urlObj: { toString(): string }) => {
          const next = String(urlObj?.toString?.() ?? '');
          if (!next) return false;
          if (next.includes('/spa/workflow/static4form/index.html')) return true;
          return Boolean(preUrl && next !== preUrl);
        }, { timeout: timeoutMs });
      } catch {
        // 回退到 DOM 可见性判断
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

  /**
   * 等待“项目类工时”明细区真正可操作。
   * 场景：命中既有单据或日期提交后，页面常有 10-30 秒异步渲染。
   */
  private async waitForProjectTimesheetSectionReady(formPage: PageHandle, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hasTitle = (await formPage.locator('text=项目类工时').count()) > 0;
      const hasTable = (await this.safeCount(formPage, '#oTable0:visible')) > 0;
      const hasAddButton = (await this.safeCount(
        formPage,
        '#oTable0 #addbutton0:visible, #oTable0 i[id^="addbutton"]:visible, #oTable0 i[title="添加"]:visible',
      )) > 0;
      if (hasTitle && hasTable && hasAddButton) return;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error(`等待“项目类工时”区域就绪超时（${Math.ceil(timeoutMs / 1000)} 秒）`);
  }

  private async ensureFormTabActive(formPage: PageHandle): Promise<void> {
    try {
      await this.clickAny(formPage, [
        'text=流程表单',
        '.ant-tabs-tab:has-text("流程表单")',
        '.wea-tab-title:has-text("流程表单")',
      ], 1500);
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch {
      // 某些页面默认已在流程表单，忽略
    }
  }

  private async waitForAnySelectorCount(
    page: PageHandle,
    selectors: string[],
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        try {
          const count = await page.locator(selector).count();
          if (count > 0) return true;
        } catch {
          // ignore and continue
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  /** 步骤4：填写项目行 */
  async fillProjectRows(formPage: PageHandle, projects: ProjectWithCommits[]): Promise<void> {
    await this.waitForProjectTimesheetSectionReady(formPage, 30000);
    for (let i = 0; i < projects.length; i++) {
      const proj = projects[i];
      try {
        // 确保当前目标行已经存在；若未出现则尝试点“添加”创建行
        await this.ensureProjectRowReady(formPage, i);

        const workContent = proj.commits.join('；');

        // 搜索并选择关联研发项目
        await this.searchAndSelectProject(formPage, i, 'rdProject', proj.mapping.rdProjectCode);

        // 搜索并选择关联客户项目
        await this.searchAndSelectProject(formPage, i, 'customerProject', proj.mapping.customerProjectCode);

        // 填写工作内容
        await this.fillCellByColumnName(formPage, i, '工作内容', workContent);

        // 填写工时
        await this.fillCellByColumnName(formPage, i, '工时', String(proj.hours));

      } catch (e) {
        throw new TimesheetFormFillError(
          `填写第 ${i + 1} 行（${proj.mapping.displayName}）失败: ${flattenErrorMessages(e)}`,
          e,
        );
      }
    }
  }

  /** 通过列名定位单元格并填写 — 动态查找，不依赖 field ID */
  private async fillCellByColumnName(
    formPage: PageHandle,
    rowIndex: number,
    columnName: string,
    value: string,
  ): Promise<void> {
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
    } catch (e) {
      if (e instanceof TimesheetFormFillError) throw e;
      throw new TimesheetFormFillError(`填写单元格 [行${rowIndex}, ${columnName}] 失败: ${flattenErrorMessages(e)}`, e);
    }
  }

  /** 搜索并选择项目（ant-select 下拉搜索） */
  private async searchAndSelectProject(
    formPage: PageHandle,
    rowIndex: number,
    type: 'rdProject' | 'customerProject',
    projectCode: string,
  ): Promise<void> {
    try {
      await this.ensureProjectRowReady(formPage, rowIndex);
      const columnIndex = type === 'rdProject' ? 5 : 8;
      const rowSelector = this.projectRowSelector(rowIndex);
      const cellSelector = `${rowSelector} td.detail_1_3_${columnIndex}`;
      const fieldId = this.getProjectHiddenFieldId(type, rowIndex);
      await this.openProjectLookupModal(formPage, cellSelector, rowIndex, type);
      await this.fillAndPickProjectInLookupModal(formPage, projectCode);

      // 校验回填：关联项目隐藏字段必须非空
      const selected = await this.waitForInputValue(formPage, `#${fieldId}`, 5000);
      if (!selected) {
        throw new Error(`项目编码未被系统选中（行 ${rowIndex}，${type}，字段 ${fieldId} 仍为空）`);
      }
    } catch (e) {
      if (e instanceof TimesheetFormFillError) throw e;
      throw new TimesheetFormFillError(
        `搜索并选择项目失败 [行${rowIndex}, ${type}, 编码${projectCode}]: ${flattenErrorMessages(e)}`,
        e,
      );
    }
  }

  private async openProjectLookupModal(
    formPage: PageHandle,
    cellSelector: string,
    rowIndex: number,
    type: 'rdProject' | 'customerProject',
  ): Promise<void> {
    const openButtonSelector = await this.waitForFirstExistingSelector(
      formPage,
      [
        `${cellSelector} button.ant-btn-icon-only:visible`,
        `${cellSelector} button.ant-btn-icon-only`,
      ],
      5000,
    );
    if (!openButtonSelector) {
      throw new Error(`行 ${rowIndex} 的 ${type} 未找到搜索按钮`);
    }
    await formPage.click(openButtonSelector, { timeout: this.config.timeoutMs });

    const modalSelector = await this.waitForFirstExistingSelector(
      formPage,
      ['.ant-modal:visible', '.ant-modal-wrap:visible .ant-modal'],
      5000,
    );
    if (!modalSelector) {
      throw new Error(`行 ${rowIndex} 的 ${type} 点击搜索后未出现弹窗`);
    }
  }

  private async fillAndPickProjectInLookupModal(formPage: PageHandle, projectCode: string): Promise<void> {
    // 1) 点击"高级搜索"展开搜索表单（默认收起 display:none）
    await this.clickAny(formPage, [
      '.ant-modal .wea-advanced-search',
      '.ant-modal button:has-text("高级搜索")',
    ], this.config.timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 2) 等待编码输入框出现
    const modalInputSelector = await this.waitForFirstExistingSelector(
      formPage,
      [
        '.ant-modal input#con13043_value:visible',
        '.ant-modal input[id^="con"][id$="_value"]:visible',
        '.ant-modal .wea-advanced-searchsAd input.ant-input:visible',
      ],
      5000,
    );
    if (!modalInputSelector) {
      throw new Error('项目选择弹窗中未找到可输入项目编号的输入框（已展开高级搜索）');
    }

    // 3) 填入项目编码
    await formPage.click(modalInputSelector, { timeout: this.config.timeoutMs });
    await formPage.fill(modalInputSelector, projectCode, { timeout: this.config.timeoutMs });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 4) 点击"搜 索"按钮触发搜索
    await this.clickAny(formPage, [
      '.ant-modal button.ant-btn-primary:has-text("搜 索")',
      '.ant-modal button.ant-btn-primary:has-text("搜索")',
    ], this.config.timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const rowSelector = await this.waitForFirstExistingSelector(
      formPage,
      [
        `.ant-modal tr.ant-table-row:has(td[stsdata="${projectCode}"])`,
        `.ant-modal tr.ant-table-row:has-text("${projectCode}")`,
        '.ant-modal tr.ant-table-row',
      ],
      5000,
    );
    if (!rowSelector) {
      throw new Error(`弹窗未检索到项目编码 ${projectCode} 的结果行`);
    }

    await this.singleClickRow(formPage, rowSelector);
    const modalClosed = await this.waitForSelectorsGone(formPage, ['.ant-modal:visible'], 5000);
    if (!modalClosed) {
      throw new Error('单击项目行后弹窗未关闭');
    }
  }

  private async singleClickRow(formPage: PageHandle, rowSelector: string): Promise<void> {
    await formPage.click(rowSelector, { timeout: this.config.timeoutMs });
  }

  private async waitForSelectorsGone(page: PageHandle, selectors: string[], timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let anyVisible = false;
      for (const selector of selectors) {
        if ((await this.safeCount(page, selector)) > 0) {
          anyVisible = true;
          break;
        }
      }
      if (!anyVisible) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  private async ensureProjectRowReady(formPage: PageHandle, rowIndex: number): Promise<void> {
    const requiredRows = rowIndex + 1;
    const maxAttempts = Math.max(requiredRows + 2, 8);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const rowCount = await this.countProjectRows(formPage);
      const targetRowCount = await formPage.locator(this.projectRowSelector(rowIndex)).count();
      if (rowCount >= requiredRows && targetRowCount > 0) return;

      if (rowCount < requiredRows) {
        await this.tryClickAddRowButton(formPage);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const currentRows = await this.countProjectRows(formPage);
    throw new Error(`未能创建工时明细行：需要至少 ${requiredRows} 行，当前 ${currentRows} 行`);
  }

  private projectRowSelector(rowIndex: number): string {
    return `#oTable0 tr.detail_data_row[data-rowindex="${rowIndex}"]:visible`;
  }

  private async countProjectRows(formPage: PageHandle): Promise<number> {
    return formPage.locator('#oTable0 tr.detail_data_row:visible').count();
  }

  private getProjectDetailColumnIndex(columnName: string): number | null {
    if (columnName === '工作内容') return 2;
    if (columnName === '工时') return 3;
    return null;
  }

  private async findFirstExistingSelector(page: PageHandle, selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      try {
        if ((await page.locator(selector).count()) > 0) return selector;
      } catch {
        // ignore and continue
      }
    }
    return null;
  }

  private async waitForFirstExistingSelector(
    page: PageHandle,
    selectors: string[],
    timeoutMs: number,
  ): Promise<string | null> {
    const ready = await this.waitForAnySelectorCount(page, selectors, timeoutMs);
    if (!ready) return null;
    return this.findFirstExistingSelector(page, selectors);
  }

  private async safeCount(page: PageHandle, selector: string): Promise<number> {
    try {
      return await page.locator(selector).count();
    } catch {
      return 0;
    }
  }

  private getProjectHiddenFieldId(type: 'rdProject' | 'customerProject', rowIndex: number): string {
    const fieldPrefix = type === 'rdProject' ? 'field19760' : 'field19762';
    return `${fieldPrefix}_${rowIndex}`;
  }

  private async waitForInputValue(page: PageHandle, selector: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const input = page.locator(selector).first();
        if ((await input.count()) > 0) {
          const value = ((await input.getAttribute('value')) ?? '').trim();
          if (value) return true;
        }
      } catch {
        // ignore and continue
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  private async tryClickAddRowButton(formPage: PageHandle): Promise<void> {
    const pageAny = formPage as unknown as {
      evaluate?: <T>(fn: () => T) => Promise<T>;
    };
    if (typeof pageAny.evaluate === 'function') {
      const clicked = await pageAny.evaluate(() => {
        const root = document.querySelector<HTMLElement>('#oTable0');
        if (!root) return false;
        const candidates = Array.from(
          root.querySelectorAll<HTMLElement>('i#addbutton0, i[id^="addbutton"], i[title="添加"], i.detailBtn'),
        );
        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          const visible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
          if (!visible) continue;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.click();
          return true;
        }
        return false;
      });
      if (clicked) return;
    }

    throw new Error('未找到 #oTable0 内可点击的添加按钮');
  }

  /** 步骤5：提交表单 */
  async submit(formPage: PageHandle): Promise<void> {
    try {
      // 注册对话框处理器（OA 提交时可能出现全局提醒弹窗）
      let dialogAppeared = false;
      let dialogMessage = '';
      let dialogHandledPromise: Promise<void> | null = null;
      if (formPage.once) {
        formPage.once('dialog', (dialog) => {
          dialogAppeared = true;
          dialogMessage = String(dialog.message?.() ?? '').trim();
          dialogHandledPromise = dialog.accept().catch(() => {});
        });
      }

      const preSubmitUrl = this.readPageUrl(formPage);

      // 点击提交按钮
      await this.browser.click(formPage, 'button:has-text("提 交")');

      // 给弹窗一个短暂出现与处理时间
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (dialogHandledPromise) {
        await dialogHandledPromise;
      }

      // 若出现全局弹窗：点击确定后，必须观察到后续页面跳转；否则反馈弹窗提醒
      if (dialogAppeared) {
        const progressed = await this.waitForPostSubmitProgress(formPage, preSubmitUrl);
        if (!progressed) {
          const timeoutSec = Math.ceil(Math.max(this.config.timeoutMs, 8000) / 1000);
          const popupText = dialogMessage || '（未获取到弹窗文案）';
          throw new TimesheetSubmitError(
            `提交时出现全局弹窗：「${popupText}」，已自动点击“确定”，但在 ${timeoutSec} 秒内未检测到页面进入下一步。请先处理该弹窗提示后重试。`,
          );
        }
        return;
      }

      // 未出现弹窗时保持原有短等待
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (e) {
      throw new TimesheetSubmitError(`提交工时表单失败: ${flattenErrorMessages(e)}`, e);
    }
  }

  /** 获取当前页面 URL（若底层 page 支持 url()） */
  private readPageUrl(page: PageHandle): string | null {
    const p = page as unknown as { url?: () => string };
    if (typeof p.url !== 'function') return null;
    try {
      const value = p.url();
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  /**
   * 提交后观察是否进入“下一步”页面。
   * 规则：URL 相对提交前发生变化，或不再停留在 static4form 页面。
   */
  private async waitForPostSubmitProgress(formPage: PageHandle, preSubmitUrl: string | null): Promise<boolean> {
    const timeoutMs = Math.max(this.config.timeoutMs, 8000);
    const pageAny = formPage as unknown as {
      waitForURL?: (matcher: unknown, opts?: { timeout?: number }) => Promise<void>;
      url?: () => string;
    };

    if (typeof pageAny.waitForURL === 'function') {
      try {
        await pageAny.waitForURL(
          (urlObj: { toString(): string }) => {
            const next = String(urlObj?.toString?.() ?? '');
            if (!next) return false;
            if (preSubmitUrl && next !== preSubmitUrl) return true;
            return !next.includes('/spa/workflow/static4form/index.html');
          },
          { timeout: timeoutMs },
        );
        return true;
      } catch {
        // 回退到轮询 URL
      }
    }

    if (typeof pageAny.url === 'function') {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const next = this.readPageUrl(formPage);
        if (next) {
          if (preSubmitUrl && next !== preSubmitUrl) return true;
          if (!next.includes('/spa/workflow/static4form/index.html')) return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    return false;
  }

  /** 错误时截图保存 */
  async screenshotOnError(stepName: string): Promise<string | null> {
    const pages: Array<{ key: string; page: PageHandle | null }> = [
      { key: 'form', page: this.formPage },
      { key: 'main', page: this.page },
    ];
    const validPages = pages.filter((p) => Boolean(p.page?.screenshot));
    if (validPages.length === 0) return null;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = path.isAbsolute(this.config.screenshotDir)
        ? this.config.screenshotDir
        : path.join(process.cwd(), this.config.screenshotDir);
      await fs.mkdir(dir, { recursive: true });

      const saved: string[] = [];
      for (const item of validPages) {
        const savePath = path.join(dir, `${stepName}_${item.key}_${timestamp}.png`);
        await item.page!.screenshot!({ path: savePath, fullPage: true });
        saved.push(savePath);
      }
      return saved.join(', ');
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    this.page = null;
    this.formPage = null;
  }
}

/**
 * 执行工时上报完整流程。
 */
export async function executeTimesheetWorkflow(
  targetDate: string,
  deps?: TimesheetWorkflowDeps,
): Promise<TimesheetWorkflowResult> {
  const date = String(targetDate ?? '').trim();
  if (!date) return { ok: false, message: '目标日期为空。' };

  const config = deps?.config ?? getTimesheetConfig();
  if (!config.loginId || !config.password) {
    return { ok: false, message: '未配置 TIMESHEET_LOGIN_ID 或 TIMESHEET_PASSWORD。' };
  }

  // 1. 加载项目映射
  let mappings: TimesheetProjectMapping[];
  if (deps?.mappings?.length) {
    mappings = deps.mappings;
  } else {
    try {
      mappings = loadProjectMappings(config.projectsConfigPath);
    } catch (e) {
      return { ok: false, message: `加载项目映射失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (mappings.length === 0) {
    return { ok: false, message: '项目映射配置为空，请检查 TIMESHEET_PROJECTS_CONFIG 指向的配置文件。' };
  }

  // 2. 构建项目数据（overrides 优先，否则读 git log）
  const projectsWithCommits: ProjectWithCommits[] = [];

  if (deps?.overrides?.length) {
    // 用户确认后的覆盖模式：根据 displayName 匹配 mapping
    for (const ov of deps.overrides) {
      const mapping = mappings.find((m) => m.displayName === ov.displayName);
      if (!mapping) continue;
      projectsWithCommits.push({
        mapping,
        commits: ov.content ? [ov.content] : [],
        hours: ov.hours,
      });
    }
  } else {
    // 默认模式：读取 git 提交记录
    for (const mapping of mappings) {
      try {
        const logEntry = readGitLogForDate(mapping.repoPath, date, config.gitAuthor || undefined);
        if (logEntry.commits.length > 0) {
          projectsWithCommits.push({ mapping, commits: logEntry.commits, hours: 0 });
        }
      } catch (e) {
        console.warn(`[Timesheet] 读取 ${mapping.displayName} git log 失败:`, e);
      }
    }
  }

  if (projectsWithCommits.length === 0) {
    return { ok: false, message: `${date} 没有任何配置项目的 git 提交记录，无需录入工时。` };
  }

  // 3. 分配工时（仅非 override 模式需要自动分配）
  let cappedProjects: ProjectWithCommits[];
  if (!deps?.overrides?.length) {
    const hoursList = distributeHours(projectsWithCommits.length);
    for (let i = 0; i < projectsWithCommits.length && i < hoursList.length; i++) {
      projectsWithCommits[i].hours = hoursList[i];
    }
    // 如果项目数超过 8，截断
    cappedProjects = projectsWithCommits.slice(0, hoursList.length);
  } else {
    cappedProjects = projectsWithCommits;
  }

  // 4. 浏览器自动化
  const browser = deps?.browser ?? new BrowserTool({
    headless: config.headless,
    timeoutMs: config.timeoutMs,
  });
  const sessionManager = deps?.sessionManager ?? new BrowserSessionManager(config.sessionDir);

  // OA 登录配置 — 与通用 SiteAuthService 的登录流程略有不同
  // OA 的登录页直接是表单，不需要先点击"登录"链接
  const auth = new SiteAuthService(browser, sessionManager, {
    siteKey: config.siteKey,
    baseUrl: config.oaBaseUrl,
    email: config.loginId,
    password: config.password,
    loginSelector: '#loginid',          // OA 登录页直接有输入框
    loginEmailSelector: '#loginid',
    loginEmailLabelSelector: '.e9login-form-item:has(#loginid) .e9login-form-label',
    loginPasswordSelector: '#userpassword',
    loginPasswordLabelSelector: '.e9login-form-item:has(#userpassword) .e9login-form-label',
    loginSubmitSelector: 'button:has-text("登 录")',
    loginSuccessSelector: 'a[title="产研医工时录入流程(Redmine Sync)"]',
    loginSuccessUrlPattern: /\/wui\/index\.html#\/main(?:\/|$)/i,
    useStorageState: false,             // 工时登录不复用会话，避免缓存过期导致异常
  });

  const workflow = new TimesheetWorkflow(browser, config, auth);

  try {
    // 4a. 登录
    await auth.ensureLoggedIn();

    // 4b. 导航到工时表单
    const nav = await workflow.navigateToTimesheetForm(date);
    let formPage = nav.formPage;
    const { skipDateSelection } = nav;

    // 4c. 若已命中目标日期单据则跳过选日期，否则走“选日期+提交进入下一步”
    if (!skipDateSelection) {
      formPage = await workflow.selectDateAndSubmit(formPage, date);
    }

    // 4d. 填写项目行
    await workflow.fillProjectRows(formPage, cappedProjects);

    // 4e. 提交
    await workflow.submit(formPage);

    await workflow.close();

    const submittedProjects: TimesheetSubmittedProject[] = cappedProjects.map((p) => ({
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
  } catch (e) {
    // 截图保存
    const stepName = e instanceof TimesheetLoginError
      ? 'login'
      : e instanceof TimesheetNavigationError
        ? 'navigation'
        : e instanceof TimesheetFormFillError
          ? 'form-fill'
          : e instanceof TimesheetSubmitError
            ? 'submit'
            : 'unknown';
    const screenshotPath = await workflow.screenshotOnError(stepName);
    await workflow.close();

    const errorMsg = flattenErrorMessages(e);
    const screenshotHint = screenshotPath ? `（截图已保存: ${screenshotPath}）` : '';

    if (e instanceof TimesheetLoginError) return { ok: false, message: `登录 OA 失败：${errorMsg}${screenshotHint}` };
    if (e instanceof TimesheetNavigationError) return { ok: false, message: `导航到工时表单失败：${errorMsg}${screenshotHint}` };
    if (e instanceof TimesheetFormFillError) return { ok: false, message: `填写工时表单失败：${errorMsg}${screenshotHint}` };
    if (e instanceof TimesheetSubmitError) return { ok: false, message: `提交工时失败：${errorMsg}${screenshotHint}` };
    return { ok: false, message: `工时上报发生错误：${errorMsg}${screenshotHint}` };
  }
}
