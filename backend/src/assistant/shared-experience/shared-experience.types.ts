export type SharedExperienceCategory =
  | 'emotional_support'
  | 'co_thinking'
  | 'celebration'
  | 'crisis'
  | 'milestone'
  | 'daily_ritual';

export type SharedExperienceTone = 'warm' | 'bittersweet' | 'proud' | 'relieved';

export interface SharedExperienceRecord {
  id: string;
  title: string;
  summary: string;
  category: SharedExperienceCategory;
  emotionalTone: SharedExperienceTone | null;
  significance: number;
  happenedAt: Date;
  conversationIds: string[];
  relatedEntityIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SharedExperienceQuery {
  category?: SharedExperienceCategory;
  minSignificance?: number;
  limit?: number;
}

export interface SharedExperiencePromoteResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface SharedExperienceFollowupDecision {
  experienceId: string;
  title: string;
  outcome: 'created' | 'skipped';
  reason: string;
  planId?: string;
  scheduledFor?: Date;
  skipReason?: string;
}

export interface SharedExperienceFollowupGenerateResult {
  created: number;
  skipped: number;
  total: number;
  decisions: SharedExperienceFollowupDecision[];
}
