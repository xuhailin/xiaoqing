export type SocialInsightScope = 'weekly' | 'monthly';

export interface SocialInsightRecord {
  id: string;
  scope: SocialInsightScope;
  periodKey: string;
  content: string;
  relatedEntityIds: string[];
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialInsightQuery {
  scope?: SocialInsightScope;
  limit?: number;
  minConfidence?: number;
}

export interface SocialInsightGenerateResult {
  created: boolean;
  record: SocialInsightRecord | null;
}
