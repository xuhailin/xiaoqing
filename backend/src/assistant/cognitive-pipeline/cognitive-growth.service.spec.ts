import { CognitiveGrowthService } from './cognitive-growth.service';
import type { PrismaService } from '../../infra/prisma.service';
import type { CognitiveTurnState } from './cognitive-pipeline.types';

describe('CognitiveGrowthService', () => {
  let queryRaw: jest.Mock;
  let executeRaw: jest.Mock;
  let memoryFindMany: jest.Mock;
  let cognitiveProfileFindMany: jest.Mock;
  let cognitiveProfileUpdate: jest.Mock;
  let relationshipStateFindMany: jest.Mock;
  let relationshipStateUpdate: jest.Mock;
  let boundaryEventFindMany: jest.Mock;
  let boundaryEventUpdate: jest.Mock;
  let boundaryEventDelete: jest.Mock;
  let service: CognitiveGrowthService;

  beforeEach(() => {
    queryRaw = jest.fn();
    executeRaw = jest.fn().mockResolvedValue(1);
    memoryFindMany = jest.fn();
    cognitiveProfileFindMany = jest.fn();
    cognitiveProfileUpdate = jest.fn().mockResolvedValue({});
    relationshipStateFindMany = jest.fn();
    relationshipStateUpdate = jest.fn().mockResolvedValue({});
    boundaryEventFindMany = jest.fn();
    boundaryEventUpdate = jest.fn().mockResolvedValue({});
    boundaryEventDelete = jest.fn().mockResolvedValue({});
    const prisma = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      memory: {
        findMany: memoryFindMany,
      },
      cognitiveProfile: {
        findMany: cognitiveProfileFindMany,
        update: cognitiveProfileUpdate,
      },
      relationshipState: {
        findMany: relationshipStateFindMany,
        update: relationshipStateUpdate,
      },
      boundaryEvent: {
        findMany: boundaryEventFindMany,
        update: boundaryEventUpdate,
        delete: boundaryEventDelete,
      },
    } as unknown as PrismaService;
    service = new CognitiveGrowthService(prisma);
  });

  it('hydrates growth context from dedicated tables', async () => {
    queryRaw
      .mockResolvedValueOnce([{ content: '用户更容易在并肩梳理中打开思路' }])
      .mockResolvedValueOnce([{ summary: '关系处于steady阶段；此类时刻适合warmer与balanced节奏' }])
      .mockResolvedValueOnce([{ note: '本轮需注意：avoid-pressure-or-guilt' }])
      // checkStagePromotion: query current confirmed relationship
      .mockResolvedValueOnce([]);
    memoryFindMany
      .mockResolvedValueOnce([{ content: '用户容易先校准判断框架' }])
      .mockResolvedValueOnce([{ content: '比起效率，用户更在意真实感' }])
      .mockResolvedValueOnce([{ content: '用户有时需要先留白再继续' }]);

    const result = await service.getGrowthContext();

    expect(result.cognitiveProfiles).toEqual(['用户更容易在并肩梳理中打开思路']);
    expect(result.judgmentPatterns).toEqual(['用户容易先校准判断框架']);
    expect(result.valuePriorities).toEqual(['比起效率，用户更在意真实感']);
    expect(result.rhythmPatterns).toEqual(['用户有时需要先留白再继续']);
    expect(result.relationshipNotes).toEqual(['关系处于steady阶段；此类时刻适合warmer与balanced节奏']);
    expect(result.boundaryNotes).toEqual(['本轮需注意：avoid-pressure-or-guilt']);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(memoryFindMany).toHaveBeenCalledTimes(3);
  });

  it('persists profile, relationship, and boundary records for growth-worthy turns', async () => {
    queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.recordTurnGrowth(createGrowthTurnState(), ['u1', 'a1']);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw).toHaveBeenCalledTimes(3);
  });

  it('archives or weakens growth records when a conversation is deleted', async () => {
    cognitiveProfileFindMany.mockResolvedValueOnce([
      {
        id: 'cp-1',
        status: 'confirmed',
        isActive: true,
        confidence: 0.8,
        hitCount: 2,
        sourceMessageIds: ['u1', 'a1'],
      },
      {
        id: 'cp-2',
        status: 'pending',
        isActive: true,
        confidence: 0.7,
        hitCount: 1,
        sourceMessageIds: ['u1', 'persisted'],
      },
    ]);
    relationshipStateFindMany.mockResolvedValueOnce([
      {
        id: 'rs-1',
        status: 'confirmed',
        isActive: true,
        trustScore: 0.7,
        closenessScore: 0.75,
        hitCount: 1,
        sourceMessageIds: ['u1', 'a1'],
      },
    ]);
    boundaryEventFindMany.mockResolvedValueOnce([
      { id: 'be-1', sourceMessageIds: ['u1', 'a1'] },
      { id: 'be-2', sourceMessageIds: ['u1', 'carry'] },
    ]);

    const result = await service.cleanupGrowthForDeletedMessages(['u1', 'a1']);

    expect(result).toEqual({
      archivedProfiles: 1,
      weakenedProfiles: 1,
      archivedRelationships: 1,
      weakenedRelationships: 0,
      deletedBoundaryEvents: 1,
      weakenedBoundaryEvents: 1,
    });
    expect(cognitiveProfileUpdate).toHaveBeenCalledTimes(2);
    expect(relationshipStateUpdate).toHaveBeenCalledTimes(1);
    expect(boundaryEventDelete).toHaveBeenCalledTimes(1);
    expect(boundaryEventUpdate).toHaveBeenCalledTimes(1);
  });
});

function createGrowthTurnState(): CognitiveTurnState {
  return {
    phasePlan: {
      phase1: 'foundation_runtime',
      phase2: 'growth_model',
      phase3: 'boundary_governance',
    },
    situation: {
      kind: 'co_thinking',
      confidence: 0.85,
      requiresAction: true,
      summary: '用户希望一起梳理想法。',
    },
    userState: {
      emotion: 'anxious',
      needMode: 'co_thinking',
      cognitiveLoad: 'medium',
      fragility: 'high',
      signals: ['thinking-mode'],
    },
    userModelDelta: {
      shouldWriteProfile: false,
      shouldWriteCognitive: true,
      shouldWriteRelationship: true,
      rationale: ['growth-worthy'],
    },
    responseStrategy: {
      primaryMode: 'reflect',
      secondaryMode: 'gentle_probe',
      depth: 'medium',
      initiative: 'balanced',
      goal: 'co_think',
    },
    judgement: {
      style: 'supportive_clarity',
      shouldChallengeContradiction: false,
    },
    value: {
      priorities: ['stability_before_analysis', 'truth_over_performance'],
    },
    emotionRule: {
      rule: 'stabilize_first',
      responseOrder: ['acknowledge', 'stabilize'],
    },
    affinity: {
      mode: 'gentle_distance',
      allowLightTease: false,
    },
    rhythm: {
      pacing: 'balanced',
      shouldAskFollowup: false,
      initiative: 'hold',
    },
    relationship: {
      stage: 'familiar',
      confidence: 0.7,
      rationale: ['recent-turns>=4'],
    },
    safety: {
      capabilityBoundaryRisk: false,
      relationalBoundaryRisk: true,
      truthBoundaryRisk: false,
      notes: ['avoid-pressure-or-guilt'],
    },
    trace: [],
  };
}
