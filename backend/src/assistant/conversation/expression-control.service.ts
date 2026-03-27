import { Injectable } from '@nestjs/common';
import type { PersonaDto } from '../persona/persona.service';
import type { AffinityContext, RelationshipContext } from '../cognitive-pipeline/cognitive-pipeline.types';
import type { TurnContext } from './orchestration.types';
import type { ExpressionControlState } from './expression-control.types';

interface DerivedExpressionHints {
  warmthBias?: 'low' | 'mid' | 'high';
  directnessBias?: 'low' | 'mid' | 'high';
  humorBias?: 'low' | 'mid' | 'high';
  bondTone?: 'professional' | 'warm' | 'close' | 'playful';
}

interface RelationshipConstraints {
  maxBondTone: 'professional' | 'warm' | 'close' | 'playful';
  maxHumor: 'low' | 'normal' | 'high';
}

const BOND_TONE_ORDER: Array<'professional' | 'warm' | 'close' | 'playful'> = ['professional', 'warm', 'close', 'playful'];
const HUMOR_ORDER: Array<'low' | 'normal' | 'high'> = ['low', 'normal', 'high'];

/**
 * ExpressionControlService - 表达控制器
 *
 * 所属层：
 *  - Expression
 *
 * 负责：
 *  - 根据认知状态与长期互动偏好推导表达控制参数
 *  - 为回复组织层提供语气、节奏、边界等级等约束
 *
 * 不负责：
 *  - 不重新判断用户意图
 *  - 不决定是否执行工具
 *  - 不直接生成最终回复文本
 *
 * 输入：
 *  - preferredNickname、interactionTuning、cognitiveState
 *  - personaDto（可选）：提取 persona baseline 偏置
 *  - relationship（可选）：关系阶段上限约束
 *
 * 输出：
 *  - ExpressionControlState
 *
 * ⚠️ 约束：
 *  - 只做表达参数推导，不得承担新的感知或决策职责
 */
@Injectable()
export class ExpressionControlService {
  derive(input: {
    preferredNickname?: string | null;
    interactionTuning?: TurnContext['user']['interactionTuning'];
    cognitiveState: NonNullable<TurnContext['runtime']['cognitiveState']>;
    personaDto?: PersonaDto | null;
    relationship?: RelationshipContext | null;
  }): ExpressionControlState {
    const personaBaseline = input.personaDto ? this.resolvePersonaBaselineHints(input.personaDto) : undefined;
    const tuningHints = this.deriveInteractionTuningHints(input.interactionTuning);
    // interactionTuning wins over persona baseline when both are set
    const hints: DerivedExpressionHints = { ...personaBaseline, ...tuningHints };
    const relationshipConstraints = this.resolveRelationshipConstraints(
      input.relationship,
      input.cognitiveState.affinity,
    );
    const state = input.cognitiveState;

    const warmthMap = { low: 0.35, mid: 0.5, high: 0.72 } as const;
    const directnessMap = { low: 0.35, mid: 0.5, high: 0.72 } as const;
    const pacingMap = {
      short: 'direct_quick',
      balanced: 'normal',
      expanded: 'slow_gentle',
    } as const;
    const replyModeMap = {
      empathize: 'empathy_first',
      clarify: 'question',
      reflect: 'acknowledge',
      advise: 'solution_first',
      decide: 'solution_first',
      execute: 'tool_result',
      companion: 'acknowledge',
    } as const;

    let boundaryLevel: 'normal' | 'cautious' | 'restricted' = 'normal';
    if (state.userState.fragility === 'high') {
      boundaryLevel = 'restricted';
    } else if (
      state.userState.fragility === 'medium'
      || state.safety.capabilityBoundaryRisk
      || state.safety.relationalBoundaryRisk
    ) {
      boundaryLevel = 'cautious';
    }

    const followupDepth: 'none' | 'light' | 'deep' =
      state.rhythm.shouldAskFollowup === false
        ? 'none'
        : state.responseStrategy.depth === 'deep'
          ? 'deep'
          : 'light';

    const rawBondTone: ExpressionControlState['bondTone'] = hints?.bondTone ?? 'warm';
    const rawHumor: ExpressionControlState['humor'] =
      hints?.humorBias === 'high' ? 'high' : hints?.humorBias === 'low' ? 'low' : 'normal';

    return {
      warmth: hints?.warmthBias ? warmthMap[hints.warmthBias] : 0.5,
      directness: hints?.directnessBias ? directnessMap[hints.directnessBias] : 0.5,
      humor: this.capHumor(rawHumor, relationshipConstraints.maxHumor),
      bondTone: this.capBondTone(rawBondTone, relationshipConstraints.maxBondTone),
      verbosity:
        state.rhythm.pacing === 'short'
          ? 'minimal'
          : state.rhythm.pacing === 'expanded'
            ? 'elaborated'
            : 'normal',
      replyMode: state.responseStrategy.primaryMode
        ? replyModeMap[state.responseStrategy.primaryMode]
        : 'acknowledge',
      pacing: state.rhythm.pacing ? pacingMap[state.rhythm.pacing] : 'normal',
      followupDepth,
      mentionMemory: false,
      useNickname: !!input.preferredNickname?.trim(),
      boundaryLevel,
    };
  }

