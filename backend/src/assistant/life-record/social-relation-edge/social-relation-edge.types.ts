export type SocialRelationTrend = 'improving' | 'stable' | 'declining';

export interface SocialRelationEdgeRecord {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  quality: number;
  trend: SocialRelationTrend;
  lastEventAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelevantSocialRelationEdgeRecord extends SocialRelationEdgeRecord {
  entityName: string;
  entityAliases: string[];
  entityRelation: string;
}

export interface SocialRelationEdgeQuery {
  toEntityId?: string;
  trend?: SocialRelationTrend;
  limit?: number;
}

export interface SocialRelationEdgeSyncResult {
  created: number;
  updated: number;
  total: number;
}

export type SocialCarePlanOutcome = 'created' | 'skipped';

export interface SocialCarePlanDecision {
  entityId: string;
  entityName: string;
  outcome: SocialCarePlanOutcome;
  reason: string;
  planId?: string;
  scheduledFor?: Date;
  skipReason?: string;
}

export interface SocialCarePlanGenerateResult {
  created: number;
  skipped: number;
  total: number;
  decisions: SocialCarePlanDecision[];
}
