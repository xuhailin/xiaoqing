import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface WorldStateDto {
  city?: string;
  timezone?: string;
  language?: string;
  device?: string;
  conversationMode?: string;
}

@Injectable({ providedIn: 'root' })
export class WorldStateService {
  private base = `${environment.apiUrl}/conversations`;

  constructor(private http: HttpClient) {}

  get(conversationId: string) {
    return this.http.get<WorldStateDto | null>(`${this.base}/${conversationId}/world-state`);
  }

  update(conversationId: string, data: Partial<WorldStateDto>) {
    return this.http.patch<WorldStateDto | null>(`${this.base}/${conversationId}/world-state`, data);
  }
}
