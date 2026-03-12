import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import type {
  ClaimDraft,
  ClaimRecord,
  ClaimStatus,
  EvidencePolarity,
} from './claim-engine.types';

@Injectable()
export class ClaimStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTypeAndKey(
    userKey: string,
    type: string,
    key: string,
  ): Promise<ClaimRecord | null> {
    const rows = await this.prisma.$queryRaw<Array<ClaimRecord>>`
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

  async insertCandidate(draft: ClaimDraft): Promise<string> {
    const id = randomUUID();
    const userKey = draft.userKey ?? 'default-user';
    const support = draft.evidence.polarity === 'SUPPORT' ? 1 : 0;
    const contra = draft.evidence.polarity === 'CONTRA' ? 1 : 0;

    await this.prisma.$executeRaw`
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

  async touchExistingClaim(args: {
    claimId: string;
    nextConfidence: number;
    nextStatus: ClaimStatus;
    evidencePolarity: EvidencePolarity;
    messageId?: string;
    sourceModel?: string;
  }): Promise<void> {
    const supportDelta = args.evidencePolarity === 'SUPPORT' ? 1 : 0;
    const contraDelta = args.evidencePolarity === 'CONTRA' ? 1 : 0;

    await this.prisma.$executeRaw`
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

  async insertEvidence(args: {
    claimId: string;
    userKey: string;
    messageId?: string;
    sessionId?: string;
    snippet: string;
    polarity: EvidencePolarity;
    weight: number;
    sourceModel?: string;
  }): Promise<void> {
    const normalizedWeight = this.normalizeEvidenceWeight(args.weight);
    await this.prisma.$executeRaw`
      INSERT INTO "ClaimEvidence" (
        "id", "claimId", "userKey", "messageId", "sessionId",
        "snippet", "polarity", "weight", "sourceModel", "createdAt"
      )
      VALUES (
        ${randomUUID()},
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

  async cleanupDraftClaims(args: {
    userKey: string;
    type: string;
    limit: number;
  }): Promise<number> {
    const limit = Math.max(0, Math.floor(args.limit));
    if (limit <= 0) return 0;

    const deleted = await this.prisma.$executeRaw`
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

  private toTextArray(items: string[]): Prisma.Sql {
    if (items.length === 0) {
      return Prisma.sql`ARRAY[]::TEXT[]`;
    }
    return Prisma.sql`ARRAY[${Prisma.join(items)}]::TEXT[]`;
  }

  private normalizeEvidenceWeight(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.max(0, Math.min(1, value));
  }
}
