export type ClaimType =
  | 'JUDGEMENT_PATTERN'
  | 'VALUE'
  | 'INTERACTION_PREFERENCE'
  | 'EMOTIONAL_TENDENCY'
  | 'RELATION_RHYTHM';

export type ClaimStatus =
  | 'CANDIDATE'
  | 'WEAK'
  | 'STABLE'
  | 'CORE'
  | 'DEPRECATED';

export type EvidencePolarity = 'SUPPORT' | 'CONTRA' | 'NEUTRAL';

export interface ClaimEvidenceDraft {
  messageId?: string;
  sessionId?: string;
  snippet: string;
  polarity: EvidencePolarity;
  weight?: number;
}

export interface ClaimDraft {
  userKey?: string;
  type: ClaimType;
  key: string;
  value: unknown;
  confidence: number;
  sourceModel?: string;
  contextTags?: string[];
  evidence: ClaimEvidenceDraft;
}

export interface SessionStateDraft {
  userKey?: string;
  sessionId: string;
  state: Record<string, unknown>;
  confidence: number;
  ttlSeconds: number;
  sourceModel?: string;
}

export interface LastReflection {
  quality: 'good' | 'suboptimal' | 'failed';
  adjustmentHint?: string;
  timestamp: Date;
}

export interface ClaimRecord {
  id: string;
  userKey: string;
  type: ClaimType;
  key: string;
  confidence: number;
  evidenceCount: number;
  counterEvidenceCount: number;
  status: ClaimStatus;
  updatedAt: Date;
}
