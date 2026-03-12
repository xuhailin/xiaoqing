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
exports.TurnContextAssembler = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
const persona_service_1 = require("../persona/persona.service");
const user_profile_service_1 = require("../persona/user-profile.service");
const identity_anchor_service_1 = require("../identity-anchor/identity-anchor.service");
const world_state_service_1 = require("../../infra/world-state/world-state.service");
const cognitive_growth_service_1 = require("../cognitive-pipeline/cognitive-growth.service");
let TurnContextAssembler = class TurnContextAssembler {
    prisma;
    persona;
    userProfile;
    identityAnchor;
    worldState;
    cognitiveGrowth;
    constructor(prisma, persona, userProfile, identityAnchor, worldState, cognitiveGrowth) {
        this.prisma = prisma;
        this.persona = persona;
        this.userProfile = userProfile;
        this.identityAnchor = identityAnchor;
        this.worldState = worldState;
        this.cognitiveGrowth = cognitiveGrowth;
    }
    async assembleBase(input) {
        const [recentRaw, personaDto, profile, anchors, storedWorldState, growthContext] = await Promise.all([
            this.prisma.message.findMany({
                where: { conversationId: input.conversationId },
                orderBy: { createdAt: 'desc' },
                take: Math.max(0, input.recentRounds) * 2,
            }),
            this.persona.getOrCreate(),
            this.userProfile.getOrCreate(),
            this.identityAnchor.getActiveAnchors(),
            this.worldState.get(input.conversationId),
            this.cognitiveGrowth.getGrowthContext(),
        ]);
        const recentMessages = recentRaw
            .reverse()
            .map((m) => ({ role: m.role, content: m.content }));
        const anchorText = this.identityAnchor.buildAnchorText(anchors);
        const anchorCity = anchors.find((a) => a.label === 'location')?.content?.trim() || undefined;
        const defaultWorldState = anchorCity && !storedWorldState?.city
            ? { ...(storedWorldState ?? {}), city: anchorCity }
            : storedWorldState;
        return {
            request: {
                conversationId: input.conversationId,
                now: input.now,
                userInput: input.userInput,
                userMessage: input.userMessage,
            },
            conversation: { recentMessages },
            persona: {
                personaDto,
                expressionFields: this.persona.getExpressionFields(personaDto),
                metaFilterPolicy: personaDto.metaFilterPolicy ?? null,
            },
            user: {
                userProfile: profile,
                identityAnchors: anchors,
                anchorText,
                ...(anchorCity ? { anchorCity } : {}),
            },
            world: {
                storedWorldState,
                defaultWorldState,
            },
            growth: { growthContext },
            claims: {
                claimSignals: [],
                claimPolicyText: '',
                sessionState: null,
                sessionStateText: '',
                injectedClaimsDebug: [],
                draftClaimsDebug: [],
            },
            runtime: {},
        };
    }
};
exports.TurnContextAssembler = TurnContextAssembler;
exports.TurnContextAssembler = TurnContextAssembler = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        persona_service_1.PersonaService,
        user_profile_service_1.UserProfileService,
        identity_anchor_service_1.IdentityAnchorService,
        world_state_service_1.WorldStateService,
        cognitive_growth_service_1.CognitiveGrowthService])
], TurnContextAssembler);
//# sourceMappingURL=turn-context-assembler.service.js.map