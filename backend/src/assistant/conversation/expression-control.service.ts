import { Injectable } from '@nestjs/common';
import type { TurnContext } from './orchestration.types';
import type { ExpressionControlState } from './expression-control.types';

interface DerivedExpressionHints {
  warmthBias?: 'low' | 'mid' | 'high';
  directnessBias?: 'low' | 'mid' | 'high';
  humorBias?: 'low' | 'mid' | 'high';
  bondTone?: 'professional' | 'warm' | 'close' | 'playful';
}

@Injectable()
export class ExpressionControlService {
  derive(input: {
    preferredNickname?: string | null;
    interactionTuning?: TurnContext['user']['interactionTuning'];
    cognitiveState: NonNullable<TurnContext['runtime']['cognitiveState']>;
  }): ExpressionControlState {
    const hints = this.deriveInteractionTuningHints(input.interactionTuning);
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

    return {
      warmth: hints?.warmthBias ? warmthMap[hints.warmthBias] : 0.5,
      directness: hints?.directnessBias ? directnessMap[hints.directnessBias] : 0.5,
      humor:
        hints?.humorBias === 'high'
          ? 'high'
          : hints?.humorBias === 'low'
            ? 'low'
            : 'normal',
      bondTone: hints?.bondTone ?? 'warm',
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
