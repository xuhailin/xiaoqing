export declare function estimateTokens(text: string): number;
export declare function estimateMessagesTokens(messages: Array<{
    role: string;
    content: string;
}>): number;
export declare function truncateToTokenBudget(messages: Array<{
    role: string;
    content: string;
}>, maxTokens: number): Array<{
    role: string;
    content: string;
}>;
