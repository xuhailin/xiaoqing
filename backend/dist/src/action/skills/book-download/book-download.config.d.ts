export interface ResourceConfig {
    baseUrl: string;
    siteKey: string;
    sessionDir: string;
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
    resultItemPublisherAttr?: string;
    resultItemFormatSelector: string;
    resultItemFormatAttr?: string;
    resultItemLinkSelector: string;
    detailPageDownloadSelector: string;
    detailPageSecondaryDownloadSelectors: string[];
}
export declare function getResourceConfig(env?: NodeJS.ProcessEnv): ResourceConfig;
