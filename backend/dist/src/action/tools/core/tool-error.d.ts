export type ToolErrorCode = 'VALIDATION_ERROR' | 'EXECUTION_ERROR';
export declare class ToolError extends Error {
    readonly code: ToolErrorCode;
    constructor(code: ToolErrorCode, message: string, cause?: unknown);
}
