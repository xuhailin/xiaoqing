export interface ResourceConfig {
  baseUrl: string;
  /** 站点标识（用于 session 文件命名） */
  siteKey: string;
  /** session 文件存储目录 */
  sessionDir: string;
  /** 登录凭证 */
  email: string;
  password: string;
  loginSelector: string;
  loginEmailSelector: string;
  loginPasswordSelector: string;
  loginSubmitSelector: string;
  loginSuccessSelector: string;
  searchInputSelector: string;
  searchButtonSelector: string;
  resultListSelector: string;
  resultItemSelector: string;
  resultItemTitleSelector: string;
  resultItemAuthorSelector: string;
  resultItemPublisherSelector: string;
  /** 若设置，则从该 selector 元素的属性取 publisher，否则用 resultItemPublisherSelector 取文本 */
  resultItemPublisherAttr?: string;
  resultItemFormatSelector: string;
  /** 若设置，则从该 selector 元素的属性取 format（如 extension），否则取文本 */
  resultItemFormatAttr?: string;
  resultItemLinkSelector: string;
  detailPageDownloadSelector: string;
  /** 一段点击后未触发下载时，尝试二段下载控件的候选 selector */
  detailPageSecondaryDownloadSelectors: string[];
}

export function getResourceConfig(env: NodeJS.ProcessEnv = process.env): ResourceConfig {
  const secondaryDownloadSelectors = (
    env.RESOURCE_DETAIL_SECONDARY_DOWNLOAD_SELECTORS
    ?? [
      'a.dlButton',
      'button.dlButton',
      'a[href*=".epub"]',
      'a[href*=".mobi"]',
      'a[href^="/dl/"]',
      'a.addDownloadedBook',
      'a[download]',
      'button:has-text("epub")',
      'button:has-text("mobi")',
      'button#btnCheckOtherFormats',
      'button.dlDropdownBtn',
      'a:has-text("下载")',
      'a:has-text("Download")',
    ].join(',')
  )
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  return {
    baseUrl: env.RESOURCE_BASE_URL ?? '',
    siteKey: env.RESOURCE_SITE_KEY ?? 'default',
    sessionDir: env.RESOURCE_SESSION_DIR ?? '.sessions',
    email: env.RESOURCE_EMAIL ?? '',
    password: env.RESOURCE_PASSWORD ?? '',
    // Login (page navigation, not modal)
    loginSelector: env.RESOURCE_LOGIN_SELECTOR ?? 'a:has-text("登录")',
    loginEmailSelector: env.RESOURCE_LOGIN_EMAIL ?? 'input[name="email"], input[type="email"]',
    loginPasswordSelector: env.RESOURCE_LOGIN_PASSWORD ?? 'input[type="password"]',
    loginSubmitSelector: env.RESOURCE_LOGIN_SUBMIT ?? 'button:has-text("登录")',
    loginSuccessSelector: env.RESOURCE_LOGIN_SUCCESS ?? '#searchFieldx',
    // Search
    searchInputSelector: env.RESOURCE_SEARCH_INPUT ?? '#searchFieldx',
    searchButtonSelector: env.RESOURCE_SEARCH_BUTTON ?? 'button:has-text("搜索")',
    // Results（默认按 z-library 风格：.book-item 容器 + z-bookcard 上 slot/属性）
    resultListSelector: env.RESOURCE_RESULT_LIST ?? '#searchResultBox',
    resultItemSelector: env.RESOURCE_RESULT_ITEM ?? '.book-item',
    resultItemTitleSelector: env.RESOURCE_RESULT_TITLE ?? '[slot="title"]',
    resultItemAuthorSelector: env.RESOURCE_RESULT_AUTHOR ?? '[slot="author"]',
    resultItemPublisherSelector: env.RESOURCE_RESULT_PUBLISHER ?? 'z-bookcard',
    resultItemPublisherAttr: env.RESOURCE_RESULT_PUBLISHER_ATTR ?? 'publisher',
    resultItemFormatSelector: env.RESOURCE_RESULT_FORMAT ?? 'z-bookcard',
    resultItemFormatAttr: env.RESOURCE_RESULT_FORMAT_ATTR ?? 'extension',
    resultItemLinkSelector: env.RESOURCE_RESULT_LINK ?? 'z-bookcard',
    // Detail page
    detailPageDownloadSelector:
      env.RESOURCE_DETAIL_DOWNLOAD
      ?? 'a.addDownloadedBook, a[href^="/dl/"], a.dlButton, a:has(.book-property__extension), a:has-text("epub"), a:has-text("mobi")',
    detailPageSecondaryDownloadSelectors: secondaryDownloadSelectors,
  };
}
