import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService } from '../persona/persona.service';
import { UserProfileService } from '../persona/user-profile.service';
import { IdentityAnchorService } from '../identity-anchor/identity-anchor.service';
import { WorldStateService } from '../../infra/world-state/world-state.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import type { TurnContext } from './orchestration.types';

@Injectable()
export class TurnContextAssembler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persona: PersonaService,
    private readonly userProfile: UserProfileService,
    private readonly identityAnchor: IdentityAnchorService,
    private readonly worldState: WorldStateService,
    private readonly cognitiveGrowth: CognitiveGrowthService,
  ) {}

  async assembleBase(input: {
    conversationId: string;
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    now: Date;
    recentRounds: number;
  }): Promise<TurnContext> {
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
    const defaultWorldState =
      anchorCity && !storedWorldState?.city
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
}
