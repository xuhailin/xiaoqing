import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// ── Types aligned with backend CognitiveObservation ──

export type ObservationDimension = 'perception' | 'decision' | 'memory' | 'expression' | 'growth';
export type ObservationKind =
  | 'situation_read' | 'emotion_detected' | 'need_recognized'
  | 'strategy_chosen' | 'tool_policy_set' | 'comfort_before_advice'
  | 'memory_written' | 'memory_recalled' | 'claim_promoted' | 'anchor_updated'
  | 'style_shifted' | 'depth_adjusted'
  | 'profile_confirmed' | 'stage_promoted' | 'boundary_noted';

export interface CognitiveObservationRecord {
  id: string;
  dimension: ObservationDimension;
  kind: ObservationKind;
  title: string;
  detail: string | null;
  source: string;
  conversationId: string | null;
  messageId: string | null;
  significance: number;
  happenedAt: string;
  createdAt: string;
  payload: Record<string, unknown> | null;
  insightId: string | null;
  relatedTracePointIds: string[];
}

export interface ObservationDayGroup {
  dayKey: string;
  observations: CognitiveObservationRecord[];
  count: number;
  dominantDimension: ObservationDimension | null;
}

@Injectable({ providedIn: 'root' })
export class CognitiveTraceService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  queryObservations(params?: {
    dimension?: ObservationDimension;
    kind?: ObservationKind;
    from?: string;
    to?: string;
    minSignificance?: number;
    conversationId?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.dimension) query.set('dimension', params.dimension);
    if (params?.kind) query.set('kind', params.kind);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.minSignificance) query.set('minSignificance', String(params.minSignificance));
    if (params?.conversationId) query.set('conversationId', params.conversationId);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.http.get<CognitiveObservationRecord[]>(
      `${this.api}/cognitive-trace/observations?${query}`,
    );
  }

  queryByDay(params?: { from?: string; to?: string; minSignificance?: number }) {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.minSignificance) query.set('minSignificance', String(params.minSignificance));
    return this.http.get<ObservationDayGroup[]>(
      `${this.api}/cognitive-trace/observations/by-day?${query}`,
    );
  }
}
