import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type IdeaStatus = 'open' | 'promoted' | 'archived';

export interface IdeaPromotedTodoSummary {
  id: string;
  title: string | null;
  status: 'open' | 'done' | 'dropped';
  dueAt: string | null;
}

export interface IdeaRecord {
  id: string;
  title: string | null;
  content: string;
  status: IdeaStatus;
  promotedTodoId: string | null;
  promotedTodo?: IdeaPromotedTodoSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIdeaRequest {
  title?: string;
  content?: string;
}

export interface PromoteIdeaRequest {
  title?: string;
  description?: string;
  dueAt?: string;
}

@Injectable({ providedIn: 'root' })
export class IdeaApiService {
  private readonly base = `${environment.apiUrl}/ideas`;

  constructor(private readonly http: HttpClient) {}

  list(status?: IdeaStatus) {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<IdeaRecord[]>(this.base, { params });
  }

  get(id: string) {
    return this.http.get<IdeaRecord>(`${this.base}/${id}`);
  }

  create(payload: CreateIdeaRequest) {
    return this.http.post<IdeaRecord>(this.base, payload);
  }

  update(id: string, payload: Partial<CreateIdeaRequest> & { status?: IdeaStatus }) {
    return this.http.patch<IdeaRecord>(`${this.base}/${id}`, payload);
  }

  promote(id: string, payload: PromoteIdeaRequest) {
    return this.http.post<{ idea: IdeaRecord; todo: IdeaPromotedTodoSummary }>(`${this.base}/${id}/promote`, payload);
  }
}
