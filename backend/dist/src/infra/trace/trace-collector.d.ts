import type { TraceStep, TraceStepLabel, TraceStepStatus } from './trace.types';
export declare class TraceCollector {
    private steps;
    private seq;
    private enabled;
    constructor(enabled: boolean);
    add(label: TraceStepLabel, title: string, status: TraceStepStatus, detail: Record<string, unknown>): void;
    wrap<T>(label: TraceStepLabel, title: string, fn: () => Promise<{
        status: TraceStepStatus;
        detail: Record<string, unknown>;
        result: T;
    }>): Promise<T>;
    getTrace(): TraceStep[];
}
