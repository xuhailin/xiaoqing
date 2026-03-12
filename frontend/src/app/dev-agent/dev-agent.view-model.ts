export type DevTimelineStepStatus = 'planned' | 'running' | 'success' | 'failed';

export interface DevTimelineStep {
  id: string;
  title: string;
  command: string;
  executor: string;
  strategy: string | null;
  status: DevTimelineStepStatus;
  output: string | null;
  error: string | null;
}

