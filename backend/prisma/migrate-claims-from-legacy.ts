import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type LegacyCognitiveRow = {
  content: string;
  confidence: number;
  sourceMessageIds: string[];
  category: string;
  updatedAt: Date;
};

type LegacyProfileRow = {
  content: string;
  confidence: number;
  sourceMessageIds: string[];
  kind: string;
  updatedAt: Date;
};

function normalizeKey(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 96);
}

function mapLegacyCategoryToClaimType(category: string): string | null {
  switch (category) {
    case 'judgment_pattern':
      return 'JUDGEMENT_PATTERN';
    case 'value_priority':
      return 'VALUE';
    case 'rhythm_pattern':
      return 'RELATION_RHYTHM';
    default:
      return null;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const dryRun = process.env.DRY_RUN !== 'false';
  const userKey = process.env.USER_KEY ?? 'default-user';

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    const [legacyCognitive, legacyProfiles] = await Promise.all([
      prisma.$queryRaw<LegacyCognitiveRow[]>`
        SELECT "content", "confidence", "sourceMessageIds", "category", "updatedAt"
        FROM "Memory"
        WHERE "type" = 'long'
          AND "category" IN ('judgment_pattern', 'value_priority', 'rhythm_pattern')
          AND "decayScore" > 0
      `,
      prisma.$queryRaw<LegacyProfileRow[]>`
        SELECT "content", "confidence", "sourceMessageIds", "kind", "updatedAt"
        FROM "CognitiveProfile"
        WHERE "isActive" = true
      `,
    ]);

    let inserted = 0;
    let skipped = 0;

    for (const row of legacyCognitive) {
      const mappedType = mapLegacyCategoryToClaimType(row.category);
      if (!mappedType) {
        skipped++;
        continue;
      }
      const key = `${row.category}:${normalizeKey(row.content)}`;
      const confidence = Math.max(0.45, Math.min(0.85, row.confidence || 0.45));
      const status = confidence >= 0.7 ? 'WEAK' : 'CANDIDATE';

      if (!dryRun) {
        await prisma.$executeRaw`
          INSERT INTO "UserClaim" (
            "id", "userKey", "type", "key", "valueJson", "confidence",
            "evidenceCount", "counterEvidenceCount", "status",
            "sourceModels", "lastSourceMessageIds",
            "lastSeenAt", "createdAt", "updatedAt"
          )
          SELECT
            ${randomUUID()},
            ${userKey},
            ${mappedType}::"ClaimType",
            ${key},
            ${JSON.stringify(row.content)}::JSONB,
            ${confidence},
            1,
            0,
            ${status}::"ClaimStatus",
            ARRAY['legacy_migration']::TEXT[],
            ${row.sourceMessageIds.length > 0 ? row.sourceMessageIds : []}::TEXT[],
            ${row.updatedAt},
            CURRENT_TIMESTAMP,
            ${row.updatedAt}
          WHERE NOT EXISTS (
            SELECT 1
            FROM "UserClaim"
            WHERE "userKey" = ${userKey}
              AND "type" = ${mappedType}::"ClaimType"
              AND "key" = ${key}
          )
        `;
      }
      inserted++;
    }

    for (const row of legacyProfiles) {
      const key = `profile:${row.kind}:${normalizeKey(row.content)}`;
      const confidence = Math.max(0.45, Math.min(0.9, row.confidence || 0.45));
      const status = confidence >= 0.7 ? 'WEAK' : 'CANDIDATE';

      if (!dryRun) {
        await prisma.$executeRaw`
          INSERT INTO "UserClaim" (
            "id", "userKey", "type", "key", "valueJson", "confidence",
            "evidenceCount", "counterEvidenceCount", "status",
            "sourceModels", "lastSourceMessageIds",
            "lastSeenAt", "createdAt", "updatedAt"
          )
          SELECT
            ${randomUUID()},
            ${userKey},
            'JUDGEMENT_PATTERN'::"ClaimType",
            ${key},
            ${JSON.stringify(row.content)}::JSONB,
            ${confidence},
            1,
            0,
            ${status}::"ClaimStatus",
            ARRAY['legacy_profile_migration']::TEXT[],
            ${row.sourceMessageIds.length > 0 ? row.sourceMessageIds : []}::TEXT[],
            ${row.updatedAt},
            CURRENT_TIMESTAMP,
            ${row.updatedAt}
          WHERE NOT EXISTS (
            SELECT 1
            FROM "UserClaim"
            WHERE "userKey" = ${userKey}
              AND "type" = 'JUDGEMENT_PATTERN'::"ClaimType"
              AND "key" = ${key}
          )
        `;
      }
      inserted++;
    }

    console.log(
      `[claim-migration] dryRun=${dryRun} legacyCognitive=${legacyCognitive.length} legacyProfiles=${legacyProfiles.length} insertedOrPlanned=${inserted} skipped=${skipped}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[claim-migration] failed:', err);
  process.exit(1);
});
