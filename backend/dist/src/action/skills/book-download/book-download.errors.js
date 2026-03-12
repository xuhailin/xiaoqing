"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionExpiredError = exports.DownloadFailedError = exports.SearchFailedError = exports.LoginFailedError = void 0;
class LoginFailedError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'LoginFailedError';
        if (cause instanceof Error)
            this.cause = cause;
    }
}
exports.LoginFailedError = LoginFailedError;
class SearchFailedError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'SearchFailedError';
        if (cause instanceof Error)
            this.cause = cause;
    }
}
exports.SearchFailedError = SearchFailedError;
class DownloadFailedError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'DownloadFailedError';
        if (cause instanceof Error)
            this.cause = cause;
    }
}
exports.DownloadFailedError = DownloadFailedError;
class SessionExpiredError extends Error {
    constructor(message = 'session 已失效，需要重新登录', cause) {
        super(message);
        this.name = 'SessionExpiredError';
        if (cause instanceof Error)
            this.cause = cause;
    }
}
exports.SessionExpiredError = SessionExpiredError;
//# sourceMappingURL=book-download.errors.js.map