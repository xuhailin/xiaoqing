import { DailyMomentTriggerEvaluator } from './daily-moment-trigger.evaluator';
import { DailyMomentSnippetExtractor } from './daily-moment-snippet.extractor';
import { DailyMomentGenerator } from './daily-moment-generator';
import { DailyMomentPolicy } from './daily-moment-policy';
import { DailyMomentService } from './daily-moment.service';
import type { DailyMomentChatMessage } from './daily-moment.types';

const makeMessage = (
  id: string,
  role: 'user' | 'assistant',
  content: string,
  ts: string,
): DailyMomentChatMessage => ({
  id,
  role,
  content,
  createdAt: new Date(ts),
});

const createService = () => {
  const evaluator = new DailyMomentTriggerEvaluator();
  const extractor = new DailyMomentSnippetExtractor();
  const fakeLlm = {
    generate: async () => {
      throw new Error('mock-fallback');
    },
  };
  const generator = new DailyMomentGenerator(fakeLlm as never);
  const policy = new DailyMomentPolicy();
  return {
    evaluator,
    service: new DailyMomentService(evaluator, extractor, generator, policy),
  };
};

describe('DailyMoment modules', () => {
  it('场景1：轻松调侃可触发候选并可生成日记', async () => {
    const { evaluator, service } = createService();
    const messages: DailyMomentChatMessage[] = [
      makeMessage('m1', 'user', '我刚吃了一整个苹果', '2026-03-06T09:00:00.000Z'),
      makeMessage('m2', 'assistant', '苹果是脆甜的还是偏酸的？', '2026-03-06T09:00:10.000Z'),
      makeMessage('m3', 'user', '是那种容易塞牙缝的', '2026-03-06T09:00:20.000Z'),
      makeMessage('m4', 'assistant', '那种我也怕……', '2026-03-06T09:00:30.000Z'),
      makeMessage('m5', 'user', '你想多了，我可没塞哦', '2026-03-06T09:00:40.000Z'),
      makeMessage('m6', 'assistant', '那就好，是我多操心啦', '2026-03-06T09:00:50.000Z'),
      makeMessage('m7', 'user', '你连苹果都吃不到吧～', '2026-03-06T09:01:00.000Z'),
    ];

    const evaluation = evaluator.evaluate(messages, {
      now: new Date('2026-03-06T09:01:05.000Z'),
      intentMode: 'chat',
      intentRequiresTool: false,
      intentSeriousness: 'casual',
    });

    expect(evaluation.decision).toBe('suggest');
    expect(evaluation.score).toBeGreaterThanOrEqual(0.62);

    const suggestion = await service.maybeSuggest({
      conversationId: 'c1',
      recentMessages: messages,
      now: new Date('2026-03-06T09:01:10.000Z'),
      triggerContext: {
        intentMode: 'chat',
        intentRequiresTool: false,
        intentSeriousness: 'casual',
      },
    });

    expect(suggestion.shouldSuggest).toBe(true);
    expect(suggestion.suggestion?.hint).toContain('日记');

    const generated = await service.generateMomentEntry({
      conversationId: 'c1',
      recentMessages: messages,
      now: new Date('2026-03-06T09:02:00.000Z'),
      triggerMode: 'manual',
    });

    expect(generated.record.title.length).toBeGreaterThan(0);
    expect(generated.record.body.length).toBeGreaterThan(0);
    expect(generated.renderedText).toContain('今日日记');
  });

  it('场景2：纯任务型不触发', async () => {
    const { evaluator, service } = createService();
    const messages: DailyMomentChatMessage[] = [
      makeMessage('t1', 'user', '帮我查明天东京天气', '2026-03-06T10:00:00.000Z'),
      makeMessage('t2', 'assistant', '好的，我来查。', '2026-03-06T10:00:05.000Z'),
    ];

    const evaluation = evaluator.evaluate(messages, {
      now: new Date('2026-03-06T10:00:06.000Z'),
      intentMode: 'task',
      intentRequiresTool: true,
      intentSeriousness: 'focused',
    });

    expect(evaluation.decision).toBe('none');
    expect(evaluation.suppressionReason).toBe('tool_or_task_context');

    const suggestion = await service.maybeSuggest({
      conversationId: 'c-task',
      recentMessages: messages,
      now: new Date('2026-03-06T10:00:10.000Z'),
      triggerContext: {
        intentMode: 'task',
        intentRequiresTool: true,
        intentSeriousness: 'focused',
      },
    });

    expect(suggestion.shouldSuggest).toBe(false);
  });

  it('场景3：严肃情绪不触发', async () => {
    const { evaluator, service } = createService();
    const messages: DailyMomentChatMessage[] = [
      makeMessage('s1', 'user', '我今天真的很难受，感觉撑不住了', '2026-03-06T11:00:00.000Z'),
      makeMessage('s2', 'assistant', '我在，先慢一点。', '2026-03-06T11:00:05.000Z'),
    ];

    const evaluation = evaluator.evaluate(messages, {
      now: new Date('2026-03-06T11:00:06.000Z'),
      intentMode: 'chat',
      intentRequiresTool: false,
      intentSeriousness: 'focused',
      detectedEmotion: 'low',
    });

    expect(evaluation.decision).toBe('none');
    expect(evaluation.suppressionReason).toBeDefined();

    const suggestion = await service.maybeSuggest({
      conversationId: 'c-serious',
      recentMessages: messages,
      now: new Date('2026-03-06T11:01:00.000Z'),
      triggerContext: {
        intentMode: 'chat',
        intentRequiresTool: false,
        intentSeriousness: 'focused',
        detectedEmotion: 'low',
      },
    });

    expect(suggestion.shouldSuggest).toBe(false);
  });

  it('场景4：手动触发但上下文很少也可生成轻量版', async () => {
    const { service } = createService();
    const messages: DailyMomentChatMessage[] = [
      makeMessage('l1', 'user', '写个今日日记', '2026-03-06T12:00:00.000Z'),
    ];

    const generated = await service.generateMomentEntry({
      conversationId: 'c-light',
      recentMessages: messages,
      now: new Date('2026-03-06T12:00:05.000Z'),
      triggerMode: 'manual',
    });

    expect(generated.record.title).toContain('轻量版');
    expect(generated.record.body).toContain('今天');
  });

  it('场景5：同天触发频控生效', async () => {
    const { service } = createService();
    const playful: DailyMomentChatMessage[] = [
      makeMessage('p1', 'user', '我刚吃了一整个苹果', '2026-03-06T10:00:00.000Z'),
      makeMessage('p2', 'assistant', '苹果是脆甜的还是偏酸的？', '2026-03-06T10:00:05.000Z'),
      makeMessage('p3', 'user', '是那种容易塞牙缝的', '2026-03-06T10:00:10.000Z'),
      makeMessage('p4', 'assistant', '那种我也怕……', '2026-03-06T10:00:15.000Z'),
      makeMessage('p5', 'user', '你想多了，我可没塞哦', '2026-03-06T10:00:20.000Z'),
      makeMessage('p6', 'assistant', '那就好，是我多操心啦', '2026-03-06T10:00:25.000Z'),
      makeMessage('p7', 'user', '你连苹果都吃不到吧～', '2026-03-06T10:00:30.000Z'),
    ];
    const warm: DailyMomentChatMessage[] = [
      makeMessage('w1', 'user', '刚刚那句谢谢你，我真的有被接住', '2026-03-06T11:10:00.000Z'),
      makeMessage('w2', 'assistant', '嗯，我在，慢慢来。', '2026-03-06T11:10:05.000Z'),
      makeMessage('w3', 'user', '你这句让我一下放松了', '2026-03-06T11:10:10.000Z'),
      makeMessage('w4', 'assistant', '那就好，今天先把这点安稳抱住。', '2026-03-06T11:10:15.000Z'),
      makeMessage('w5', 'user', '好，心里没那么紧了', '2026-03-06T11:10:20.000Z'),
    ];

    const first = await service.maybeSuggest({
      conversationId: 'c-cap',
      recentMessages: playful,
      now: new Date('2026-03-06T10:00:30.000Z'),
      triggerContext: {
        intentMode: 'chat',
        intentRequiresTool: false,
        intentSeriousness: 'casual',
      },
    });
    expect(first.shouldSuggest).toBe(true);

    const second = await service.maybeSuggest({
      conversationId: 'c-cap',
      recentMessages: playful,
      now: new Date('2026-03-06T10:20:00.000Z'),
      triggerContext: {
        intentMode: 'chat',
        intentRequiresTool: false,
        intentSeriousness: 'casual',
      },
    });
    expect(second.shouldSuggest).toBe(false);

    const third = await service.maybeSuggest({
      conversationId: 'c-cap',
      recentMessages: warm,
      now: new Date('2026-03-06T11:10:30.000Z'),
      triggerContext: {
        intentMode: 'chat',
        intentRequiresTool: false,
        intentSeriousness: 'casual',
      },
    });
    expect(third.shouldSuggest).toBe(true);

    const fourth = await service.maybeSuggest({
      conversationId: 'c-cap',
      recentMessages: warm,
      now: new Date('2026-03-06T12:50:00.000Z'),
      triggerContext: {
        intentMode: 'chat',
        intentRequiresTool: false,
        intentSeriousness: 'casual',
      },
    });
    expect(fourth.shouldSuggest).toBe(false);
    expect(fourth.evaluation.suppressionReason).toBe('policy_blocked');
  });

  it('场景6：用户负反馈会降低偶发触发概率（手动触发仍可用）', async () => {
    const { service } = createService();
    const messages: DailyMomentChatMessage[] = [
      makeMessage('n1', 'user', '我刚吃了一整个苹果', '2026-03-06T09:00:00.000Z'),
      makeMessage('n2', 'assistant', '苹果是脆甜的还是偏酸的？', '2026-03-06T09:00:05.000Z'),
      makeMessage('n3', 'user', '是那种容易塞牙缝的', '2026-03-06T09:00:10.000Z'),
      makeMessage('n4', 'assistant', '那种我也怕……', '2026-03-06T09:00:15.000Z'),
      makeMessage('n5', 'user', '你想多了，我可没塞哦', '2026-03-06T09:00:20.000Z'),
      makeMessage('n6', 'assistant', '那就好，是我多操心啦', '2026-03-06T09:00:25.000Z'),
      makeMessage('n7', 'user', '你连苹果都吃不到吧～', '2026-03-06T09:00:30.000Z'),
    ];

    await service.ingestUserSignal('c-negative', '这个有点尴尬，没必要', new Date('2026-03-06T09:02:00.000Z'));
    await service.ingestUserSignal('c-negative', '别写了，不需要这个', new Date('2026-03-06T09:03:00.000Z'));

    const suggestion = await service.maybeSuggest({
      conversationId: 'c-negative',
      recentMessages: messages,
      now: new Date('2026-03-06T09:05:00.000Z'),
      triggerContext: {
        intentMode: 'chat',
        intentRequiresTool: false,
        intentSeriousness: 'casual',
      },
    });

    expect(suggestion.shouldSuggest).toBe(false);
    expect(suggestion.evaluation.score).toBeLessThan(suggestion.evaluation.threshold.high);

    const manualIntent = await service.detectUserTriggerIntent(
      'c-negative',
      '写个今日日记',
      new Date('2026-03-06T09:06:00.000Z'),
    );
    expect(manualIntent.shouldGenerate).toBe(true);
    expect(manualIntent.mode).toBe('manual');
  });
});
