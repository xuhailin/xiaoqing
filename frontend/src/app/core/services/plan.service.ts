import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PlanScope = 'dev' | 'system' | 'chat';
export type PlanStatus = 'active' | 'paused' | 'archived';
export type PlanDispatchType = 'notify' | 'dev_run' | 'action' | 'noop';
export type PlanRecurrence = 'once' | 'daily' | 'weekday' | 'weekly' | 'cron';
export type OccurrenceStatus = 'pending' | 'done' | 'skipped' | 'rescheduled';

export interface PlanRecord {
  id: string;
  title: string | null;
  description: string | null;
  scope: PlanScope;
  dispatchType: PlanDispatchType;
  recurrence: PlanRecurrence;
  cronExpr: string | null;
  runAt: string | null;
  timezone: string | null;
  status: PlanStatus;
  nextRunAt: string | null;
  lastTriggeredAt: string | null;
  lastError: string | null;
  sessionId: string | null;
  conversationId: string | null;
  actionPayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskOccurrenceRecord {
  id: string;
  planId: string;
  scheduledAt: string;
  status: OccurrenceStatus;
  rescheduledTo: string | null;
  skipReason: string | null;
  dispatchedAt: string | null;
  resultRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanRequest {
  title?: string;
  description?: string;
  scope?: PlanScope;
  dispatchType?: PlanDispatchType;
  recurrence?: PlanRecurrence;
  cronExpr?: string;
  runAt?: string;
  timezone?: string;
  sessionId?: string;
  conversationId?: string;
  actionPayload?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class PlanApiService {
  private readonly base = `${environment.apiUrl}/plans`;

  constructor(private readonly http: HttpClient) {}

  list(filters?: {
    scope?: PlanScope;
    status?: PlanStatus;
    sessionId?: string;
    conversationId?: string;
  }) {
    let params = new HttpParams();
    if (filters?.scope) params = params.set('scope', filters.scope);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.sessionId) params = params.set('sessionId', filters.sessionId);
    if (filters?.conversationId) params = params.set('conversationId', filters.conversationId);
    return this.http.get<PlanRecord[]>(this.base, { params });
  }

  create(payload: CreatePlanRequest) {
    return this.http.post<PlanRecord>(this.base, payload);
  }

  update(id: string, payload: Partial<CreatePlanRequest>) {
    return this.http.patch<PlanRecord>(`${this.base}/${id}`, payload);
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }

  lifecycle(id: string, action: 'pause' | 'resume' | 'archive') {
    return this.http.post<PlanRecord>(`${this.base}/${id}/${action}`, {});
  }

  listOccurrences(planId: string, status?: OccurrenceStatus) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<TaskOccurrenceRecord[]>(`${this.base}/${planId}/occurrences`, { params });
  }
}
