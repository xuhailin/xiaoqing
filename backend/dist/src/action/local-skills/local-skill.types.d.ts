export interface LocalSkillStepDefinition {
    id: string;
    capability: string;
    request: Record<string, unknown>;
}
export interface LocalSkillStepResult {
    index: number;
    id: string;
    capability: string;
    request: Record<string, unknown>;
    success: boolean;
    content: string | null;
    error: string | null;
    durationMs: number;
    meta?: Record<string, unknown>;
}
export interface LocalSkillDefinition {
    name: string;
    description: string;
    capabilityAllowlist: string[];
    steps: LocalSkillStepDefinition[];
    summarize(input: {
        steps: LocalSkillStepResult[];
        success: boolean;
    }): string;
}
export interface LocalSkillRunRequest {
    skill: string;
    conversationId: string;
    turnId: string;
    userInput: string;
}
export interface LocalSkillRunResult {
    skill: string;
    success: boolean;
    summary: string;
    steps: LocalSkillStepResult[];
    startedAt: string;
    durationMs: number;
}
