export type TraceStepLabel = 'pipeline-cognition' | 'pipeline-decision' | 'pipeline-expression' | 'intent' | 'cognitive-pipeline' | 'meta-layer' | 'boundary-governance' | 'policy-decision' | 'world-state' | 'memory-recall' | 'skill-attempt' | 'openclaw' | 'prompt-build' | 'llm-generate' | 'missing-params' | 'auto-summarize' | 'auto-evolution' | 'identity-update';
export type TraceStepStatus = 'success' | 'fail' | 'skip';
export interface TraceStep {
    seq: number;
    label: TraceStepLabel;
    title: string;
    durationMs: number;
    status: TraceStepStatus;
    detail: Record<string, unknown>;
}
