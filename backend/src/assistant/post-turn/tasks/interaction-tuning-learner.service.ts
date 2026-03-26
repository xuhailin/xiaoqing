import { Injectable, Logger } from '@nestjs/common';
import type { ClaimOp } from '../../cognitive-trace/cognitive-trace.types';
import { ClaimEngineConfig } from '../../claim-engine/claim-engine.config';
import { ClaimStoreService } from '../../claim-engine/claim-store.service';
import { ClaimUpdateService } from '../../claim-engine/claim-update.service';
import { CLAIM_KEYS } from '../../claim-engine/claim-schema.registry';
import type { ClaimDraft, ClaimRecord, EvidencePolarity } from '../../claim-engine/claim-engine.types';
import type { PostTurnPlan } from '../post-turn.types';

type InteractionTuningKey =
  | typeof CLAIM_KEYS.PA_DIRECTNESS
  | typeof CLAIM_KEYS.PA_WARMTH
  | typeof CLAIM_KEYS.PA_HUMOR
  | typeof CLAIM_KEYS.PA_BOND_TONE;

type InteractionLevelValue = { level: 'low' | 'mid' | 'high' };
type InteractionBondToneValue = { tone: 'professional' | 'warm' | 'close' | 'playful' };
type InteractionTuningValue = InteractionLevelValue | InteractionBondToneValue;

interface RuleMatch {
  key: InteractionTuningKey;
  desiredValue: InteractionTuningValue;
  confidence: number;
  weight: number;
  reason: string;
  matchedText: string;
}

interface RuleDefinition {
  regex: RegExp;
  value: InteractionTuningValue;
  confidence: number;
  weight: number;
  reason: string;
}

const RULES: Record<InteractionTuningKey, RuleDefinition[]> = {
  [CLAIM_KEYS.PA_DIRECTNESS]: [
    {
      regex: /(直接点|直接一点|直接一些|说重点|开门见山|别绕(?:弯子)?|少说点|简短点|简洁点|别啰嗦|太啰嗦|别这么长)/i,
      value: { level: 'high' },
      confidence: 0.68,
      weight: 0.8,
      reason: 'explicit_directness_request',
    },
    {
      regex: /(别太直接|别那么直接|别太冲|委婉一点|柔和一点|多解释一点|详细一点|慢慢说)/i,
      value: { level: 'low' },
      confidence: 0.68,
      weight: 0.8,
      reason: 'explicit_softness_request',
    },
    {
      regex: /(这样够直接|这样挺直接|这个简洁度就对了|这个长度挺好|这样够简洁|就按这个简短程度)/i,
      value: { level: 'high' },
      confidence: 0.64,
      weight: 0.72,
      reason: 'explicit_directness_confirmation',
    },
    {
      regex: /(这样太冲|这样有点冲|这语气太冲|这个力度太大|这样太短了|太简略了)/i,
      value: { level: 'low' },
      confidence: 0.64,
      weight: 0.72,
      reason: 'explicit_directness_rejection',
    },
  ],
  [CLAIM_KEYS.PA_WARMTH]: [
    {
      regex: /(温柔一点|暖一点|别这么冷|别太冷|亲切一点|柔软一点|这样挺暖|这样很暖)/i,
      value: { level: 'high' },
      confidence: 0.66,
      weight: 0.76,
      reason: 'explicit_warmth_request',
    },
    {
      regex: /(别太热情|别这么热情|别太温柔|冷一点|克制一点|别太肉麻)/i,
      value: { level: 'low' },
      confidence: 0.66,
      weight: 0.76,
      reason: 'explicit_lower_warmth_request',
    },
    {
      regex: /(这样挺温柔|这个语气挺温柔|这个语气挺暖|这样暖暖的就好|这种温和的感觉挺好)/i,
      value: { level: 'high' },
      confidence: 0.63,
      weight: 0.7,
      reason: 'explicit_warmth_confirmation',
    },
    {
      regex: /(这样太腻|有点腻|太甜了|别这么甜|有点肉麻了)/i,
      value: { level: 'low' },
      confidence: 0.63,
      weight: 0.7,
      reason: 'explicit_warmth_rejection',
    },
  ],
  [CLAIM_KEYS.PA_HUMOR]: [
    {
      regex: /(幽默一点|有趣一点|可以开点玩笑|这样挺好笑|这样有点好笑挺好|轻松一点|俏皮一点)/i,
      value: { level: 'high' },
      confidence: 0.65,
      weight: 0.72,
      reason: 'explicit_humor_request',
    },
    {
      regex: /(别贫|别逗|别开玩笑|严肃一点|正经一点|别这么皮)/i,
      value: { level: 'low' },
      confidence: 0.65,
      weight: 0.72,
      reason: 'explicit_reduce_humor_request',
    },
    {
      regex: /(这种好笑程度挺好|这样幽默就对了|这样挺有趣|这个俏皮感挺好)/i,
      value: { level: 'high' },
      confidence: 0.62,
      weight: 0.68,
      reason: 'explicit_humor_confirmation',
    },
    {
      regex: /(这样太闹|太皮了|有点油|别这么好笑|这个玩笑有点过)/i,
      value: { level: 'low' },
      confidence: 0.62,
      weight: 0.68,
      reason: 'explicit_humor_rejection',
    },
  ],
  [CLAIM_KEYS.PA_BOND_TONE]: [
    {
      regex: /(像朋友一点|像朋友那样|朋友一点|别太客气|不用这么客气|亲近一点|随意一点)/i,
      value: { tone: 'close' },
      confidence: 0.69,
      weight: 0.82,
      reason: 'explicit_close_bond_request',
    },
    {
      regex: /(正式一点|专业一点|别太亲密|保持距离|不要太熟|别太暧昧)/i,
      value: { tone: 'professional' },
      confidence: 0.69,
      weight: 0.82,
      reason: 'explicit_professional_bond_request',
    },
    {
      regex: /(轻松一点|活泼一点|可以打趣一点|玩笑一点|闹一点)/i,
      value: { tone: 'playful' },
      confidence: 0.64,
      weight: 0.72,
      reason: 'explicit_playful_bond_request',
    },
    {
      regex: /(柔和一点|温柔一点|暖一点|别那么生硬)/i,
      value: { tone: 'warm' },
      confidence: 0.64,
      weight: 0.72,
      reason: 'explicit_warm_bond_request',
    },
    {
      regex: /(这样像朋友聊天|这种朋友感挺好|这样亲近一点就对了|这样不用太客气挺好)/i,
      value: { tone: 'close' },
      confidence: 0.64,
      weight: 0.72,
      reason: 'explicit_close_bond_confirmation',
    },
    {
      regex: /(这个距离感就对了|这样正式一点挺好|这样专业点就好)/i,
      value: { tone: 'professional' },
      confidence: 0.64,
      weight: 0.72,
      reason: 'explicit_professional_bond_confirmation',
    },
    {
      regex: /(这种轻松打趣挺好|这样闹一点挺好|这种俏皮感挺好)/i,
      value: { tone: 'playful' },
      confidence: 0.61,
      weight: 0.66,
      reason: 'explicit_playful_bond_confirmation',
    },
    {
      regex: /(这种温和的感觉挺好|这样柔和一点挺好|这样暖暖的就好)/i,
      value: { tone: 'warm' },
      confidence: 0.61,
      weight: 0.66,
      reason: 'explicit_warm_bond_confirmation',
    },
  ],
};

