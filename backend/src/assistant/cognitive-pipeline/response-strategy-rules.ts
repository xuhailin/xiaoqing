import type {
  FragilityLevel,
  ResponseStrategy,
  SituationKind,
  UserNeedMode,
  UserState,
  SituationRecognition,
} from './cognitive-pipeline.types';
import type { DialogueIntentState } from '../intent/intent.types';

export interface ResponseStrategyRuleConditions {
  requiresTool?: boolean;
  fragility?: FragilityLevel | FragilityLevel[];
  needMode?: UserNeedMode | UserNeedMode[];
  situationKind?: SituationKind | SituationKind[];
}

export interface ResponseStrategyRule {
  priority: number;
  label: string;
  conditions: ResponseStrategyRuleConditions;
  strategy: ResponseStrategy;
}

/**
 * 声明式策略规则表，按 priority 升序匹配，第一条命中即返回。
 * 从原 planResponseStrategy() 的 if-else 分支 1:1 导出，行为完全一致。
 */
export const RESPONSE_STRATEGY_RULES: ResponseStrategyRule[] = [
  {
    priority: 0,
    label: 'tool-execution',
    conditions: { requiresTool: true },
    strategy: {
      primaryMode: 'execute',
      secondaryMode: 'none',
      depth: 'brief',
      initiative: 'balanced',
      goal: 'complete_task',
    },
  },
  {
    priority: 1,
    label: 'relationship-distress',
    conditions: { situationKind: 'relationship_distress', fragility: ['low', 'medium'] },
    strategy: {
      primaryMode: 'empathize',
      secondaryMode: 'gentle_probe',
      depth: 'medium',
      initiative: 'balanced',
      goal: 'build_understanding',
    },
  },
  {
    priority: 2,
    label: 'high-fragility-or-understanding',
    conditions: { fragility: 'high', needMode: 'understanding' },
    strategy: {
      primaryMode: 'empathize',
      secondaryMode: 'soothe',
      depth: 'brief',
      initiative: 'passive',
      goal: 'stabilize_user',
    },
  },
  {
    priority: 3,
    label: 'decision-mode',
    conditions: { needMode: 'decision' },
    strategy: {
      primaryMode: 'decide',
      secondaryMode: 'challenge',
      depth: 'deep',
      initiative: 'proactive',
      goal: 'move_decision',
    },
  },
  {
    priority: 4,
    label: 'co-thinking',
    conditions: { needMode: 'co_thinking', situationKind: 'co_thinking' },
    strategy: {
      primaryMode: 'reflect',
      secondaryMode: 'gentle_probe',
      depth: 'medium',
      initiative: 'balanced',
      goal: 'co_think',
    },
  },
  {
    priority: 5,
    label: 'advice-request',
    conditions: { needMode: 'advice' },
    strategy: {
      primaryMode: 'advise',
      secondaryMode: 'gentle_probe',
      depth: 'medium',
      initiative: 'balanced',
      goal: 'build_understanding',
    },
  },
  {
    priority: 6,
    label: 'casual-chat',
    conditions: { situationKind: 'casual_chat', needMode: 'companionship' },
    strategy: {
      primaryMode: 'companion',
      secondaryMode: 'none',
      depth: 'medium',
      initiative: 'balanced',
      goal: 'stay_connected',
    },
  },
  {
    priority: 99,
    label: 'default-clarify',
    conditions: {},
    strategy: {
      primaryMode: 'clarify',
      secondaryMode: 'none',
      depth: 'brief',
      initiative: 'passive',
      goal: 'build_understanding',
    },
  },
];

/**
 * 匹配单条规则的所有 conditions。
 * 每个 condition 字段若定义则必须匹配，未定义则视为通过。
 * 对于 priority=1（fragility OR needMode），使用 OR 语义。
 */
export function matchStrategyRule(
  rule: ResponseStrategyRule,
  intentState: DialogueIntentState | null | undefined,
  situation: SituationRecognition,
  userState: UserState,
): boolean {
  const { conditions } = rule;

  // 空 conditions = 默认兜底规则，始终匹配
  if (Object.keys(conditions).length === 0) return true;

  // requiresTool 是独立条件
  if (conditions.requiresTool !== undefined) {
    if (conditions.requiresTool !== !!intentState?.requiresTool) return false;
    // requiresTool 规则只检查这一个条件
    return true;
  }

  // priority=1 特殊处理：fragility=high OR needMode=understanding（原 if-else 用的是 ||）
  if (rule.label === 'high-fragility-or-understanding') {
    return userState.fragility === 'high' || userState.needMode === 'understanding';
  }

  // priority=3 特殊处理：needMode=co_thinking OR situationKind=co_thinking（原 if-else 用的是 ||）
  if (rule.label === 'co-thinking') {
    return userState.needMode === 'co_thinking' || situation.kind === 'co_thinking';
  }

  // 通用匹配逻辑
  if (conditions.needMode !== undefined) {
    const allowed = Array.isArray(conditions.needMode) ? conditions.needMode : [conditions.needMode];
    if (!allowed.includes(userState.needMode)) return false;
  }

  if (conditions.fragility !== undefined) {
    const allowed = Array.isArray(conditions.fragility) ? conditions.fragility : [conditions.fragility];
    if (!allowed.includes(userState.fragility)) return false;
  }

  if (conditions.situationKind !== undefined) {
    const allowed = Array.isArray(conditions.situationKind) ? conditions.situationKind : [conditions.situationKind];
    if (!allowed.includes(situation.kind)) return false;
  }

  return true;
}

/**
 * 从规则表中找到第一条匹配的策略。
 * 规则已按 priority 排序，保证确定性。
 */
export function resolveResponseStrategy(
  intentState: DialogueIntentState | null | undefined,
  situation: SituationRecognition,
  userState: UserState,
): ResponseStrategy {
  const sorted = [...RESPONSE_STRATEGY_RULES].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (matchStrategyRule(rule, intentState, situation, userState)) {
      return { ...rule.strategy };
    }
  }
  // 不应到达这里，因为 priority=99 的 default 规则始终匹配
  return RESPONSE_STRATEGY_RULES[RESPONSE_STRATEGY_RULES.length - 1].strategy;
}
