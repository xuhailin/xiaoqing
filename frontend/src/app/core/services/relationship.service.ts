import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type RelationshipStage = 'early' | 'familiar' | 'steady';
export type MilestoneType = 'stage_change' | 'shared_experience' | 'rhythm_shift';
export type SharedExperienceCategory =
  | 'emotional_support'
  | 'co_thinking'
  | 'celebration'
  | 'crisis'
  | 'milestone'
  | 'daily_ritual';
export type SharedExperienceTone = 'warm' | 'bittersweet' | 'proud' | 'relieved';
export type RelationImpact = 'deepened' | 'neutral' | 'strained' | 'repaired';

export interface RhythmPreferenceDto {
  key: string;
  level: string;
  confidence: number;
}

export interface MilestoneDto {
  label: string;
  date: string;
  type: MilestoneType;
}

export interface RelationshipOverviewDto {
  stage: RelationshipStage;
  trustScore: number;
  closenessScore: number;
  rhythmPreferences: RhythmPreferenceDto[];
  milestones: MilestoneDto[];
  summary: string;
}

export interface SharedExperienceRecord {
  id: string;
  title: string;
  summary: string;
  category: SharedExperienceCategory;
  emotionalTone: SharedExperienceTone | null;
  significance: number;
  happenedAt: string;
  conversationIds: string[];
  relatedEntityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionReflectionRecord {
  id: string;
  conversationId: string;
  summary: string;
  relationImpact: RelationImpact;
  rhythmNote: string | null;
  sharedMoment: boolean;
  momentHint: string | null;
  trustDelta: number;
  closenessDelta: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class RelationshipService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getOverview() {
    return this.http.get<RelationshipOverviewDto>(`${this.api}/relationship/overview`);
  }

  listSharedExperiences(params?: {
    category?: SharedExperienceCategory;
    minSignificance?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (typeof params?.minSignificance === 'number') {
      query.set('minSignificance', String(params.minSignificance));
    }
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    return this.http.get<SharedExperienceRecord[]>(this.buildUrl('shared-experiences', query));
  }

  listSessionReflections(params?: {
    conversationId?: string;
    relationImpact?: RelationImpact;
    sharedMomentOnly?: boolean;
    since?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.conversationId) query.set('conversationId', params.conversationId);
    if (params?.relationImpact) query.set('relationImpact', params.relationImpact);
    if (typeof params?.sharedMomentOnly === 'boolean') {
      query.set('sharedMomentOnly', String(params.sharedMomentOnly));
    }
    if (params?.since) query.set('since', params.since);
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    return this.http.get<SessionReflectionRecord[]>(this.buildUrl('session-reflections', query));
  }

  private buildUrl(path: string, query: URLSearchParams) {
    const suffix = query.toString();
    return `${this.api}/${path}${suffix ? `?${suffix}` : ''}`;
  }
}
