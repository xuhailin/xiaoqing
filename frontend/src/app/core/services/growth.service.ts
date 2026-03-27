import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type GrowthItemType = 'cognitive_profile' | 'relationship_state';

export interface PendingGrowthItem {
  id: string;
  type: GrowthItemType;
  content: string;
  kind?: string;
  stage?: string;
  status: 'pending' | 'confirmed' | 'rejected';
  sourceMessageIds: string[];
  createdAt: string;
}

export interface GrowthContextDto {
  cognitiveProfiles: string[];
  judgmentPatterns: string[];
  valuePriorities: string[];
  rhythmPatterns: string[];
  relationshipNotes: string[];
  boundaryNotes: string[];
}

@Injectable({ providedIn: 'root' })
export class GrowthService {
  private base = `${environment.apiUrl}/growth`;

  constructor(private http: HttpClient) {}

  getPending() {
    return this.http.get<PendingGrowthItem[]>(`${this.base}/pending`);
  }

  getContext() {
    return this.http.get<GrowthContextDto>(`${this.base}/context`);
  }

  confirm(id: string, type: GrowthItemType) {
    return this.http.patch<{ ok: boolean }>(`${this.base}/${id}/confirm`, { type });
  }

  reject(id: string, type: GrowthItemType) {
    return this.http.patch<{ ok: boolean }>(`${this.base}/${id}/reject`, { type });
  }
}
