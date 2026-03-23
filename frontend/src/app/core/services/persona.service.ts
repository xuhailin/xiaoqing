import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PersonaDto {
  id: string;
  identity: string;
  personality: string;
  valueBoundary: string;
  behaviorForbidden: string;
  expressionRules: string;
  metaFilterPolicy: string;
  evolutionAllowed: string;
  evolutionForbidden: string;
  version: number;
}

export interface PersonaOptions {
  fieldLabels: Record<string, string>;
}

export type PersonaField =
  | 'identity'
  | 'personality'
  | 'valueBoundary'
  | 'behaviorForbidden'
  | 'expressionRules';

export type UserProfileField =
  | 'preferredVoiceStyle'
  | 'praisePreference'
  | 'responseRhythm';

export interface EvolutionChange {
  field: PersonaField | string;
  content: string;
  reason: string;
  layer?: 'persona-core' | 'persona-boundary' | 'expression' | 'user-preference';
  risk?: 'high' | 'medium' | 'low';
  reroutedFrom?: PersonaField | string;
  targetField?: PersonaField | UserProfileField | string;
}

export interface EvolutionPreviewField {
  field: PersonaField | UserProfileField | string;
  before: string;
  after: string;
  added: string[];
  removed: string[];
  layer: 'persona-core' | 'persona-boundary' | 'expression' | 'user-preference';
  risk: 'high' | 'medium' | 'low';
}

export interface EvolutionPreview {
  changes: EvolutionChange[];
  fields: EvolutionPreviewField[];
}

@Injectable({ providedIn: 'root' })
export class PersonaService {
  private base = `${environment.apiUrl}/persona`;

  constructor(private http: HttpClient) {}

  get() {
    return this.http.get<PersonaDto>(this.base);
  }

  getOptions() {
    return this.http.get<PersonaOptions>(`${this.base}/options`);
  }

  update(data: Partial<PersonaDto>) {
    return this.http.patch<PersonaDto>(this.base, data);
  }

  suggestEvolution(conversationId: string) {
    return this.http.post<{ changes: EvolutionChange[] }>(
      `${this.base}/evolve/suggest`,
      { conversationId },
    );
  }

  confirmEvolution(changes: EvolutionChange[]) {
    return this.http.post<{
      accepted: boolean;
      reason?: string;
      persona?: PersonaDto;
    }>(`${this.base}/evolve/confirm`, { changes });
  }

  previewEvolution(changes: EvolutionChange[]) {
    return this.http.post<{
      accepted: boolean;
      reason?: string;
      preview?: EvolutionPreview;
    }>(`${this.base}/evolve/preview`, { changes });
  }

  /** 获取自动总结后生成的待确认进化建议 */
  getPendingEvolution() {
    return this.http.get<{
      changes: EvolutionChange[];
      triggerReason: string;
      createdAt: string;
    } | null>(`${this.base}/evolve/pending`);
  }

  /** 清除待确认进化建议（确认或拒绝后调用） */
  clearPendingEvolution() {
    return this.http.delete<{ ok: boolean }>(`${this.base}/evolve/pending`);
  }

}
