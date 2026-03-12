import type { TraceStep } from './trace.types';
import type { TurnTraceEvent } from './turn-trace.types';
export declare function adaptLegacyTraceToTurnEvents(input: {
    traceId: string;
    conversationId: string;
    turnId: string;
    steps: TraceStep[];
}): TurnTraceEvent[];
