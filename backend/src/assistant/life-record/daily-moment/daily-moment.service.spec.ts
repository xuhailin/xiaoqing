import { DailyMomentPolicy } from './daily-moment-policy';
import { DailyMomentService } from './daily-moment.service';

/**
 * 注意：DailyMomentService 已合并到 TracePoint 管线，
 * 构造函数依赖 TracePointService + DailySummaryService。
 * 以下测试仅验证 detectUserTriggerIntent / ingestUserSignal 等
 * 不依赖外部服务的逻辑。
 */

const fakeTracePointService = {
  getPointsForDay: async () => [],
} as any;

const fakeDailySummaryService = {
  generateForDay: async () => ({
    id: 'ds-1',
    dayKey: '2026-03-06',
    title: '测试日记',
    body: '测试内容',
    moodOverall: null,
    pointCount: 0,
    sourcePointIds: [],
    generatedBy: 'llm',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
} as any;

const fakeRepo = {
  saveRecord: async () => {},
  listRecordsByConversation: async () => [],
  saveSuggestion: async () => {},
  listSuggestionsByConversation: async () => [],
  markSuggestionAccepted: async () => {},
  saveFeedback: async () => {},
  saveSignal: async () => {},
  listSignalsByConversation: async () => [],
} as any;

const createService = () => {
  const policy = new DailyMomentPolicy();
  const service = new DailyMomentService(
    fakeTracePointService,
    fakeDailySummaryService,
    policy,
    fakeRepo,
  );
  return { service, policy };
};

describe('DailyMomentService (merged pipeline)', () => {
  it('手动日记指令应触发', async () => {
    const { service } = createService();
    const intent = await service.detectUserTriggerIntent(
      'c1',
      '写个今日日记',
      new Date('2026-03-06T09:00:00Z'),
    );
    expect(intent.shouldGenerate).toBe(true);
    expect(intent.mode).toBe('manual');
  });

  it('普通消息不触发', async () => {
    const { service } = createService();
    const intent = await service.detectUserTriggerIntent(
      'c1',
      '今天天气不错',
      new Date('2026-03-06T09:00:00Z'),
    );
    expect(intent.shouldGenerate).toBe(false);
  });

  it('碎片不够时不建议写日记', async () => {
    const { service } = createService();
    const result = await service.maybeSuggest({
      conversationId: 'c1',
      now: new Date('2026-03-06T09:00:00Z'),
    });
    expect(result.shouldSuggest).toBe(false);
    expect(result.reason).toContain('trace points');
  });

  it('generateMomentEntry 使用 DailySummary 生成', async () => {
    const { service } = createService();
    const { record, renderedText } = await service.generateMomentEntry({
      conversationId: 'c1',
      now: new Date('2026-03-06T09:00:00Z'),
      triggerMode: 'manual',
    });
    expect(record.title).toBe('测试日记');
    expect(record.body).toBe('测试内容');
    expect(renderedText).toContain('今日日记');
  });
});
