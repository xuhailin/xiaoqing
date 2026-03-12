import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface IdentityAnchorDto {
  id: string;
  label: string;
  content: string;
  sortOrder: number;
  nickname: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityAnchorHistoryDto {
  id: string;
  anchorId: string;
  previousContent: string;
  newContent: string;
  changedAt: string;
}

@Injectable({ providedIn: 'root' })
export class IdentityAnchorService {
  private base = `${environment.apiUrl}/identity-anchors`;

  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<IdentityAnchorDto[]>(this.base);
  }

  create(data: { label: string; content: string; sortOrder?: number; nickname?: string }) {
    return this.http.post<IdentityAnchorDto>(this.base, data);
  }

  update(id: string, data: { label?: string; content?: string; sortOrder?: number; nickname?: string }) {
    return this.http.patch<IdentityAnchorDto>(`${this.base}/${id}`, data);
  }

  remove(id: string) {
    return this.http.delete<IdentityAnchorDto>(`${this.base}/${id}`);
  }

  getHistory() {
    return this.http.get<IdentityAnchorHistoryDto[]>(`${this.base}/history`);
  }

  migrate() {
    return this.http.post<{ migrated: number }>(`${this.base}/migrate`, {});
  }
}
