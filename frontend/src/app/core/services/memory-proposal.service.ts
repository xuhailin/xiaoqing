import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type MemoryProposalStatus = 'pending' | 'approved' | 'rejected' | 'merged';

export interface MemoryProposalRecord {
  id: string;
  delegationId: string | null;
  proposerAgentId: string;
  ownerAgentId: string;
  kind: string;
  content: string;
  reason: string | null;
  confidence: number;
  scope: string;
  status: MemoryProposalStatus;
  reviewNote: string | null;
  resultMemoryId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class MemoryProposalService {
  private readonly base = `${environment.apiUrl}/agent-bus/memory-proposals`;

  constructor(private readonly http: HttpClient) {}

  list(params?: { status?: MemoryProposalStatus; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.http.get<MemoryProposalRecord[]>(`${this.base}${qs ? `?${qs}` : ''}`);
  }

  approve(id: string, reviewNote?: string) {
    return this.http.post<MemoryProposalRecord>(`${this.base}/${id}/approve`, { reviewNote });
  }

  reject(id: string, reviewNote?: string) {
    return this.http.post<MemoryProposalRecord>(`${this.base}/${id}/reject`, { reviewNote });
  }

  merge(id: string, memoryId: string, reviewNote?: string) {
    return this.http.post<MemoryProposalRecord>(`${this.base}/${id}/merge`, { memoryId, reviewNote });
  }
}
