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
exports.ClaimSelectorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
const claim_schema_registry_1 = require("./claim-schema.registry");
let ClaimSelectorService = class ClaimSelectorService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getInjectableClaims(userKey, byTypeBudget, opts) {
        const rows = await this.prisma.$queryRaw `
      SELECT "type"::TEXT AS "type", "key", "valueJson", "confidence", "status"::TEXT AS "status", "updatedAt"
      FROM "UserClaim"
      WHERE "userKey" = ${userKey}
        AND "status" IN ('STABLE', 'CORE')
        AND "key" NOT LIKE 'draft.%'
      ORDER BY "confidence" DESC, "updatedAt" DESC
      LIMIT 140
    `;
        const result = [];
        const remaining = new Map(Object.entries(byTypeBudget).map(([k, v]) => [k, Math.max(0, v ?? 0)]));
        const byType = new Map();
        for (const row of rows) {
            if (!claim_schema_registry_1.ClaimSchemaRegistry.isCanonicalKey(row.key))
                continue;
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
            if (left === undefined || left <= 0)
                continue;
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
    async getDraftClaimsForDebug(userKey, opts) {
        const perTypeLimit = Math.max(1, Math.floor(opts?.perTypeLimit ?? 6));
        const totalLimit = Math.max(1, Math.floor(opts?.totalLimit ?? 60));
        const rows = await this.prisma.$queryRaw `
      SELECT "type"::TEXT AS "type", "key", "valueJson", "confidence", "status"::TEXT AS "status", "updatedAt"
      FROM "UserClaim"
      WHERE "userKey" = ${userKey}
        AND "key" LIKE 'draft.%'
        AND "status" IN ('CANDIDATE', 'WEAK', 'DEPRECATED')
      ORDER BY "confidence" DESC, "evidenceCount" DESC, "updatedAt" DESC
      LIMIT ${totalLimit}
    `;
        const remaining = new Map();
        const result = [];
        for (const row of rows) {
            const left = remaining.get(row.type) ?? perTypeLimit;
            if (left <= 0)
                continue;
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
};
exports.ClaimSelectorService = ClaimSelectorService;
exports.ClaimSelectorService = ClaimSelectorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ClaimSelectorService);
//# sourceMappingURL=claim-selector.service.js.map