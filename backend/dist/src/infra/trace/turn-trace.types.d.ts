export interface TurnTraceEvent {
    traceId: string;
    conversationId: string;
    turnId: string;
    phase: 'input_understanding' | 'context_assembly' | 'strategy_decision' | 'memory_recall' | 'tool_execution' | 'cognitive_integration' | 'prompt_assembly' | 'llm_invoke' | 'postprocess';
    step: string;
    component: string;
    status: 'success' | 'fail' | 'skip';
    startedAt?: string;
    durationMs: number;
    detail: Record<string, unknown>;
}
