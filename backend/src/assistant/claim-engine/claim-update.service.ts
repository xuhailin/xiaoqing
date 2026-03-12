import { Injectable } from '@nestjs/common';
import { ClaimStoreService } from './claim-store.service';
import type { ClaimDraft, ClaimStatus } from './claim-engine.types';
import { ClaimSchemaRegistry } from './claim-schema.registry';

@Injectable()
export class ClaimUpdateService {
  constructor(private readonly store: ClaimStoreService) {}

  private static readonly DRAFT_CONFIDENCE_CAP = 0.55;
  private static readonly DRAFT_MAX_STATUS: ClaimStatus = 'WEAK';
  private static readonly DRAFT_MAX_PER_TYPE = 30;

  async upsertFromDraft(draft: ClaimDraft): Promise<{ claimId: string; status: ClaimStatus }> {
    const userKey = draft.userKey ?? 'default-user';
    const validation = ClaimSchemaRegistry.validateAny(draft.key, draft.value);
    if (!validation.ok) {
      throw new Error(`invalid claim key/value: ${validation.reason}`);
    }
    const isDraftKey = validation.kind === 'draft';

    const proposedConfidence = isDraftKey
      ? Math.min(ClaimUpdateService.DRAFT_CONFIDENCE_CAP, draft.confidence)
      : draft.confidence;
    const existing = await this.store.findByTypeAndKey(userKey, draft.type, draft.key);

    if (!existing) {
      const claimId = await this.store.insertCandidate({
        ...draft,
        confidence: proposedConfidence,
      });
      if (isDraftKey) {
        await this.store.cleanupDraftClaims({
          userKey,
          type: draft.type,
          limit: ClaimUpdateService.DRAFT_MAX_PER_TYPE,
        });
      }
      return { claimId, status: 'CANDIDATE' };
    }

    let nextConfidence = this.computeConfidence(existing.confidence, proposedConfidence, draft.evidence.polarity);
    let nextStatus = this.resolveStatus({
      confidence: nextConfidence,
      evidenceCount: existing.evidenceCount + (draft.evidence.polarity === 'SUPPORT' ? 1 : 0),
      counterEvidenceCount:
        existing.counterEvidenceCount + (draft.evidence.polarity === 'CONTRA' ? 1 : 0),
    });

    if (isDraftKey) {
      nextConfidence = Math.min(ClaimUpdateService.DRAFT_CONFIDENCE_CAP, nextConfidence);
      if (nextStatus !== 'DEPRECATED') {
        if (nextStatus === 'CORE' || nextStatus === 'STABLE') {
          nextStatus = ClaimUpdateService.DRAFT_MAX_STATUS;
        }
      }
    }

    await this.store.touchExistingClaim({
      claimId: existing.id,
      nextConfidence,
      nextStatus,
      evidencePolarity: draft.evidence.polarity,
      messageId: draft.evidence.messageId,
      sourceModel: draft.sourceModel,
    });

    await this.store.insertEvidence({
      claimId: existing.id,
      userKey,
      messageId: draft.evidence.messageId,
      sessionId: draft.evidence.sessionId,
      snippet: draft.evidence.snippet,
      polarity: draft.evidence.polarity,
      weight: draft.evidence.weight ?? 1,
      sourceModel: draft.sourceModel,
    });

    if (isDraftKey) {
      await this.store.cleanupDraftClaims({
        userKey,
        type: draft.type,
        limit: ClaimUpdateService.DRAFT_MAX_PER_TYPE,
      });
    }

    return { claimId: existing.id, status: nextStatus };
  }

  private computeConfidence(
    current: number,
    proposed: number,
    polarity: 'SUPPORT' | 'CONTRA' | 'NEUTRAL',
  ): number {
    const boundedCurrent = this.clamp01(current);
    const boundedProposed = this.clamp01(proposed);

    if (polarity === 'CONTRA') {
      return this.clamp01(Number((boundedCurrent - 0.1).toFixed(3)));
    }
    if (polarity === 'NEUTRAL') {
      return boundedCurrent;
    }

    // Diminishing gain: high-confidence claims should rise slower.
    const gain = (1 - boundedCurrent) * 0.12;
    const candidate = boundedCurrent + gain + (boundedProposed - 0.5) * 0.04;
    return this.clamp01(Number(candidate.toFixed(3)));
  }

  private resolveStatus(args: {
    confidence: number;
    evidenceCount: number;
    counterEvidenceCount: number;
  }): ClaimStatus {
    const { confidence, evidenceCount, counterEvidenceCount } = args;
    const contradictionRatio =
      evidenceCount + counterEvidenceCount === 0
        ? 0
        : counterEvidenceCount / (evidenceCount + counterEvidenceCount);

    if (contradictionRatio >= 0.55 && confidence < 0.35) return 'DEPRECATED';
    if (evidenceCount >= 12 && confidence >= 0.85 && contradictionRatio < 0.25) return 'CORE';
    if (evidenceCount >= 6 && confidence >= 0.7 && contradictionRatio < 0.35) return 'STABLE';
    if (evidenceCount >= 3 && confidence >= 0.55 && contradictionRatio < 0.4) return 'WEAK';
    return 'CANDIDATE';
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}
