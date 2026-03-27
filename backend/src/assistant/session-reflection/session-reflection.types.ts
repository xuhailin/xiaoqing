export type RelationImpact = 'deepened' | 'neutral' | 'strained' | 'repaired';

export interface ReflectionResult {
  summary: string;
  relationImpact: RelationImpact;
  rhythmNote: string | null;
  sharedMoment: boolean;
  momentHint: string | null;
  trustDelta: number;
  closenessDelta: number;
  socialRelationSignals?: Array<{
    entityName: string;
    impact: Exclude<RelationImpact, 'neutral'>;
    evidence: string;
  }>;
  newRhythmSignal?: {
    claimKey: string;
    level: 'low' | 'mid' | 'high';
    evidence: string;
  };
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
  socialRelationSignals?: ReflectionResult['socialRelationSignals'];
  newRhythmSignal?: ReflectionResult['newRhythmSignal'];
  createdAt: Date;
}

export interface SessionReflectionQuery {
  conversationId?: string;
  conversationIds?: string[];
  relationImpact?: RelationImpact;
  sharedMomentOnly?: boolean;
  since?: Date;
  limit?: number;
}
