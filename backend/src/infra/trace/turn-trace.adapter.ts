import type { TraceStep } from './trace.types';
import type { TurnTraceEvent } from './turn-trace.types';

const PHASE_MAP: Record<string, TurnTraceEvent['phase']> = {
  intent: 'input_understanding',
  'pipeline-cognition': 'cognitive_integration',
  'pipeline-decision': 'strategy_decision',
  'pipeline-expression': 'prompt_assembly',
  'memory-recall': 'memory_recall',
  'skill-attempt': 'tool_execution',
  openclaw: 'tool_execution',
  'llm-generate': 'llm_invoke',
  'prompt-build': 'prompt_assembly',
  'auto-summarize': 'postprocess',
  'auto-evolution': 'postprocess',
  'boundary-governance': 'postprocess',
  'meta-layer': 'postprocess',
  'world-state': 'context_assembly',
};

export function adaptLegacyTraceToTurnEvents(input: {
  traceId: string;
  conversationId: string;
  turnId: string;
  steps: TraceStep[];
}): TurnTraceEvent[] {
  return input.steps.map((step) => ({
    traceId: input.traceId,
    conversationId: input.conversationId,
    turnId: input.turnId,
    phase: PHASE_MAP[step.label] ?? 'postprocess',
    step: step.label,
    component: 'conversation',
    status: step.status,
    durationMs: step.durationMs,
    detail: step.detail,
  }));
}
