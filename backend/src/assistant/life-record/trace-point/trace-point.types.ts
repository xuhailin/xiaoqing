export type TracePointKind = 'event' | 'mood' | 'mention' | 'plan' | 'reflection' | 'relation_event';

export type TracePointExtractedBy = 'batch' | 'realtime' | 'backfill';

export interface TracePointDraft {
  kind: TracePointKind;
  content: string;
  happenedAt?: Date | null;
  mood?: string | null;
  people?: string[];
  tags?: string[];
}

export interface TracePointRecord {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  kind: TracePointKind;
  content: string;
  happenedAt: Date | null;
  mood: string | null;
  people: string[];
  tags: string[];
  extractedBy: TracePointExtractedBy;
  confidence: number;
  createdAt: Date;
}

export interface TracePointQuery {
  userId?: string;
  conversationId?: string;
  since?: Date;
  until?: Date;
  kind?: TracePointKind;
  limit?: number;
}

export interface TracePointDayGroup {
  dayKey: string; // 'YYYY-MM-DD'
  points: TracePointRecord[];
  moodSummary: string | null; // 当天最频繁的 mood
  count: number;
}
