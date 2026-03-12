import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Memory {
  id: string;
  type: 'mid' | 'long';
  category?: string;
  content: string;
  sourceMessageIds: string[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class MemoryService {
  private base = `${environment.apiUrl}/memories`;

  constructor(private http: HttpClient) {}

  list(type?: 'mid' | 'long', category?: string) {
    const params: Record<string, string> = {};
    if (type) params['type'] = type;
    if (category) params['category'] = category;
    const options = Object.keys(params).length > 0 ? { params } : {};
    return this.http.get<Memory[]>(this.base, options);
  }

  getOne(id: string) {
    return this.http.get<Memory>(`${this.base}/${id}`);
  }

  update(id: string, data: { content?: string; confidence?: number; sourceMessageIds?: string[] }) {
    return this.http.patch<Memory>(`${this.base}/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
