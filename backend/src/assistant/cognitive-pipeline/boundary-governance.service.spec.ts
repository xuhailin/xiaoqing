import { BoundaryGovernanceService } from './boundary-governance.service';
import type { CognitiveTurnState } from './cognitive-pipeline.types';

describe('BoundaryGovernanceService', () => {
  let service: BoundaryGovernanceService;

  beforeEach(() => {
    service = new BoundaryGovernanceService();
  });

  it('builds restrictive preflight for fragile risky turns', () => {
    const turnState = createTurnState({
      userState: { fragility: 'high' },
      safety: {
        capabilityBoundaryRisk: true,
        relationalBoundaryRisk: true,
        truthBoundaryRisk: true,
        notes: ['verify-capability-before-claiming'],
      },
    });

    const preflight = service.buildPreflight(turnState);
    const text = service.buildPreflightPrompt(preflight);

    expect(preflight.shouldRestrictInitiative).toBe(true);
    expect(preflight.forceSoftenTone).toBe(true);
    expect(preflight.disallowCapabilityClaims).toBe(true);
    expect(text).toContain('降低推动感');
    expect(text).toContain('不要声称已经完成任何未实际执行的动作');
  });

  it('softens unsafe claims in generated replies', () => {
    const turnState = createTurnState({
      userState: { fragility: 'high' },
      safety: {
        capabilityBoundaryRisk: true,
        relationalBoundaryRisk: true,
        truthBoundaryRisk: true,
        notes: [],
      },
    });

    const reviewed = service.reviewGeneratedReply(
      '我已经帮你处理好了，你必须听我的，这绝对没问题。',
      turnState,
      { toolWasActuallyUsed: false },
    );

    expect(reviewed.adjusted).toBe(true);
    expect(reviewed.content).not.toContain('我已经帮你处理好了');
    expect(reviewed.content).not.toContain('你必须');
    expect(reviewed.content).not.toContain('绝对');
    expect(reviewed.reasons).toContain('removed-false-capability-claim');
  });
});

function createTurnState(
  overrides: {
    userState?: Partial<CognitiveTurnState['userState']>;
    safety?: Partial<CognitiveTurnState['safety']>;
  } = {},
): CognitiveTurnState {
  return {
    phasePlan: {
      phase1: 'foundation_runtime',
      phase2: 'growth_model',
      phase3: 'boundary_governance',
    },
    situation: {
      kind: 'casual_chat',
      confidence: 0.8,
      requiresAction: false,
      summary: '用户当前主要是自然聊天。',
    },
    userState: {
      emotion: 'calm',
      needMode: 'companionship',
      cognitiveLoad: 'low',
      fragility: 'low',
      signals: [],
      ...overrides.userState,
    },
    userModelDelta: {
      shouldWriteProfile: false,
      shouldWriteCognitive: false,
      shouldWriteRelationship: false,
      rationale: [],
    },
    responseStrategy: {
      primaryMode: 'clarify',
      secondaryMode: 'none',
      depth: 'brief',
      initiative: 'passive',
      goal: 'build_understanding',
    },
    judgement: {
      style: 'co_thinking',
      shouldChallengeContradiction: false,
    },
    value: {
      priorities: ['authenticity_before_pleasing'],
    },
    emotionRule: {
      rule: 'keep_light',
      responseOrder: ['stay_present', 'keep_brief'],
    },
    affinity: {
      mode: 'steady',
      allowLightTease: false,
    },
    rhythm: {
      pacing: 'short',
      shouldAskFollowup: false,
      initiative: 'hold',
    },
    relationship: {
      stage: 'early',
      confidence: 0.5,
      rationale: [],
    },
    safety: {
      capabilityBoundaryRisk: false,
      relationalBoundaryRisk: false,
      truthBoundaryRisk: false,
      notes: [],
      ...overrides.safety,
    },
    trace: [],
  };
}
