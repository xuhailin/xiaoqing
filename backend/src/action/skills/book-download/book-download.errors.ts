export class LoginFailedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LoginFailedError';
    if (cause instanceof Error) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export class SearchFailedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SearchFailedError';
    if (cause instanceof Error) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export class DownloadFailedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DownloadFailedError';
    if (cause instanceof Error) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export class SessionExpiredError extends Error {
  constructor(message = 'session 已失效，需要重新登录', cause?: unknown) {
    super(message);
    this.name = 'SessionExpiredError';
    if (cause instanceof Error) (this as Error & { cause?: unknown }).cause = cause;
  }
}
