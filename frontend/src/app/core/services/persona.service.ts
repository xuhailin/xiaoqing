import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PersonaDto {
  id: string;
  personaKey: string;
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

export interface PersonaSlotDto {
  id: string;
  personaKey: string;
  identity: string;
  personality: string;
  version: number;
  updatedAt: string;
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

export type PersonaRuleCategory =
  | 'BREVITY'
  | 'TONE'
  | 'PACING'
  | 'BOUNDARY'
  | 'ERROR_HANDLING';

export type PersonaRuleStatus = 'CANDIDATE' | 'STABLE' | 'CORE' | 'DEPRECATED';

export type PersonaRuleSource = 'DEFAULT' | 'EVOLVED' | 'USER';

export type PersonaRuleProtect = 'NORMAL' | 'LOCKED';

export interface PersonaRuleDto {
  id: string;
  key: string;
  content: string;
  category: PersonaRuleCategory;
  status: PersonaRuleStatus;
  weight: number;
  source: PersonaRuleSource;
  protectLevel: PersonaRuleProtect;
  pendingContent?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersonaRuleMergeDraft {
  key: string;
  content: string;
  category: PersonaRuleCategory;
  weight?: number;
  reason: string;
}

export interface EvolutionChange {
  field: PersonaField | string;
  content: string;
  reason: string;
  layer?: 'persona-core' | 'persona-boundary' | 'expression' | 'user-preference';
  risk?: 'high' | 'medium' | 'low';
  reroutedFrom?: PersonaField | string;
  targetField?: PersonaField | UserProfileField | string;
  ruleDrafts?: PersonaRuleMergeDraft[];
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
  expressionRuleDrafts?: PersonaRuleMergeDraft[];
}

@Injectable({ providedIn: 'root' })
export class PersonaService {
  private base = `${environment.apiUrl}/persona`;
  private rulesBase = `${environment.apiUrl}/persona/rules`;

  constructor(private http: HttpClient) {}

  get(personaKey?: string) {
    if (!personaKey?.trim()) return this.http.get<PersonaDto>(this.base);
    return this.http.get<PersonaDto>(`${this.base}?personaKey=${encodeURIComponent(personaKey)}`);
  }

  getOptions() {
    return this.http.get<PersonaOptions>(`${this.base}/options`);
  }

  update(data: Partial<PersonaDto>, personaKey?: string) {
    if (!personaKey?.trim()) return this.http.patch<PersonaDto>(this.base, data);
    return this.http.patch<PersonaDto>(`${this.base}?personaKey=${encodeURIComponent(personaKey)}`, data);
  }

  getActiveSlots() {
    return this.http.get<PersonaSlotDto[]>(`${this.base}/list`);
  }

  createPersonaSlot(payload: { personaKey?: string; basePersonaKey?: string }) {
    return this.http.post<PersonaDto>(`${this.base}/create`, payload);
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

  getRules() {
    return this.http.get<PersonaRuleDto[]>(this.rulesBase);
  }

  updateRule(
    key: string,
    patch: Partial<{
      content: string;
      weight: number;
      status: PersonaRuleStatus;
      protectLevel: PersonaRuleProtect;
      pendingContent: string | null;
      category: PersonaRuleCategory;
      source: PersonaRuleSource;
    }>,
  ) {
    return this.http.patch<PersonaRuleDto>(`${this.rulesBase}/${encodeURIComponent(key)}`, patch);
  }

  promoteRule(key: string) {
    return this.http.post<PersonaRuleDto>(
      `${this.rulesBase}/${encodeURIComponent(key)}/promote`,
      {},
    );
  }

  deprecateRule(key: string) {
    return this.http.delete<void>(`${this.rulesBase}/${encodeURIComponent(key)}`);
  }
}
