import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type SocialRelation = 'family' | 'friend' | 'colleague' | 'romantic' | 'pet' | 'other';
export type SocialRelationSortBy = 'mentionCount' | 'lastSeenAt' | 'name';
export type SocialRelationTrend = 'improving' | 'stable' | 'declining';
export type SocialInsightScope = 'weekly' | 'monthly';

export interface SocialEntityRecord {
  id: string;
  name: string;
  aliases: string[];
  relation: SocialRelation;
  description: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  mentionCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SocialRelationEdgeRecord {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  quality: number;
  trend: SocialRelationTrend;
  lastEventAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialInsightRecord {
  id: string;
  scope: SocialInsightScope;
  periodKey: string;
  content: string;
  relatedEntityIds: string[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RelationService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  listEntities(params?: {
    relation?: SocialRelation;
    sortBy?: SocialRelationSortBy;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.relation) query.set('relation', params.relation);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    return this.http.get<SocialEntityRecord[]>(this.buildUrl('social-entities', query));
  }

  updateEntity(
    id: string,
    body: Partial<Pick<SocialEntityRecord, 'relation' | 'description' | 'aliases' | 'tags'>>,
  ) {
    return this.http.patch<SocialEntityRecord>(`${this.api}/social-entities/${id}`, body);
  }

  mergeEntities(sourceId: string, targetId: string) {
    return this.http.post<SocialEntityRecord>(`${this.api}/social-entities/merge`, {
      sourceId,
      targetId,
    });
  }

  listEdges(params?: {
    toEntityId?: string;
    trend?: SocialRelationTrend;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.toEntityId) query.set('toEntityId', params.toEntityId);
    if (params?.trend) query.set('trend', params.trend);
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    return this.http.get<SocialRelationEdgeRecord[]>(
      this.buildUrl('social-relation-edges', query),
    );
  }

  listInsights(params?: {
    scope?: SocialInsightScope;
    limit?: number;
    minConfidence?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.scope) query.set('scope', params.scope);
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    if (typeof params?.minConfidence === 'number') {
      query.set('minConfidence', String(params.minConfidence));
    }
    return this.http.get<SocialInsightRecord[]>(this.buildUrl('social-insights', query));
  }

  private buildUrl(path: string, query: URLSearchParams) {
    const suffix = query.toString();
    return `${this.api}/${path}${suffix ? `?${suffix}` : ''}`;
  }
}
