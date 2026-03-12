import { PrismaService } from '../../infra/prisma.service';
import { PersonaService } from '../persona/persona.service';
import { UserProfileService } from '../persona/user-profile.service';
import { IdentityAnchorService } from '../identity-anchor/identity-anchor.service';
import { WorldStateService } from '../../infra/world-state/world-state.service';
import { CognitiveGrowthService } from '../cognitive-pipeline/cognitive-growth.service';
import type { TurnContext } from './orchestration.types';
export declare class TurnContextAssembler {
    private readonly prisma;
    private readonly persona;
    private readonly userProfile;
    private readonly identityAnchor;
    private readonly worldState;
    private readonly cognitiveGrowth;
    constructor(prisma: PrismaService, persona: PersonaService, userProfile: UserProfileService, identityAnchor: IdentityAnchorService, worldState: WorldStateService, cognitiveGrowth: CognitiveGrowthService);
    assembleBase(input: {
        conversationId: string;
        userInput: string;
        userMessage: {
            id: string;
            role: 'user';
            content: string;
            createdAt: Date;
        };
        now: Date;
        recentRounds: number;
    }): Promise<TurnContext>;
}
