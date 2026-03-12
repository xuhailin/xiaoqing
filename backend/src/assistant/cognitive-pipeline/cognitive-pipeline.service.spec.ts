import { CognitivePipelineService } from './cognitive-pipeline.service';

describe('CognitivePipelineService', () => {
  let service: CognitivePipelineService;

  beforeEach(() => {
    service = new CognitivePipelineService();
  });

  it('detects fragile emotional turns and plans empathic response', () => {
    const result = service.analyzeTurn({
      userInput: '我最近真的很焦虑，快撑不住了',
      recentMessages: [{ role: 'user', content: '我最近真的很焦虑，快撑不住了' }],
      intentState: null,
      worldState: null,
    });

    expect(result.situation.kind).toBe('emotional_expression');
    expect(result.userState.emotion).toBe('anxious');
    expect(result.userState.fragility).toBe('high');
    expect(result.responseStrategy.primaryMode).toBe('empathize');
    expect(result.emotionRule.rule).toBe('stabilize_first');
    expect(result.rhythm.shouldAskFollowup).toBe(false);
  });

  it('uses persisted growth context to stabilize relationship and values', () => {
    const result = service.analyzeTurn({
      userInput: '你帮我一起梳理下，我有点犹豫',
      recentMessages: [
        { role: 'user', content: '上次也是这样' },
        { role: 'assistant', content: '我们慢慢看' },
      ],
      intentState: {
        mode: 'thinking',
        seriousness: 'semi',
        expectation: '一起想',
        agency: '并肩思考者',
        requiresTool: false,
        taskIntent: 'none',
        slots: {},
        escalation: '不推进',
        confidence: 0.8,
        missingParams: [],
        identityUpdate: {},
        worldStateUpdate: {},
      },
      worldState: null,
      growthContext: {
        cognitiveProfiles: ['用户需要先被理解再进入分析'],
        judgmentPatterns: ['用户对模板感很敏感，通常会先校准判断框架'],
        valuePriorities: ['比起效率，用户更在意真实感与共创感'],
        rhythmPatterns: ['用户有时需要先留白，不要连续追问'],
        relationshipNotes: ['关系处于steady阶段；此类时刻适合warmer与balanced节奏'],
        boundaryNotes: ['本轮需注意：avoid-pressure-or-guilt'],
      },
    });

    expect(result.relationship.stage).toBe('steady');
    expect(result.relationship.confidence).toBeGreaterThan(0.8);
    expect(result.judgement.style).toBe('gentle_realism');
    expect(result.judgement.shouldChallengeContradiction).toBe(true);
    expect(result.value.priorities).toContain('understanding_before_solution');
    expect(result.value.priorities).toContain('collaboration_before_control');
    expect(result.value.priorities).toContain('authenticity_before_pleasing');
    expect(result.rhythm.shouldAskFollowup).toBe(false);
    expect(result.rhythm.initiative).toBe('hold');
    expect(result.safety.notes).toContain('respect-known-boundary-patterns');
  });
});
