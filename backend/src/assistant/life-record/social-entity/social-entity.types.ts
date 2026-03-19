export type SocialRelation = 'family' | 'friend' | 'colleague' | 'romantic' | 'pet' | 'other';

export interface SocialEntityRecord {
  id: string;
  name: string;
  aliases: string[];
  relation: SocialRelation;
  description: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  mentionCount: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialEntityQuery {
  relation?: SocialRelation;
  sortBy?: 'mentionCount' | 'lastSeenAt' | 'name';
  limit?: number;
}

export interface SyncResult {
  created: number;
  updated: number;
  total: number;
  entityIds: string[];
}

export interface SocialEntityClassificationResult {
  relation: SocialRelation;
  description: string;
  confidence: number;
  aliasHints: string[];
}

export interface SocialEntityClassifyBatchResult {
  classified: number;
  merged: number;
  total: number;
  entityIds: string[];
}
