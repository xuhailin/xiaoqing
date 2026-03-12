import type { TraceStep, TraceStepLabel, TraceStepStatus } from './trace.types';

export class TraceCollector {
  private steps: TraceStep[] = [];
  private seq = 0;
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * 记录一个同步步骤
   */
  add(
    label: TraceStepLabel,
    title: string,
    status: TraceStepStatus,
    detail: Record<string, unknown>,
  ): void {
    if (!this.enabled) return;
    this.steps.push({
      seq: ++this.seq,
      label,
      title,
      durationMs: 0,
      status,
      detail,
    });
  }

  /**
   * 包裹一个异步操作，自动计时并记录结果
   */
  async wrap<T>(
    label: TraceStepLabel,
    title: string,
    fn: () => Promise<{ status: TraceStepStatus; detail: Record<string, unknown>; result: T }>,
  ): Promise<T> {
    if (!this.enabled) {
      const { result } = await fn();
      return result;
    }
    const start = Date.now();
    const { status, detail, result } = await fn();
    this.steps.push({
      seq: ++this.seq,
      label,
      title,
      durationMs: Date.now() - start,
      status,
      detail,
    });
    return result;
  }

  getTrace(): TraceStep[] {
    return this.steps;
  }
}
