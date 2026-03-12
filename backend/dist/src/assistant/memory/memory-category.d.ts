export declare enum MemoryCategory {
    IDENTITY_ANCHOR = "identity_anchor",
    SHARED_FACT = "shared_fact",
    COMMITMENT = "commitment",
    CORRECTION = "correction",
    SOFT_PREFERENCE = "soft_preference",
    GENERAL = "general",
    JUDGMENT_PATTERN = "judgment_pattern",
    VALUE_PRIORITY = "value_priority",
    RHYTHM_PATTERN = "rhythm_pattern",
    COGNITIVE_PROFILE = "cognitive_profile",
    RELATIONSHIP_STATE = "relationship_state",
    BOUNDARY_EVENT = "boundary_event"
}
export declare const VALID_CATEGORIES: string[];
export declare const COGNITIVE_CATEGORIES: MemoryCategory[];
export interface DecayConfig {
    halfLifeDays: number;
    hitBoost: number;
    minScore: number;
}
export declare const DECAY_CONFIG: Record<MemoryCategory, DecayConfig | null>;
export declare const CATEGORY_RECALL_WEIGHT: Record<MemoryCategory, number>;
export declare const CATEGORY_DUPLICATE_THRESHOLD: Record<MemoryCategory, number>;
export declare enum WriteDecision {
    WRITE = "write",
    WRITE_AND_LINK = "write_and_link",
    OVERWRITE = "overwrite",
    MERGE = "merge",
    SKIP = "skip"
}
export interface WriteDecisionResult {
    decision: WriteDecision;
    targetMemoryId?: string;
    reason: string;
}
export interface WriteCandidate {
    type: 'mid' | 'long';
    category: MemoryCategory;
    content: string;
    sourceMessageIds: string[];
    confidence: number;
    isNegation: boolean;
    isOneOff: boolean;
}
