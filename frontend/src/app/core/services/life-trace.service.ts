import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// ── Types aligned with backend TracePoint / DailySummary ──

export type TracePointKind = 'event' | 'mood' | 'mention' | 'plan' | 'reflection';

export interface TracePointRecord {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  kind: TracePointKind;
  content: string;
  happenedAt: string | null;
  mood: string | null;
  people: string[];
  tags: string[];
  extractedBy: 'batch' | 'realtime' | 'backfill';
  confidence: number;
  createdAt: string;
}

export interface TracePointDayGroup {
  dayKey: string;
  points: TracePointRecord[];
  moodSummary: string | null;
  count: number;
}

export interface DailySummaryRecord {
  id: string;
  dayKey: string;
  title: string;
  body: string;
  moodOverall: string | null;
  pointCount: number;
  sourcePointIds: string[];
  generatedBy: 'llm' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface DailySummaryWithPoints extends DailySummaryRecord {
  points: TracePointRecord[];
}

@Injectable({ providedIn: 'root' })
export class LifeTraceService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  // ── Trace Points ──

  queryPoints(params?: { since?: string; until?: string; kind?: TracePointKind; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.since) query.set('since', params.since);
    if (params?.until) query.set('until', params.until);
    if (params?.kind) query.set('kind', params.kind);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.http.get<TracePointRecord[]>(`${this.api}/trace-points?${query}`);
  }

  queryByDay(params?: { since?: string; until?: string }) {
    const query = new URLSearchParams();
    if (params?.since) query.set('since', params.since);
    if (params?.until) query.set('until', params.until);
    return this.http.get<TracePointDayGroup[]>(`${this.api}/trace-points/by-day?${query}`);
  }

  getPointsForDay(dayKey: string) {
    return this.http.get<TracePointRecord[]>(`${this.api}/trace-points/day/${dayKey}`);
  }

  // ── Daily Summaries ──

  listSummaries(params?: { limit?: number; since?: string; until?: string }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.since) query.set('since', params.since);
    if (params?.until) query.set('until', params.until);
    return this.http.get<DailySummaryRecord[]>(`${this.api}/daily-summaries?${query}`);
  }

  getSummaryForDay(dayKey: string) {
    return this.http.get<DailySummaryWithPoints>(`${this.api}/daily-summaries/${dayKey}`);
  }
}
