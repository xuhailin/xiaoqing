import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PlanScope = 'dev' | 'system' | 'chat';
export type PlanStatus = 'active' | 'paused' | 'archived';
export type PlanDispatchType = 'notify' | 'dev_run' | 'action' | 'noop';
export type PlanRecurrence = 'once' | 'daily' | 'weekday' | 'weekly' | 'cron';
export type OccurrenceStatus = 'pending' | 'done' | 'skipped' | 'rescheduled';
export type TaskMode = 'execute' | 'notify';

export interface TaskTemplate {
  action: string;
  params?: Record<string, unknown>;
  mode?: TaskMode;
}

export interface TaskOccurrencePlanSummary {
  id: string;
  title: string | null;
  scope: PlanScope;
  dispatchType: PlanDispatchType;
  sourceTodoId?: string | null;
  sourceTodo?: {
    title: string | null;
  } | null;
}

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
  taskTemplates: TaskTemplate[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskOccurrenceRecord {
  id: string;
  planId: string;
  scheduledAt: string;
  status: OccurrenceStatus;
  action: string | null;
  params: Record<string, unknown> | null;
  mode: TaskMode;
  rescheduledTo: string | null;
  skipReason: string | null;
  dispatchedAt: string | null;
  resultRef: string | null;
  resultPayload: Record<string, unknown> | null;
  plan?: TaskOccurrencePlanSummary;
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
  taskTemplates?: TaskTemplate[];
}

export interface ListTaskOccurrenceFilters {
  from?: string;
  to?: string;
  planId?: string;
  status?: OccurrenceStatus;
  conversationId?: string;
  limit?: number;
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

  get(id: string) {
    return this.http.get<PlanRecord>(`${this.base}/${id}`);
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

  listOccurrences(planId: string, status?: OccurrenceStatus, limit?: number) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (limit !== undefined) params = params.set('limit', String(limit));
    return this.http.get<TaskOccurrenceRecord[]>(`${this.base}/${planId}/occurrences`, { params });
  }

  listTaskOccurrences(filters?: ListTaskOccurrenceFilters) {
    let params = new HttpParams();
    if (filters?.from) params = params.set('from', filters.from);
    if (filters?.to) params = params.set('to', filters.to);
    if (filters?.planId) params = params.set('planId', filters.planId);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.conversationId) params = params.set('conversationId', filters.conversationId);
    if (filters?.limit !== undefined) params = params.set('limit', String(filters.limit));
    return this.http.get<TaskOccurrenceRecord[]>(`${this.base}/occurrences`, { params });
  }
}
