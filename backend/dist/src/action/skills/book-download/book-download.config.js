"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResourceConfig = getResourceConfig;
function getResourceConfig(env = process.env) {
    const secondaryDownloadSelectors = (env.RESOURCE_DETAIL_SECONDARY_DOWNLOAD_SELECTORS
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
        ].join(','))
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    return {
        baseUrl: env.RESOURCE_BASE_URL ?? '',
        siteKey: env.RESOURCE_SITE_KEY ?? 'default',
        sessionDir: env.RESOURCE_SESSION_DIR ?? '.sessions',
        email: env.RESOURCE_EMAIL ?? '',
        password: env.RESOURCE_PASSWORD ?? '',
        loginSelector: env.RESOURCE_LOGIN_SELECTOR ?? 'a:has-text("登录")',
        loginEmailSelector: env.RESOURCE_LOGIN_EMAIL ?? 'input[name="email"], input[type="email"]',
        loginPasswordSelector: env.RESOURCE_LOGIN_PASSWORD ?? 'input[type="password"]',
        loginSubmitSelector: env.RESOURCE_LOGIN_SUBMIT ?? 'button:has-text("登录")',
        loginSuccessSelector: env.RESOURCE_LOGIN_SUCCESS ?? '#searchFieldx',
        searchInputSelector: env.RESOURCE_SEARCH_INPUT ?? '#searchFieldx',
        searchButtonSelector: env.RESOURCE_SEARCH_BUTTON ?? 'button:has-text("搜索")',
        resultListSelector: env.RESOURCE_RESULT_LIST ?? '#searchResultBox',
        resultItemSelector: env.RESOURCE_RESULT_ITEM ?? '.book-item',
        resultItemTitleSelector: env.RESOURCE_RESULT_TITLE ?? '[slot="title"]',
        resultItemAuthorSelector: env.RESOURCE_RESULT_AUTHOR ?? '[slot="author"]',
        resultItemPublisherSelector: env.RESOURCE_RESULT_PUBLISHER ?? 'z-bookcard',
        resultItemPublisherAttr: env.RESOURCE_RESULT_PUBLISHER_ATTR ?? 'publisher',
        resultItemFormatSelector: env.RESOURCE_RESULT_FORMAT ?? 'z-bookcard',
        resultItemFormatAttr: env.RESOURCE_RESULT_FORMAT_ATTR ?? 'extension',
        resultItemLinkSelector: env.RESOURCE_RESULT_LINK ?? 'z-bookcard',
        detailPageDownloadSelector: env.RESOURCE_DETAIL_DOWNLOAD
            ?? 'a.addDownloadedBook, a[href^="/dl/"], a.dlButton, a:has(.book-property__extension), a:has-text("epub"), a:has-text("mobi")',
        detailPageSecondaryDownloadSelectors: secondaryDownloadSelectors,
    };
}
//# sourceMappingURL=book-download.config.js.map