import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import { BrowserTool, type PageHandle } from '../../tools/browser/browser.tool';
import { BrowserSessionManager } from '../../tools/browser/browser-session.manager';
import { PrismaService } from '../../../infra/prisma.service';
import { estimateTokens } from '../../../infra/token-estimator';
import { type CheckinConfig, loadCheckinConfig } from './checkin.config';

@Injectable()
export class CheckinSkillService implements ICapability {
  private readonly logger = new Logger(CheckinSkillService.name);
  private readonly config: CheckinConfig | null;
  private readonly sessionManager: BrowserSessionManager;

  readonly name = 'checkin';
  readonly taskIntent = 'checkin';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '打卡（上班/下班考勤打卡）';
  readonly surface = 'assistant' as const;
  readonly scope = 'private' as const;
  readonly portability = 'environment-bound' as const;
  readonly requiresAuth = true;
  readonly requiresUserContext = false;
  readonly visibility = 'optional' as const;

  constructor(private readonly prisma: PrismaService) {
    this.config = loadCheckinConfig();
    this.sessionManager = new BrowserSessionManager();
  }

  isAvailable(): boolean {
    return this.config !== null;
  }

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    if (!this.config) {
      return { success: false, content: null, error: '打卡功能未配置（缺少 CHECKIN_TARGET_URL）' };
    }

    const browser = new BrowserTool({
      headless: this.config.headless,
      timeoutMs: this.config.timeoutMs,
    });

    try {
      return await this.runCheckin(browser, request.conversationId);
    } catch (err) {
      this.logger.error(`Checkin failed: ${String(err)}`);
      return { success: false, content: '打卡失败，请检查日志。', error: String(err) };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private async runCheckin(browser: BrowserTool, conversationId: string): Promise<CapabilityResult> {
    const config = this.config!;

    // 1. 尝试恢复登录态
    const savedState = await this.sessionManager.load(config.siteKey);
    await browser.createContext({
      storageState: savedState,
      geolocation: config.geolocation,
      permissions: ['geolocation'],
    });

    const page = await browser.newPage();
    await this.openTargetPage(browser, page);

    // 2. 检查是否需要登录
    const currentUrl = page.url();
    if (currentUrl.includes(config.ssoLoginPattern)) {
      if (savedState) {
        // 登录态已过期
        await this.sessionManager.clear(config.siteKey);
      }

      const loginResult = await this.handleSsoLogin(browser, page, conversationId);
      if (!loginResult.success) return loginResult;

      // 登录成功，保存 StorageState
      const state = await browser.getStorageState();
      await this.sessionManager.save(config.siteKey, state);

      // 等待页面回到目标页
      await this.waitForTargetPage(browser, page);
    }

    // 3. 保存/刷新 StorageState
    const freshState = await browser.getStorageState();
    await this.sessionManager.save(config.siteKey, freshState);

    // 4. 点击打卡入口
    await this.clickCheckinEntry(browser, page);

    // 5. 点击打卡按钮
    await this.clickCheckinButton(browser, page);

    // 6. 处理异常提示弹窗
    await this.handleAbnormalDialog(browser, page);

    // 7. 截图确认
    const screenshotPath = await this.takeScreenshot(browser, page, 'checkin-result');
    const resultUrl = this.toAssetUrl(screenshotPath);
    await this.pushMessage(conversationId, `打卡完成！\n\n![打卡结果](${resultUrl})`);

    return {
      success: true,
      content: '打卡成功！',
      error: null,
      meta: { screenshotPath },
    };
  }

  /** SSO 扫码登录流程 */
  private async handleSsoLogin(
    browser: BrowserTool,
    page: PageHandle,
    conversationId: string,
  ): Promise<CapabilityResult> {
    const config = this.config!;

    try {
      // 点击二维码切换按钮
      await browser.click(page, 'svg.icon-qr');
      // 等待二维码区域加载
      await this.sleep(1500);

      // 截图二维码区域
      const qrScreenshotPath = await this.takeElementScreenshot(
        page,
        '.account-form-container.center-box',
        'qr-code',
      );

      // 推送消息给用户（markdown 图片可在前端直接预览）
      const qrUrl = this.toAssetUrl(qrScreenshotPath);
      await this.pushMessage(
        conversationId,
        `需要扫码登录，请扫描下方二维码：\n\n![扫码登录](${qrUrl})`,
      );

      // 轮询等待登录成功（URL 不再包含 sso/login）
      const loginSuccess = await this.pollForLoginSuccess(page, config.scanTimeoutMs);

      if (!loginSuccess) {
        await this.pushMessage(conversationId, '扫码超时（5分钟），打卡已取消。');
        return { success: false, content: '扫码超时，打卡已取消。', error: 'scan_timeout' };
      }

      await this.pushMessage(conversationId, '扫码成功，继续执行打卡...');
      return { success: true, content: null, error: null };
    } catch (err) {
      this.logger.error(`SSO login failed: ${String(err)}`);
      return { success: false, content: '登录流程异常', error: String(err) };
    }
  }

  /** 轮询 URL 变化，等待离开 SSO 登录页 */
  private async pollForLoginSuccess(page: PageHandle, timeoutMs: number): Promise<boolean> {
    const config = this.config!;
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const url = page.url();
      if (!url.includes(config.ssoLoginPattern)) {
        return true;
      }
      await this.sleep(pollInterval);
    }

    return false;
  }

