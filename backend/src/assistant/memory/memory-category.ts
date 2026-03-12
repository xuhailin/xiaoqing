/**
 * 基础记忆能力 — 类型定义与衰减配置
 *
 * 原有 6 类 + 记忆分析引擎 3 类长期认知：
 * - identity_anchor: 身份锚定，不衰减
 * - shared_fact:     共识事实，长半衰期
 * - commitment:      弱承诺感知，短半衰期
 * - correction:      纠错记忆，中半衰期
 * - soft_preference: 软偏好倾向，中半衰期
 * - general:         通用（兼容现有 mid/long）
 * - judgment_pattern: 判断模式（长期认知）
 * - value_priority:   价值排序（长期认知）
 * - rhythm_pattern:   关系节奏特征（长期认知）
 * - cognitive_profile: 成长层的稳定认知画像
 * - relationship_state: 成长层的关系状态快照
 * - boundary_event: 边界与治理相关事件
 */

export enum MemoryCategory {
  IDENTITY_ANCHOR = 'identity_anchor',
  SHARED_FACT = 'shared_fact',
  COMMITMENT = 'commitment',
  CORRECTION = 'correction',
  SOFT_PREFERENCE = 'soft_preference',
  GENERAL = 'general',
  JUDGMENT_PATTERN = 'judgment_pattern',
  VALUE_PRIORITY = 'value_priority',
  RHYTHM_PATTERN = 'rhythm_pattern',
  COGNITIVE_PROFILE = 'cognitive_profile',
  RELATIONSHIP_STATE = 'relationship_state',
  BOUNDARY_EVENT = 'boundary_event',
}

export const VALID_CATEGORIES = Object.values(MemoryCategory) as string[];

/** 记忆分析引擎输出的三类长期认知，MERGE 时只加置信度不追加内容 */
export const COGNITIVE_CATEGORIES: MemoryCategory[] = [
  MemoryCategory.JUDGMENT_PATTERN,
  MemoryCategory.VALUE_PRIORITY,
  MemoryCategory.RHYTHM_PATTERN,
  MemoryCategory.COGNITIVE_PROFILE,
  MemoryCategory.RELATIONSHIP_STATE,
];

export interface DecayConfig {
  /** 半衰期（天）：经过此天数后，rawDecay 降至 0.5 */
  halfLifeDays: number;
  /** 每次命中增加的衰减分加成 */
  hitBoost: number;
  /** 低于此分进入候选删除 */
  minScore: number;
}

/**
 * 各 category 的衰减配置。null 表示不参与衰减（frozen）。
 */
export const DECAY_CONFIG: Record<MemoryCategory, DecayConfig | null> = {
  [MemoryCategory.IDENTITY_ANCHOR]: null,
  [MemoryCategory.SHARED_FACT]: {
    halfLifeDays: 90,
    hitBoost: 0.15,
    minScore: 0.2,
  },
  [MemoryCategory.COMMITMENT]: {
    halfLifeDays: 14,
    hitBoost: 0.1,
    minScore: 0.3,
  },
  [MemoryCategory.CORRECTION]: {
    halfLifeDays: 60,
    hitBoost: 0.2,
    minScore: 0.2,
  },
  [MemoryCategory.SOFT_PREFERENCE]: {
    halfLifeDays: 45,
    hitBoost: 0.1,
    minScore: 0.25,
  },
  [MemoryCategory.GENERAL]: {
    halfLifeDays: 30,
    hitBoost: 0.05,
    minScore: 0.3,
  },
  [MemoryCategory.JUDGMENT_PATTERN]: {
    halfLifeDays: 45,
    hitBoost: 0.1,
    minScore: 0.25,
  },
  [MemoryCategory.VALUE_PRIORITY]: {
    halfLifeDays: 45,
    hitBoost: 0.1,
    minScore: 0.25,
  },
  [MemoryCategory.RHYTHM_PATTERN]: {
    halfLifeDays: 45,
    hitBoost: 0.1,
    minScore: 0.25,
  },
  [MemoryCategory.COGNITIVE_PROFILE]: {
    halfLifeDays: 60,
    hitBoost: 0.12,
    minScore: 0.22,
  },
  [MemoryCategory.RELATIONSHIP_STATE]: {
    halfLifeDays: 30,
    hitBoost: 0.1,
    minScore: 0.28,
  },
  [MemoryCategory.BOUNDARY_EVENT]: {
    halfLifeDays: 21,
    hitBoost: 0.08,
    minScore: 0.3,
  },
};

/**
 * 召回时的 category 权重乘数，影响最终排序。
 * identity_anchor 始终注入，不参与竞争排序，此处权重仅作 fallback。
 */
export const CATEGORY_RECALL_WEIGHT: Record<MemoryCategory, number> = {
  [MemoryCategory.IDENTITY_ANCHOR]: 1.0,
  [MemoryCategory.CORRECTION]: 0.9,
  [MemoryCategory.SHARED_FACT]: 0.8,
  [MemoryCategory.SOFT_PREFERENCE]: 0.7,
  [MemoryCategory.JUDGMENT_PATTERN]: 0.75,
  [MemoryCategory.VALUE_PRIORITY]: 0.75,
  [MemoryCategory.RHYTHM_PATTERN]: 0.75,
  [MemoryCategory.COGNITIVE_PROFILE]: 0.78,
  [MemoryCategory.RELATIONSHIP_STATE]: 0.72,
  [MemoryCategory.BOUNDARY_EVENT]: 0.65,
  [MemoryCategory.COMMITMENT]: 0.6,
  [MemoryCategory.GENERAL]: 0.5,
};

/**
 * 写入去重时的相似度阈值（越高越严格）。
 * 认知类 category 语义集中，阈值略高，避免误合并。
 */
export const CATEGORY_DUPLICATE_THRESHOLD: Record<MemoryCategory, number> = {
  [MemoryCategory.IDENTITY_ANCHOR]: 0.72,
  [MemoryCategory.CORRECTION]: 0.68,
  [MemoryCategory.SHARED_FACT]: 0.66,
  [MemoryCategory.SOFT_PREFERENCE]: 0.7,
  [MemoryCategory.JUDGMENT_PATTERN]: 0.74,
  [MemoryCategory.VALUE_PRIORITY]: 0.74,
  [MemoryCategory.RHYTHM_PATTERN]: 0.74,
  [MemoryCategory.COGNITIVE_PROFILE]: 0.74,
  [MemoryCategory.RELATIONSHIP_STATE]: 0.72,
  [MemoryCategory.BOUNDARY_EVENT]: 0.7,
  [MemoryCategory.COMMITMENT]: 0.66,
  [MemoryCategory.GENERAL]: 0.64,
};

/** WriteGuard 判断结果 */
export enum WriteDecision {
  WRITE = 'write',
  WRITE_AND_LINK = 'write_and_link',
  OVERWRITE = 'overwrite',
  MERGE = 'merge',
  SKIP = 'skip',
}

export interface WriteDecisionResult {
  decision: WriteDecision;
  /** OVERWRITE / MERGE / WRITE_AND_LINK 时指向的目标记忆 ID */
  targetMemoryId?: string;
  reason: string;
}

export interface WriteCandidate {
  type: 'mid' | 'long';
  category: MemoryCategory;
  content: string;
  sourceMessageIds: string[];
  confidence: number;
  /** 是否为否定/纠正（由 summarizer 解析标注） */
  isNegation: boolean;
  /** 是否为一次性事实（仅服务过一次推理） */
  isOneOff: boolean;
}