@Injectable()
export class InteractionTuningLearner {
  private readonly logger = new Logger(InteractionTuningLearner.name);

  constructor(
    private readonly claimConfig: ClaimEngineConfig,
    private readonly claimStore: ClaimStoreService,
    private readonly claimUpdate: ClaimUpdateService,
  ) {}

  async learn(plan: PostTurnPlan): Promise<{ claimOps: ClaimOp[] }> {
    if (!this.claimConfig.interactionTuningLearningEnabled) {
      return { claimOps: [] };
    }

    const matches = this.extractMatches(plan.turn.userInput);
    if (matches.length === 0) {
      return { claimOps: [] };
    }

    const claimOps: ClaimOp[] = [];

    for (const match of matches) {
      try {
        const existing = await this.claimStore.findByTypeAndKey(
          'default-user',
          'INTERACTION_TUNING',
          match.key,
        );
        const draft = this.buildDraft(plan, match, existing);
        const result = await this.claimUpdate.upsertWithEvidence(draft);

        if (!result.previousStatus) {
          claimOps.push({
            action: 'create',
            claimId: result.claimId,
            toStatus: result.status,
          });
          continue;
        }

        if (result.previousStatus !== result.status) {
          claimOps.push({
            action: 'promote',
            claimId: result.claimId,
            fromStatus: result.previousStatus,
            toStatus: result.status,
          });
        }
      } catch (err) {
        this.logger.warn(
          `interaction tuning learning failed for ${match.key} in conversation ${plan.conversationId}: ${String(err)}`,
        );
      }
    }

    return { claimOps };
  }

  private extractMatches(userInput: string): RuleMatch[] {
    const input = userInput.trim();
    if (!input) return [];

    const matches = new Map<InteractionTuningKey, RuleMatch>();

    for (const [key, rules] of Object.entries(RULES) as Array<[InteractionTuningKey, RuleDefinition[]]>) {
      for (const rule of rules) {
        const matchedText = this.findMatchedText(rule.regex, input);
        if (!matchedText) continue;

        const nextMatch: RuleMatch = {
          key,
          desiredValue: rule.value,
          confidence: rule.confidence,
          weight: rule.weight,
          reason: rule.reason,
          matchedText,
        };
        const existing = matches.get(key);
        if (!existing || nextMatch.confidence > existing.confidence) {
          matches.set(key, nextMatch);
        }
      }
    }

    return [...matches.values()];
  }

  private buildDraft(
    plan: PostTurnPlan,
    match: RuleMatch,
    existing: ClaimRecord | null,
  ): ClaimDraft {
    const isSameValue = existing ? this.isSameValue(existing.valueJson, match.desiredValue) : false;
    const polarity: EvidencePolarity = !existing || isSameValue ? 'SUPPORT' : 'CONTRA';

    return {
      userKey: 'default-user',
      type: 'INTERACTION_TUNING',
      key: match.key,
      value: !existing || isSameValue ? match.desiredValue : existing.valueJson,
      confidence: match.confidence,
      sourceModel: 'interaction-tuning-learner',
      contextTags: [
        'interaction_tuning',
        'post_turn',
        `reason:${match.reason}`,
      ],
      evidence: {
        messageId: plan.turn.userMessageId,
        sessionId: plan.conversationId,
        snippet: `${match.reason}: ${match.matchedText}`,
        polarity,
        weight: match.weight,
      },
    };
  }

  private isSameValue(left: unknown, right: InteractionTuningValue): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private findMatchedText(regex: RegExp, input: string): string | null {
    const match = regex.exec(input);
    if (!match) return null;
    return match[0].trim().slice(0, 120) || null;
  }
}
