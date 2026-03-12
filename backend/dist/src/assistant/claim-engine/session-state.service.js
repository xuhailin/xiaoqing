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
exports.SessionStateService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../../infra/prisma.service");
let SessionStateService = class SessionStateService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async upsertState(draft) {
        const userKey = draft.userKey ?? 'default-user';
        const ttlSeconds = Math.max(60, Math.floor(draft.ttlSeconds));
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        await this.prisma.$executeRaw `
      INSERT INTO "SessionState" (
        "id", "userKey", "sessionId", "stateJson", "confidence",
        "ttlSeconds", "observedAt", "expiresAt", "sourceModel", "createdAt", "updatedAt"
      )
      VALUES (
        ${(0, node_crypto_1.randomUUID)()},
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
    async getFreshState(userKey, sessionId) {
        const rows = await this.prisma.$queryRaw `
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
    async cleanupExpired(limit = 200) {
        const deleted = await this.prisma.$executeRaw `
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
};
exports.SessionStateService = SessionStateService;
exports.SessionStateService = SessionStateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SessionStateService);
//# sourceMappingURL=session-state.service.js.map