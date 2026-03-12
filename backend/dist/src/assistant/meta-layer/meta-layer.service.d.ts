export interface MetaLayerResult {
    content: string;
    adjusted: boolean;
    reasons: string[];
    removedSegments: number;
    rewrittenSegments: number;
}
export declare class MetaLayerService {
    private static readonly STRATEGY_EXPLANATION_PATTERNS;
    private static readonly INTERNAL_LOGIC_PATTERNS;
    private static readonly PROMPT_LEAK_PATTERNS;
    filter(content: string, policy?: string | null): MetaLayerResult;
    private tokenize;
    private isWhitespace;
    private matchesAny;
    private rewriteInternalLogic;
    private rewritePromptLeak;
    private getTrailingPunctuation;
    private cleanup;
    private pushReason;
}
