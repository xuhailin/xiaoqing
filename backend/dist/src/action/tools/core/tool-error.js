"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolError = void 0;
class ToolError extends Error {
    code;
    constructor(code, message, cause) {
        super(message);
        this.code = code;
        this.name = 'ToolError';
        if (cause instanceof Error)
            this.cause = cause;
    }
}
exports.ToolError = ToolError;
//# sourceMappingURL=tool-error.js.map