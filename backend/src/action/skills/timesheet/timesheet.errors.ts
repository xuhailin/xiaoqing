export class TimesheetLoginError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TimesheetLoginError';
    if (cause) this.cause = cause;
  }
}

export class TimesheetNavigationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TimesheetNavigationError';
    if (cause) this.cause = cause;
  }
}

export class TimesheetFormFillError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TimesheetFormFillError';
    if (cause) this.cause = cause;
  }
}

export class TimesheetSubmitError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TimesheetSubmitError';
    if (cause) this.cause = cause;
  }
}

export class TimesheetGitLogError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TimesheetGitLogError';
    if (cause) this.cause = cause;
  }
}
