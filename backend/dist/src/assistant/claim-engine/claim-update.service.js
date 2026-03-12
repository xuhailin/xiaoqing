"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ClaimUpdateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimUpdateService = void 0;
const common_1 = require("@nestjs/common");
const claim_store_service_1 = require("./claim-store.service");
const claim_schema_registry_1 = require("./claim-schema.registry");
let ClaimUpdateService = class ClaimUpdateService {
    static { ClaimUpdateService_1 = this; }
    store;
    constructor(store) {
        this.store = store;
    }
    static DRAFT_CONFIDENCE_CAP = 0.55;
    static DRAFT_MAX_STATUS = 'WEAK';
    static DRAFT_MAX_PER_TYPE = 30;
    async upsertFromDraft(draft) {
        const userKey = draft.userKey ?? 'default-user';
        const validation = claim_schema_registry_1.ClaimSchemaRegistry.validateAny(draft.key, draft.value);
        if (!validation.ok) {
            throw new Error(`invalid claim key/value: ${validation.reason}`);
        }
        const isDraftKey = validation.kind === 'draft';
        const proposedConfidence = isDraftKey
            ? Math.min(ClaimUpdateService_1.DRAFT_CONFIDENCE_CAP, draft.confidence)
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
                    limit: ClaimUpdateService_1.DRAFT_MAX_PER_TYPE,
                });
            }
            return { claimId, status: 'CANDIDATE' };
        }
        let nextConfidence = this.computeConfidence(existing.confidence, proposedConfidence, draft.evidence.polarity);
        let nextStatus = this.resolveStatus({
            confidence: nextConfidence,
            evidenceCount: existing.evidenceCount + (draft.evidence.polarity === 'SUPPORT' ? 1 : 0),
            counterEvidenceCount: existing.counterEvidenceCount + (draft.evidence.polarity === 'CONTRA' ? 1 : 0),
        });
        if (isDraftKey) {
            nextConfidence = Math.min(ClaimUpdateService_1.DRAFT_CONFIDENCE_CAP, nextConfidence);
            if (nextStatus !== 'DEPRECATED') {
                if (nextStatus === 'CORE' || nextStatus === 'STABLE') {
                    nextStatus = ClaimUpdateService_1.DRAFT_MAX_STATUS;
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
                limit: ClaimUpdateService_1.DRAFT_MAX_PER_TYPE,
            });
        }
        return { claimId: existing.id, status: nextStatus };
    }
    computeConfidence(current, proposed, polarity) {
        const boundedCurrent = this.clamp01(current);
        const boundedProposed = this.clamp01(proposed);
        if (polarity === 'CONTRA') {
            return this.clamp01(Number((boundedCurrent - 0.1).toFixed(3)));
        }
        if (polarity === 'NEUTRAL') {
            return boundedCurrent;
        }
        const gain = (1 - boundedCurrent) * 0.12;
        const candidate = boundedCurrent + gain + (boundedProposed - 0.5) * 0.04;
        return this.clamp01(Number(candidate.toFixed(3)));
    }
    resolveStatus(args) {
        const { confidence, evidenceCount, counterEvidenceCount } = args;
        const contradictionRatio = evidenceCount + counterEvidenceCount === 0
            ? 0
            : counterEvidenceCount / (evidenceCount + counterEvidenceCount);
        if (contradictionRatio >= 0.55 && confidence < 0.35)
            return 'DEPRECATED';
        if (evidenceCount >= 12 && confidence >= 0.85 && contradictionRatio < 0.25)
            return 'CORE';
        if (evidenceCount >= 6 && confidence >= 0.7 && contradictionRatio < 0.35)
            return 'STABLE';
        if (evidenceCount >= 3 && confidence >= 0.55 && contradictionRatio < 0.4)
            return 'WEAK';
        return 'CANDIDATE';
    }
    clamp01(value) {
        if (!Number.isFinite(value))
            return 0;
        return Math.max(0, Math.min(1, value));
    }
};
exports.ClaimUpdateService = ClaimUpdateService;
exports.ClaimUpdateService = ClaimUpdateService = ClaimUpdateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [claim_store_service_1.ClaimStoreService])
], ClaimUpdateService);
//# sourceMappingURL=claim-update.service.js.map