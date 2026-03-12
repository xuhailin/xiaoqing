export type ToolErrorCode = 'VALIDATION_ERROR' | 'EXECUTION_ERROR';

export class ToolError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'ToolError';
    if (cause instanceof Error) (this as Error & { cause?: unknown }).cause = cause;
  }
}
