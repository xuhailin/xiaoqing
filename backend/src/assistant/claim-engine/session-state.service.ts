import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma.service';
import type { SessionStateDraft } from './claim-engine.types';

@Injectable()
export class SessionStateService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertState(draft: SessionStateDraft): Promise<void> {
    const userKey = draft.userKey ?? 'default-user';
    const ttlSeconds = Math.max(60, Math.floor(draft.ttlSeconds));
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.$executeRaw`
      INSERT INTO "SessionState" (
        "id", "userKey", "sessionId", "stateJson", "confidence",
        "ttlSeconds", "observedAt", "expiresAt", "sourceModel", "createdAt", "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${userKey},
        ${draft.sessionId},
        ${JSON.stringify(draft.state)}::JSONB,
        ${draft.confidence},
        ${ttlSeconds},
        CURRENT_TIMESTAMP,
        ${expiresAt},
        ${draft.sourceModel ?? null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
  }

  async getFreshState(
    userKey: string,
    sessionId: string,
  ): Promise<{ stateJson: Record<string, unknown>; confidence: number } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ stateJson: Record<string, unknown>; confidence: number }>
    >`
      SELECT "stateJson", "confidence"
      FROM "SessionState"
      WHERE "userKey" = ${userKey}
        AND "sessionId" = ${sessionId}
        AND "expiresAt" > CURRENT_TIMESTAMP
      ORDER BY "observedAt" DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async cleanupExpired(limit = 200): Promise<number> {
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "SessionState"
      WHERE "id" IN (
        SELECT "id"
        FROM "SessionState"
        WHERE "expiresAt" <= CURRENT_TIMESTAMP
        ORDER BY "expiresAt" ASC
        LIMIT ${limit}
      )
    `;
    return Number(deleted) || 0;
  }
}
