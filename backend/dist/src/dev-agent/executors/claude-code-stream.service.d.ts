import { ConfigService } from '@nestjs/config';
export interface ClaudeCodeStreamOptions {
    cwd?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    model?: string;
    allowedTools?: string[];
    abortController?: AbortController;
}
export interface ClaudeCodeStreamResult {
    success: boolean;
    content: string | null;
    error: string | null;
    durationMs: number;
    costUsd: number;
    numTurns: number;
    sessionId: string | null;
    stopReason: string | null;
}
export type ClaudeCodeProgressCallback = (event: {
    type: string;
    text?: string;
    toolName?: string;
}) => void;
export declare class ClaudeCodeStreamService {
    private readonly logger;
    private readonly defaultModel;
    private readonly defaultMaxTurns;
    private readonly defaultMaxBudgetUsd;
    constructor(config: ConfigService);
    execute(prompt: string, options?: ClaudeCodeStreamOptions, onProgress?: ClaudeCodeProgressCallback): Promise<ClaudeCodeStreamResult>;
    private emitProgress;
}
