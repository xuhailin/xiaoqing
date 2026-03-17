export interface CheckinConfig {
  /** 目标首页 URL */
  targetUrl: string;
  /** SSO 登录页 URL 特征（URL 包含该字符串则判定需要登录） */
  ssoLoginPattern: string;
  /** 打卡坐标 */
  geolocation: { latitude: number; longitude: number };
  /** 扫码超时（毫秒），默认 300000 (5min) */
  scanTimeoutMs: number;
  /** StorageState 持久化 key */
  siteKey: string;
  /** 截图保存目录 */
  screenshotDir: string;
  /** 浏览器无头模式 */
  headless: boolean;
  /** 页面操作超时（毫秒） */
  timeoutMs: number;
}

export function loadCheckinConfig(env = process.env): CheckinConfig | null {
  const targetUrl = env.CHECKIN_TARGET_URL;
  if (!targetUrl) return null;

  return {
    targetUrl,
    ssoLoginPattern: env.CHECKIN_SSO_PATTERN ?? 'sso/login',
    geolocation: {
      latitude: Number(env.CHECKIN_GEO_LAT) || 31.2304,
      longitude: Number(env.CHECKIN_GEO_LNG) || 121.4737,
    },
    scanTimeoutMs: Number(env.CHECKIN_SCAN_TIMEOUT_MS) || 300_000,
    siteKey: env.CHECKIN_SITE_KEY ?? 'checkin',
    screenshotDir: env.CHECKIN_SCREENSHOT_DIR ?? 'assets/checkin-debug',
    headless: env.LOCAL_ACTION_BROWSER_HEADLESS !== 'false',
    timeoutMs: Number(env.CHECKIN_TIMEOUT_MS) || 15_000,
  };
}
