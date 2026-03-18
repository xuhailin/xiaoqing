import { Injectable, Logger } from '@nestjs/common';
import { ObservationService } from './observation.service';
import type {
  CreateObservationDto,
  TurnCognitiveResult,
} from '../cognitive-trace.types';

const MIN_SIGNIFICANCE = 0.3;

@Injectable()
export class ObservationEmitterService {
  private readonly logger = new Logger(ObservationEmitterService.name);

  constructor(private readonly observationService: ObservationService) {}

  async emit(result: TurnCognitiveResult): Promise<number> {
    const observations: CreateObservationDto[] = [];
    const base = {
      conversationId: result.conversationId,
      messageId: result.messageId,
      happenedAt: result.happenedAt,
    };

    // ── Perception: 情绪变化 ──
    const emotion = result.cognitiveState.userState.emotion;
    if (emotion !== 'calm') {
      observations.push({
        ...base,
        dimension: 'perception',
        kind: 'emotion_detected',
        title: `检测到用户情绪: ${emotion}`,
        source: 'cognitive-pipeline',
        significance: emotion === 'hurt' || emotion === 'anxious' ? 0.8 : 0.5,
        payload: {
          emotion,
          fragility: result.cognitiveState.userState.fragility,
          signals: result.cognitiveState.userState.signals,
        },
      });
    }

    // ── Perception: 非日常情境 ──
    const situation = result.cognitiveState.situation;
    if (situation.kind !== 'casual_chat') {
      observations.push({
        ...base,
        dimension: 'perception',
        kind: 'situation_read',
        title: `识别情境: ${situation.kind}`,
        detail: situation.summary,
        source: 'cognitive-pipeline',
        significance: situation.requiresAction ? 0.7 : 0.4,
        payload: {
          kind: situation.kind,
          confidence: situation.confidence,
          requiresAction: situation.requiresAction,
        },
      });
    }

    // ── Decision: 策略选择（仅策略变化时记录） ──
    if (result.strategyShifted) {
      const strategy = result.cognitiveState.responseStrategy;
      observations.push({
        ...base,
        dimension: 'decision',
        kind: 'strategy_chosen',
        title: `策略切换: ${strategy.primaryMode} (${strategy.goal})`,
        source: 'cognitive-pipeline',
        significance: 0.7,
        payload: {
          primaryMode: strategy.primaryMode,
          secondaryMode: strategy.secondaryMode,
          depth: strategy.depth,
          initiative: strategy.initiative,
          goal: strategy.goal,
        },
      });
    }

    // ── Decision: comfort-before-advice 特殊决策 ──
    const emotionRule = result.cognitiveState.emotionRule;
    if (emotionRule.rule === 'stabilize_first' || emotionRule.rule === 'analyze_after_empathy') {
      const strategy = result.cognitiveState.responseStrategy;
      if (strategy.primaryMode === 'empathize' && strategy.secondaryMode !== 'none') {
        observations.push({
          ...base,
          dimension: 'decision',
          kind: 'comfort_before_advice',
          title: `先安抚再${strategy.secondaryMode === 'gentle_probe' ? '探索' : '回应'}`,
          source: 'cognitive-pipeline',
          significance: 0.6,
          payload: {
            emotionRule: emotionRule.rule,
            responseOrder: emotionRule.responseOrder,
          },
        });
      }
    }

    // ── Memory: 记忆写入 ──
    for (const op of result.memoryOps) {
      if (op.action === 'write') {
        observations.push({
          ...base,
          dimension: 'memory',
          kind: 'memory_written',
          title: `记住了: ${op.category}${op.content ? ' - ' + truncate(op.content, 40) : ''}`,
          source: 'memory',
          significance: op.category === 'identity_anchor' ? 0.9 : 0.6,
          payload: {
            category: op.category,
            memoryId: op.memoryId,
          },
        });
      }
    }

    // ── Memory: Claim 晋升 ──
    for (const op of result.claimOps) {
      if (op.action === 'promote') {
        observations.push({
          ...base,
          dimension: 'memory',
          kind: 'claim_promoted',
          title: `认知信号晋升: ${op.fromStatus} -> ${op.toStatus}`,
          source: 'claim-engine',
          significance: op.toStatus === 'CORE' ? 0.9 : 0.7,
          payload: {
            claimId: op.claimId,
            fromStatus: op.fromStatus,
            toStatus: op.toStatus,
          },
        });
      }
    }

    // ── Growth: 成长事件 ──
    for (const op of result.growthOps) {
      if (op.type === 'profile_confirmed') {
        observations.push({
          ...base,
          dimension: 'growth',
          kind: 'profile_confirmed',
          title: `认知画像确认: ${truncate(op.detail, 50)}`,
          source: 'cognitive-growth',
          significance: 0.8,
          payload: { detail: op.detail },
        });
      } else if (op.type === 'boundary') {
        observations.push({
          ...base,
          dimension: 'growth',
          kind: 'boundary_noted',
          title: `边界事件: ${truncate(op.detail, 50)}`,
          source: 'cognitive-growth',
          significance: 0.7,
          payload: { detail: op.detail },
        });
      }
    }

    // ── Expression: 深度调整 ──
    const rhythm = result.cognitiveState.rhythm;
    if (rhythm.pacing !== 'balanced') {
      observations.push({
        ...base,
        dimension: 'expression',
        kind: 'depth_adjusted',
        title: `回复节奏调整为 ${rhythm.pacing}`,
        source: 'cognitive-pipeline',
        significance: 0.4,
        payload: {
          pacing: rhythm.pacing,
          shouldAskFollowup: rhythm.shouldAskFollowup,
          initiative: rhythm.initiative,
        },
      });
    }

    // ── Safety: 安全标记不作为 observation 存储，已有 BoundaryEvent ──

    // 过滤低重要性
    const filtered = observations.filter((o) => o.significance >= MIN_SIGNIFICANCE);

    if (filtered.length === 0) return 0;

    try {
      await this.observationService.createMany(filtered);
      this.logger.debug(
        `Emitted ${filtered.length} observations for message ${result.messageId} (${filtered.length}/${observations.length} passed significance filter)`,
      );
    } catch (err) {
      this.logger.warn(`Failed to emit observations: ${String(err)}`);
    }

    return filtered.length;
  }
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}
