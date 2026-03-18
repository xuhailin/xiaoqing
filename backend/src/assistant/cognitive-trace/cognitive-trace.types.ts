import type { CognitiveTurnState } from '../cognitive-pipeline/cognitive-pipeline.types';

// ── Dimensions & Kinds ──────────────────────────────────────

export type ObservationDimension =
  | 'perception'
  | 'decision'
  | 'memory'
  | 'expression'
  | 'growth';

export type ObservationKind =
  // perception
  | 'situation_read'
  | 'emotion_detected'
  | 'need_recognized'
  // decision
  | 'strategy_chosen'
  | 'tool_policy_set'
  | 'comfort_before_advice'
  // memory
  | 'memory_written'
  | 'memory_recalled'
  | 'claim_promoted'
  | 'anchor_updated'
  // expression
  | 'style_shifted'
  | 'depth_adjusted'
  // growth
  | 'profile_confirmed'
  | 'stage_promoted'
  | 'boundary_noted';

// ── TurnCognitiveResult: 一个回合的认知产出汇总 ──────────────

export interface MemoryOp {
  action: 'write' | 'recall';
  memoryId?: string;
  category: string;
  content?: string;
}

export interface ClaimOp {
  action: 'promote' | 'create';
  claimId?: string;
  fromStatus?: string;
  toStatus?: string;
}

export interface GrowthOp {
  type: 'profile_pending' | 'profile_confirmed' | 'stage_check' | 'boundary';
  detail: string;
}

export interface TurnCognitiveResult {
  conversationId: string;
  messageId: string;
  happenedAt: Date;

  cognitiveState: CognitiveTurnState;

  memoryOps: MemoryOp[];
  claimOps: ClaimOp[];
  growthOps: GrowthOp[];

  /** 本轮策略是否与常规/前一轮不同 */
  strategyShifted: boolean;
}

// ── Observation record ──────────────────────────────────────

export interface CognitiveObservationRecord {
  id: string;
  dimension: ObservationDimension;
  kind: ObservationKind;
  title: string;
  detail: string | null;
  source: string;
  conversationId: string | null;
  messageId: string | null;
  significance: number;
  happenedAt: Date;
  createdAt: Date;
  payload: Record<string, unknown> | null;
  insightId: string | null;
  relatedTracePointIds: string[];
}

export interface CreateObservationDto {
  dimension: ObservationDimension;
  kind: ObservationKind;
  title: string;
  detail?: string;
  source: string;
  conversationId?: string;
  messageId?: string;
  significance: number;
  happenedAt?: Date;
  payload?: Record<string, unknown>;
  relatedTracePointIds?: string[];
}

export interface ObservationDayGroup {
  dayKey: string;
  observations: CognitiveObservationRecord[];
  count: number;
  dominantDimension: ObservationDimension | null;
}

export interface ObservationQuery {
  dimension?: ObservationDimension;
  kind?: ObservationKind;
  since?: Date;
  until?: Date;
  minSignificance?: number;
  conversationId?: string;
  limit?: number;
}
