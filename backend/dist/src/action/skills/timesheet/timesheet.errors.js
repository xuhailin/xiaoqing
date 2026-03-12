"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimesheetGitLogError = exports.TimesheetSubmitError = exports.TimesheetFormFillError = exports.TimesheetNavigationError = exports.TimesheetLoginError = void 0;
class TimesheetLoginError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'TimesheetLoginError';
        if (cause)
            this.cause = cause;
    }
}
exports.TimesheetLoginError = TimesheetLoginError;
class TimesheetNavigationError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'TimesheetNavigationError';
        if (cause)
            this.cause = cause;
    }
}
exports.TimesheetNavigationError = TimesheetNavigationError;
class TimesheetFormFillError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'TimesheetFormFillError';
        if (cause)
            this.cause = cause;
    }
}
exports.TimesheetFormFillError = TimesheetFormFillError;
class TimesheetSubmitError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'TimesheetSubmitError';
        if (cause)
            this.cause = cause;
    }
}
exports.TimesheetSubmitError = TimesheetSubmitError;
class TimesheetGitLogError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'TimesheetGitLogError';
        if (cause)
            this.cause = cause;
    }
}
exports.TimesheetGitLogError = TimesheetGitLogError;
//# sourceMappingURL=timesheet.errors.js.map