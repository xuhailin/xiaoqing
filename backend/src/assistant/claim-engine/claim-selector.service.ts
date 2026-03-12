import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { ClaimSchemaRegistry } from './claim-schema.registry';

@Injectable()
export class ClaimSelectorService {
  constructor(private readonly prisma: PrismaService) {}

  async getInjectableClaims(
    userKey: string,
    byTypeBudget: Partial<Record<string, number>>,
    opts?: { typePriority?: string[] },
  ): Promise<Array<{ type: string; key: string; valueJson: unknown; confidence: number; status: string }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ type: string; key: string; valueJson: unknown; confidence: number; status: string; updatedAt: Date }>
    >`
      SELECT "type"::TEXT AS "type", "key", "valueJson", "confidence", "status"::TEXT AS "status", "updatedAt"
      FROM "UserClaim"
      WHERE "userKey" = ${userKey}
        AND "status" IN ('STABLE', 'CORE')
        AND "key" NOT LIKE 'draft.%'
      ORDER BY "confidence" DESC, "updatedAt" DESC
      LIMIT 140
    `;

    const result: Array<{ type: string; key: string; valueJson: unknown; confidence: number; status: string }> = [];
    const remaining = new Map<string, number>(
      Object.entries(byTypeBudget).map(([k, v]) => [k, Math.max(0, v ?? 0)]),
    );

    const byType = new Map<string, typeof rows>();
    for (const row of rows) {
      // Hard safety: only canonical keys are allowed into injection.
      if (!ClaimSchemaRegistry.isCanonicalKey(row.key)) continue;
      const list = byType.get(row.type) ?? [];
      list.push(row);
      byType.set(row.type, list);
    }

    const typeOrder = opts?.typePriority?.length
      ? opts.typePriority
      : [
          'INTERACTION_PREFERENCE',
          'RELATION_RHYTHM',
          'EMOTIONAL_TENDENCY',
          'JUDGEMENT_PATTERN',
          'VALUE',
        ];
    const allTypes = Array.from(new Set([...typeOrder, ...Array.from(byType.keys())]));

    for (const type of allTypes) {
      const left = remaining.get(type);
      if (left === undefined || left <= 0) continue;
      const candidates = byType.get(type) ?? [];
      for (const row of candidates.slice(0, left)) {
        result.push({
          type: row.type,
          key: row.key,
          valueJson: row.valueJson,
          confidence: row.confidence,
          status: row.status,
        });
      }
      remaining.set(type, left - Math.min(left, candidates.length));
    }
    return result;
  }

  async getDraftClaimsForDebug(
    userKey: string,
    opts?: { perTypeLimit?: number; totalLimit?: number },
  ): Promise<Array<{ type: string; key: string; valueJson: unknown; confidence: number; status: string }>> {
    const perTypeLimit = Math.max(1, Math.floor(opts?.perTypeLimit ?? 6));
    const totalLimit = Math.max(1, Math.floor(opts?.totalLimit ?? 60));
    const rows = await this.prisma.$queryRaw<
      Array<{ type: string; key: string; valueJson: unknown; confidence: number; status: string; updatedAt: Date }>
    >`
      SELECT "type"::TEXT AS "type", "key", "valueJson", "confidence", "status"::TEXT AS "status", "updatedAt"
      FROM "UserClaim"
      WHERE "userKey" = ${userKey}
        AND "key" LIKE 'draft.%'
        AND "status" IN ('CANDIDATE', 'WEAK', 'DEPRECATED')
      ORDER BY "confidence" DESC, "evidenceCount" DESC, "updatedAt" DESC
      LIMIT ${totalLimit}
    `;

    const remaining = new Map<string, number>();
    const result: Array<{ type: string; key: string; valueJson: unknown; confidence: number; status: string }> = [];
    for (const row of rows) {
      const left = remaining.get(row.type) ?? perTypeLimit;
      if (left <= 0) continue;
      result.push({
        type: row.type,
        key: row.key,
        valueJson: row.valueJson,
        confidence: row.confidence,
        status: row.status,
      });
      remaining.set(row.type, left - 1);
    }
    return result;
  }
}
