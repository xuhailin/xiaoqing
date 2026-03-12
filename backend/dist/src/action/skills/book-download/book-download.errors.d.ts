export declare class LoginFailedError extends Error {
    constructor(message: string, cause?: unknown);
}
export declare class SearchFailedError extends Error {
    constructor(message: string, cause?: unknown);
}
export declare class DownloadFailedError extends Error {
    constructor(message: string, cause?: unknown);
}
export declare class SessionExpiredError extends Error {
    constructor(message?: string, cause?: unknown);
}