  /**
   * 从 persona 文本中提取表达基准偏置。
   * 作为 interactionTuning 缺失时的默认值；interactionTuning 有值时会覆盖。
   */
  private resolvePersonaBaselineHints(dto: PersonaDto): DerivedExpressionHints {
    const hints: DerivedExpressionHints = {};
    const personality = dto.personality ?? '';
    const expressionRules = dto.expressionRules ?? '';
    const behaviorForbidden = dto.behaviorForbidden ?? '';

    // 暖度：persona 有明确的温柔/在意/偏心信号 → high baseline
    if (/温柔|带暖意|在意她此刻|偏心|朋友/.test(personality)) {
      hints.warmthBias = 'high';
    }
    // 直接度：冷静/清醒/有自己判断 → mid
    if (/冷静|清醒|有自己的判断/.test(personality)) {
      hints.directnessBias = 'mid';
    }
    // 幽默：禁止嘲讽/反讽/卖萌 → low baseline；无明确禁止时保持默认
    if (/嘲讽|反讽|卖萌/.test(behaviorForbidden) || /不刻意卖萌/.test(expressionRules)) {
      hints.humorBias = 'low';
    }
    // bondTone：persona 默认 warm（关系层会上调上限）
    hints.bondTone = 'warm';

    return hints;
  }

  /**
   * 根据关系阶段和亲密度推导 bondTone / humor 的允许上限。
   * 关系更浅时上限更低，防止表达超出实际亲密度。
   */
  private resolveRelationshipConstraints(
    relationship?: RelationshipContext | null,
    affinity?: AffinityContext,
  ): RelationshipConstraints {
    const stage = relationship?.stage ?? 'early';
    const allowTease = affinity?.allowLightTease ?? false;

    switch (stage) {
      case 'steady':
        return {
          maxBondTone: allowTease ? 'playful' : 'close',
          maxHumor: allowTease ? 'high' : 'normal',
        };
      case 'familiar': {
        // closenessScore >= 0.55 视为 familiar 上段，解锁 close bondTone
        const inUpperFamiliar = (relationship?.closenessScore ?? 0.5) >= 0.55;
        return {
          maxBondTone: inUpperFamiliar ? 'close' : 'warm',
          maxHumor: allowTease ? 'normal' : 'low',
        };
      }
      case 'early':
      default:
        return { maxBondTone: 'warm', maxHumor: 'low' };
    }
  }

  private capBondTone(
    value: ExpressionControlState['bondTone'],
    max: ExpressionControlState['bondTone'],
  ): ExpressionControlState['bondTone'] {
    const vi = BOND_TONE_ORDER.indexOf(value);
    const mi = BOND_TONE_ORDER.indexOf(max);
    return BOND_TONE_ORDER[Math.min(vi, mi)];
  }

  private capHumor(
    value: ExpressionControlState['humor'],
    max: ExpressionControlState['humor'],
  ): ExpressionControlState['humor'] {
    const vi = HUMOR_ORDER.indexOf(value);
    const mi = HUMOR_ORDER.indexOf(max);
    return HUMOR_ORDER[Math.min(vi, mi)];
  }

  private deriveInteractionTuningHints(
    tuning: TurnContext['user']['interactionTuning'],
  ): DerivedExpressionHints | undefined {
    if (!tuning?.length) return undefined;

    const hints: DerivedExpressionHints = {};

    for (const signal of tuning) {
      const val = signal.value as Record<string, unknown> | null;
      if (!val) continue;

      if (signal.key === 'pa.warmth' && (val['level'] === 'low' || val['level'] === 'mid' || val['level'] === 'high')) {
        hints.warmthBias = val['level'] as 'low' | 'mid' | 'high';
      } else if (signal.key === 'pa.directness' && (val['level'] === 'low' || val['level'] === 'mid' || val['level'] === 'high')) {
        hints.directnessBias = val['level'] as 'low' | 'mid' | 'high';
      } else if (signal.key === 'pa.humor' && (val['level'] === 'low' || val['level'] === 'mid' || val['level'] === 'high')) {
        hints.humorBias = val['level'] as 'low' | 'mid' | 'high';
      } else if (signal.key === 'pa.bond_tone') {
        const tone = val['tone'];
        if (tone === 'professional' || tone === 'warm' || tone === 'close' || tone === 'playful') {
          hints.bondTone = tone;
        }
      }
    }

    return Object.keys(hints).length > 0 ? hints : undefined;
  }
}
