import type { TracePointRecord } from '../trace-point/trace-point.types';

export interface DailySummaryRecord {
  id: string;
  dayKey: string;
  title: string;
  body: string;
  moodOverall: string | null;
  pointCount: number;
  sourcePointIds: string[];
  generatedBy: 'llm' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

export interface DailySummaryDraft {
  title: string;
  body: string;
  moodOverall: string | null;
}

export interface DailySummaryWithPoints extends DailySummaryRecord {
  points: TracePointRecord[];
}