  /** 等待页面回到目标页 */
  private async waitForTargetPage(browser: BrowserTool, page: PageHandle): Promise<void> {
    const config = this.config!;
    await this.sleep(3000);
    const url = page.url();
    if (!url.includes(new URL(config.targetUrl).hostname)) {
      await this.openTargetPage(browser, page);
    }
  }

  /** 企业站常驻轮询较多，避免使用 networkidle 导致误判超时 */
  private async openTargetPage(browser: BrowserTool, page: PageHandle): Promise<void> {
    const config = this.config!;
    await browser.goto(page, config.targetUrl, 'domcontentloaded');
    await browser.waitFor(page, 'body');
    await this.sleep(1000);
  }

  /** 点击打卡入口（首页的打卡图标） */
  private async clickCheckinEntry(browser: BrowserTool, page: PageHandle): Promise<void> {
    // 使用图片 src 特征定位打卡入口
    await browser.waitFor(page, 'img[src*="clock_in"]');
    // 点击包含打卡图标的 li 元素
    await browser.click(page, 'img[src*="clock_in"]');
    // 等待打卡子页加载
    await this.sleep(2000);
  }

  /** 点击打卡按钮（上班打卡 / 下班打卡） */
  private async clickCheckinButton(browser: BrowserTool, page: PageHandle): Promise<void> {
    await browser.waitFor(page, '.sign-btn');
    await browser.click(page, '.sign-btn');
    await this.sleep(1500);
  }

  /** 处理异常提示弹窗（早退/迟到确认） */
  private async handleAbnormalDialog(browser: BrowserTool, page: PageHandle): Promise<void> {
    try {
      // 短超时检测弹窗是否存在
      const locator = page.locator('.abnormal-content');
      const count = await locator.count();
      if (count > 0) {
        // 点击「继续打卡」
        const footer = page.locator('.abnormal-content-footer');
        const continueBtn = footer.locator('div').first();
        await continueBtn.click();
        await this.sleep(1000);
      }
    } catch {
      // 弹窗不存在，正常继续
    }
  }

  /** 对指定元素截图 */
  private async takeElementScreenshot(
    page: PageHandle,
    selector: string,
    name: string,
  ): Promise<string> {
    const config = this.config!;
    const dir = path.isAbsolute(config.screenshotDir)
      ? config.screenshotDir
      : path.join(process.cwd(), config.screenshotDir);
    await fs.mkdir(dir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `${name}-${timestamp}.png`);

    const locator = page.locator(selector);
    if (locator.screenshot) {
      await locator.screenshot({ path: filePath });
    } else {
      // fallback: 全页截图
      if (page.screenshot) {
        await page.screenshot({ path: filePath, fullPage: false });
      }
    }

    return filePath;
  }

  /** 全页截图 */
  private async takeScreenshot(
    browser: BrowserTool,
    page: PageHandle,
    name: string,
  ): Promise<string> {
    const config = this.config!;
    const dir = path.isAbsolute(config.screenshotDir)
      ? config.screenshotDir
      : path.join(process.cwd(), config.screenshotDir);
    await fs.mkdir(dir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `${name}-${timestamp}.png`);
    await browser.screenshot(page, filePath);
    return filePath;
  }

  /** 推送中间消息到对话 */
  private async pushMessage(conversationId: string, content: string): Promise<void> {
    try {
      await this.prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          kind: 'tool',
          content,
          metadata: {
            source: 'tool',
            toolKind: 'checkin',
            toolName: 'checkin',
            summary: content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? '打卡进度更新',
            success: !/超时|取消|失败/.test(content),
          },
          tokenCount: estimateTokens(content),
        },
      });
      this.logger.log(`Pushed checkin message to conv=${conversationId}: ${content}`);
    } catch (err) {
      this.logger.warn(`Failed to push checkin message: ${String(err)}`);
    }
  }

  /** Convert an absolute screenshot path to a relative /assets/... URL */
  private toAssetUrl(absolutePath: string): string {
    const assetsRoot = path.join(process.cwd(), 'assets');
    const relative = path.relative(assetsRoot, absolutePath);
    const port = process.env.PORT ?? '3000';
    return `http://localhost:${port}/assets/${relative}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
