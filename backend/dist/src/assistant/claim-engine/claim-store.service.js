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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimStoreService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../infra/prisma.service");
let ClaimStoreService = class ClaimStoreService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findByTypeAndKey(userKey, type, key) {
        const rows = await this.prisma.$queryRaw `
      SELECT
        "id",
        "userKey",
        "type"::TEXT AS "type",
        "key",
        "confidence",
        "evidenceCount",
        "counterEvidenceCount",
        "status"::TEXT AS "status",
        "updatedAt"
      FROM "UserClaim"
      WHERE "userKey" = ${userKey}
        AND "type" = ${type}::"ClaimType"
        AND "key" = ${key}
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;
        return rows[0] ?? null;
    }
    async insertCandidate(draft) {
        const id = (0, node_crypto_1.randomUUID)();
        const userKey = draft.userKey ?? 'default-user';
        const support = draft.evidence.polarity === 'SUPPORT' ? 1 : 0;
        const contra = draft.evidence.polarity === 'CONTRA' ? 1 : 0;
        await this.prisma.$executeRaw `
      INSERT INTO "UserClaim" (
        "id", "userKey", "type", "key", "valueJson", "confidence",
        "evidenceCount", "counterEvidenceCount", "status",
        "contextTags", "sourceModels", "lastSourceMessageIds", "lastSeenAt",
        "createdAt", "updatedAt"
      )
      VALUES (
        ${id},
        ${userKey},
        ${draft.type}::"ClaimType",
        ${draft.key},
        ${JSON.stringify(draft.value)}::JSONB,
        ${draft.confidence},
        ${support},
        ${contra},
        'CANDIDATE'::"ClaimStatus",
        ${this.toTextArray(draft.contextTags ?? [])},
        ${this.toTextArray(draft.sourceModel ? [draft.sourceModel] : [])},
        ${this.toTextArray(draft.evidence.messageId ? [draft.evidence.messageId] : [])},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
        await this.insertEvidence({
            claimId: id,
            userKey,
            messageId: draft.evidence.messageId,
            sessionId: draft.evidence.sessionId,
            snippet: draft.evidence.snippet,
            polarity: draft.evidence.polarity,
            weight: draft.evidence.weight ?? 1,
            sourceModel: draft.sourceModel,
        });
        return id;
    }
    async touchExistingClaim(args) {
        const supportDelta = args.evidencePolarity === 'SUPPORT' ? 1 : 0;
        const contraDelta = args.evidencePolarity === 'CONTRA' ? 1 : 0;
        await this.prisma.$executeRaw `
      UPDATE "UserClaim"
      SET
        "confidence" = ${args.nextConfidence},
        "status" = ${args.nextStatus}::"ClaimStatus",
        "evidenceCount" = "evidenceCount" + ${supportDelta},
        "counterEvidenceCount" = "counterEvidenceCount" + ${contraDelta},
        "sourceModels" = CASE
          WHEN ${args.sourceModel ?? null}::TEXT IS NULL THEN "sourceModels"
          ELSE (
            SELECT ARRAY(
              SELECT DISTINCT x
              FROM unnest("sourceModels" || ARRAY[${args.sourceModel ?? ''}]::TEXT[]) AS t(x)
            )
          )
        END,
        "lastSourceMessageIds" = CASE
          WHEN ${args.messageId ?? null}::TEXT IS NULL THEN "lastSourceMessageIds"
          ELSE ARRAY[${args.messageId ?? ''}]::TEXT[]
        END,
        "lastSeenAt" = CURRENT_TIMESTAMP,
        "lastPromotedAt" = CASE
          WHEN "status" <> ${args.nextStatus}::"ClaimStatus" THEN CURRENT_TIMESTAMP
          ELSE "lastPromotedAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${args.claimId}
    `;
    }
    async insertEvidence(args) {
        const normalizedWeight = this.normalizeEvidenceWeight(args.weight);
        await this.prisma.$executeRaw `
      INSERT INTO "ClaimEvidence" (
        "id", "claimId", "userKey", "messageId", "sessionId",
        "snippet", "polarity", "weight", "sourceModel", "createdAt"
      )
      VALUES (
        ${(0, node_crypto_1.randomUUID)()},
        ${args.claimId},
        ${args.userKey},
        ${args.messageId ?? null},
        ${args.sessionId ?? null},
        ${args.snippet},
        ${args.polarity}::"EvidencePolarity",
        ${normalizedWeight},
        ${args.sourceModel ?? null},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("claimId", "messageId", "polarity")
      DO NOTHING
    `;
    }
    async cleanupDraftClaims(args) {
        const limit = Math.max(0, Math.floor(args.limit));
        if (limit <= 0)
            return 0;
        const deleted = await this.prisma.$executeRaw `
      DELETE FROM "UserClaim"
      WHERE "id" IN (
        SELECT "id"
        FROM "UserClaim"
        WHERE "userKey" = ${args.userKey}
          AND "type" = ${args.type}::"ClaimType"
          AND "key" LIKE 'draft.%'
        ORDER BY "confidence" DESC, "evidenceCount" DESC, "updatedAt" DESC
        OFFSET ${limit}
      )
    `;
        return Number(deleted) || 0;
    }
    toTextArray(items) {
        if (items.length === 0) {
            return client_1.Prisma.sql `ARRAY[]::TEXT[]`;
        }
        return client_1.Prisma.sql `ARRAY[${client_1.Prisma.join(items)}]::TEXT[]`;
    }
    normalizeEvidenceWeight(value) {
        if (!Number.isFinite(value))
            return 1;
        return Math.max(0, Math.min(1, value));
    }
};
exports.ClaimStoreService = ClaimStoreService;
exports.ClaimStoreService = ClaimStoreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ClaimStoreService);
//# sourceMappingURL=claim-store.service.js.map