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
exports.IdentityAnchorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../infra/prisma.service");
const MAX_ANCHORS = 5;
let IdentityAnchorService = class IdentityAnchorService {
    prisma;
    defaultUserKey;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.defaultUserKey = config.get('DEFAULT_USER_KEY') || 'default-user';
    }
    async list() {
        return this.prisma.identityAnchor.findMany({
            where: { userKey: this.defaultUserKey },
            orderBy: { sortOrder: 'asc' },
        });
    }
    async getActiveAnchors() {
        return this.prisma.identityAnchor.findMany({
            where: { userKey: this.defaultUserKey, isActive: true },
            orderBy: { sortOrder: 'asc' },
            take: MAX_ANCHORS,
        });
    }
    buildAnchorText(anchors) {
        if (anchors.length === 0)
            return null;
        const lines = anchors.map((a) => {
            const prefix = a.nickname ? `${a.nickname}` : '';
            const labelTag = `[${a.label}]`;
            return prefix
                ? `- ${labelTag} ${prefix}：${a.content}`
                : `- ${labelTag} ${a.content}`;
        });
        return lines.join('\n');
    }
    async create(data) {
        const activeCount = await this.prisma.identityAnchor.count({
            where: { userKey: this.defaultUserKey, isActive: true },
        });
        if (activeCount >= MAX_ANCHORS) {
            throw new common_1.BadRequestException(`身份锚定条目上限为 ${MAX_ANCHORS} 条，请先停用或删除现有条目`);
        }
        return this.prisma.identityAnchor.create({
            data: {
                label: data.label,
                content: data.content,
                sortOrder: data.sortOrder ?? 0,
                nickname: data.nickname ?? null,
                userKey: this.defaultUserKey,
            },
        });
    }
    async update(id, data) {
        if (data.content !== undefined) {
            const existing = await this.prisma.identityAnchor.findUnique({
                where: { id },
            });
            if (existing && existing.content !== data.content) {
                await this.prisma.identityAnchorHistory.create({
                    data: {
                        anchorId: id,
                        previousContent: existing.content,
                        newContent: data.content,
                    },
                });
            }
        }
        return this.prisma.identityAnchor.update({
            where: { id },
            data: {
                ...(data.label !== undefined && { label: data.label }),
                ...(data.content !== undefined && { content: data.content }),
                ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
                ...(data.nickname !== undefined && { nickname: data.nickname }),
            },
        });
    }
    async remove(id) {
        return this.prisma.identityAnchor.update({
            where: { id },
            data: { isActive: false },
        });
    }
    async getHistory() {
        return this.prisma.identityAnchorHistory.findMany({
            orderBy: { changedAt: 'desc' },
            take: 50,
        });
    }
    async migrateFromMemory() {
        const oldRecords = await this.prisma.memory.findMany({
            where: { category: 'identity_anchor' },
        });
        if (oldRecords.length === 0)
            return { migrated: 0 };
        let migrated = 0;
        for (const record of oldRecords) {
            await this.prisma.identityAnchor.create({
                data: {
                    userKey: this.defaultUserKey,
                    label: 'basic',
                    content: record.content,
                    sortOrder: 0,
                    nickname: null,
                },
            });
            await this.prisma.memory.update({
                where: { id: record.id },
                data: { decayScore: 0 },
            });
            migrated++;
        }
        return { migrated };
    }
};
exports.IdentityAnchorService = IdentityAnchorService;
exports.IdentityAnchorService = IdentityAnchorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], IdentityAnchorService);
//# sourceMappingURL=identity-anchor.service.js.map