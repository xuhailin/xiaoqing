import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ScreenshotRequest {
  /** 完整 URL 或路由路径（如 "/memory"） */
  url: string;
  /** 截图视口宽度，默认 1280 */
  width?: number;
  /** 截图视口高度，默认 800 */
  height?: number;
  /** 是否同时截 dark mode，默认 true */
  captureDark?: boolean;
  /** 页面加载后等待的额外毫秒数，默认 1500 */
  waitAfterLoad?: number;
}

export interface ScreenshotResult {
  /** light mode 截图（PNG base64） */
  light: string;
  /** dark mode 截图（PNG base64），captureDark=false 时为 null */
  dark: string | null;
  /** 实际访问的 URL */
  url: string;
  /** 截图分辨率 */
  viewport: { width: number; height: number };
}

/**
 * 使用 Playwright 对页面进行截图。
 *
 * 支持 light/dark 双主题截图，用于 DesignAgent 视觉审查。
 */
@Injectable()
export class PageScreenshotService {
  private readonly logger = new Logger(PageScreenshotService.name);
  private readonly frontendBaseUrl: string;

  constructor(config: ConfigService) {
    this.frontendBaseUrl =
      config.get<string>('DESIGN_AGENT_FRONTEND_URL') ?? 'http://localhost:4200';
  }

  async capture(request: ScreenshotRequest): Promise<ScreenshotResult> {
    const width = request.width ?? 1280;
    const height = request.height ?? 800;
    const captureDark = request.captureDark ?? true;
    const waitAfterLoad = request.waitAfterLoad ?? 1500;

    const url = this.resolveUrl(request.url);
    this.logger.log(`Screenshot: ${url} (${width}x${height})`);

    // 动态 import playwright（避免未安装浏览器时启动报错）
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      // 导航到目标页面
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(waitAfterLoad);

      // Light mode 截图
      const lightBuffer = await page.screenshot({ type: 'png', fullPage: false });
      const light = lightBuffer.toString('base64');

      // Dark mode 截图
      let dark: string | null = null;
      if (captureDark) {
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });
        await page.waitForTimeout(500);
        const darkBuffer = await page.screenshot({ type: 'png', fullPage: false });
        dark = darkBuffer.toString('base64');
      }

      this.logger.log(`Screenshot captured: light=${(light.length / 1024).toFixed(0)}KB` +
        (dark ? ` dark=${(dark.length / 1024).toFixed(0)}KB` : ''));

      return { light, dark, url, viewport: { width, height } };
    } finally {
      await browser.close();
    }
  }

  private resolveUrl(input: string): string {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return input;
    }
    // 路由路径 → 补全 base URL
    const path = input.startsWith('/') ? input : `/${input}`;
    return `${this.frontendBaseUrl}${path}`;
  }
}
