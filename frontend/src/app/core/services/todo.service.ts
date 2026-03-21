import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { PlanDispatchType, TaskOccurrenceRecord } from './plan.service';

export type TodoStatus = 'open' | 'blocked' | 'done' | 'dropped';

export interface TodoSourceIdeaSummary {
  id: string;
  title: string | null;
  status: 'open' | 'promoted' | 'archived';
}

export interface TodoExecutionPlanSummary {
  id: string;
  title: string | null;
  dispatchType: PlanDispatchType;
  status: string;
  nextRunAt: string | null;
}

export interface TodoLatestTaskSummary {
  id: string;
  status: string;
  action: string | null;
  params: Record<string, unknown> | null;
  scheduledAt: string;
  resultRef: string | null;
  resultPayload: Record<string, unknown> | null;
  errorSummary: string | null;
}

export interface TodoRecord {
  id: string;
  title: string | null;
  description: string | null;
  status: TodoStatus;
  blockReason: string | null;
  dueAt: string | null;
  completedAt: string | null;
  sourceIdeaId: string | null;
  sourceIdea?: TodoSourceIdeaSummary | null;
  latestExecutionPlan?: TodoExecutionPlanSummary | null;
  latestTask?: TodoLatestTaskSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoRequest {
  title?: string;
  description?: string;
  dueAt?: string;
  sourceIdeaId?: string;
}

export interface CreateTodoTaskRequest {
  capability: string;
  params?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class TodoApiService {
  private readonly base = `${environment.apiUrl}/todos`;

  constructor(private readonly http: HttpClient) {}

  list(status?: TodoStatus) {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<TodoRecord[]>(this.base, { params });
  }

  get(id: string) {
    return this.http.get<TodoRecord>(`${this.base}/${id}`);
  }

  create(payload: CreateTodoRequest) {
    return this.http.post<TodoRecord>(this.base, payload);
  }

  update(id: string, payload: Partial<CreateTodoRequest> & { status?: TodoStatus | null }) {
    return this.http.patch<TodoRecord>(`${this.base}/${id}`, payload);
  }

  createTask(id: string, payload: CreateTodoTaskRequest) {
    return this.http.post<{ todo: TodoRecord; plan: TodoExecutionPlanSummary }>(`${this.base}/${id}/create-task`, payload);
  }
}
