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
exports.WorldStateService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let WorldStateService = class WorldStateService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async get(conversationId) {
        const conv = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { worldState: true },
        });
        const raw = conv?.worldState;
        if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }
        return this.normalizeRecord(raw);
    }
    async update(conversationId, update) {
        const current = await this.get(conversationId);
        const next = { ...current ?? {} };
        if (typeof update.city === 'string' && update.city.trim()) {
            next.city = update.city.trim();
        }
        if (typeof update.timezone === 'string' && update.timezone.trim()) {
            next.timezone = update.timezone.trim();
        }
        if (typeof update.language === 'string' && update.language.trim()) {
            next.language = update.language.trim();
        }
        if (typeof update.device === 'string' && update.device.trim()) {
            next.device = update.device.trim();
        }
        if (typeof update.conversationMode === 'string' && update.conversationMode.trim()) {
            const mode = update.conversationMode.trim();
            const allowed = ['chat', 'thinking', 'decision', 'task'];
            if (allowed.includes(mode)) {
                next.conversationMode = mode;
            }
        }
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { worldState: next },
        });
    }
    async mergeSlots(conversationId, intent, fallbackWorldState) {
        const world = await this.get(conversationId);
        const effectiveWorld = {
            ...(fallbackWorldState ?? {}),
            ...(world ?? {}),
        };
        const slots = { ...intent.slots };
        let missingParams = [...intent.missingParams];
        const filledFromWorldState = [];
        if (!intent.requiresTool) {
            return {
                merged: { ...intent, slots, missingParams },
                filledFromWorldState,
            };
        }
        if (intent.taskIntent === 'weather_query') {
            const hasCoordinate = typeof slots.location === 'string' && slots.location.trim();
            const hasCity = typeof slots.city === 'string' && slots.city.trim();
            if (!hasCoordinate && !hasCity && effectiveWorld.city?.trim()) {
                slots.city = effectiveWorld.city.trim();
                missingParams = missingParams.filter((p) => p.toLowerCase() !== 'city');
                filledFromWorldState.push('city');
            }
        }
        return {
            merged: { ...intent, slots, missingParams },
            filledFromWorldState,
        };
    }
    normalizeRecord(raw) {
        const out = {};
        if (typeof raw.city === 'string' && raw.city.trim())
            out.city = raw.city.trim();
        if (typeof raw.timezone === 'string' && raw.timezone.trim())
            out.timezone = raw.timezone.trim();
        if (typeof raw.language === 'string' && raw.language.trim())
            out.language = raw.language.trim();
        if (typeof raw.device === 'string' && raw.device.trim())
            out.device = raw.device.trim();
        if (typeof raw.conversationMode === 'string' && raw.conversationMode.trim()) {
            const m = raw.conversationMode.trim();
            if (['chat', 'thinking', 'decision', 'task'].includes(m)) {
                out.conversationMode = m;
            }
        }
        return out;
    }
};
exports.WorldStateService = WorldStateService;
exports.WorldStateService = WorldStateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WorldStateService);
//# sourceMappingURL=world-state.service.js.map