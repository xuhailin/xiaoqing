import { DailyMomentPolicy } from './daily-moment-policy';
import type { DailyMomentFeedbackSummary, DailyMomentSuggestion } from './daily-moment.types';

const baseSummary = (): DailyMomentFeedbackSummary => ({
  likeCount: 0,
  awkwardCount: 0,
  ignoredCount: 0,
  neutralCount: 0,
  positiveSignalCount: 0,
  negativeSignalCount: 0,
  acceptedSuggestionCount: 0,
  repeatRequestCount: 0,
  bookmarkOrViewCount: 0,
});

const suggestion = (id: string, ts: string): DailyMomentSuggestion => ({
  id,
  conversationId: 'c1',
  hint: 'hint',
  createdAt: new Date(ts),
  score: 0.75,
  sourceMessageIds: [],
  accepted: false,
});

describe('DailyMomentPolicy', () => {
  const policy = new DailyMomentPolicy();

  it('should block on serious topic', () => {
    const result = policy.evaluate({
      conversationId: 'c1',
      now: new Date('2026-03-06T10:00:00.000Z'),
      isSeriousTopic: true,
      shortReplyStreak: 0,
      feedbackSummary: baseSummary(),
      recentSuggestions: [],
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('serious-topic');
  });

  it('should block when short reply streak is high', () => {
    const result = policy.evaluate({
      conversationId: 'c1',
      now: new Date('2026-03-06T10:00:00.000Z'),
      isSeriousTopic: false,
      shortReplyStreak: 4,
      feedbackSummary: baseSummary(),
      recentSuggestions: [],
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('short-reply-streak');
  });

  it('should enforce daily and hourly caps', () => {
    const now = new Date('2026-03-06T10:30:00');
    const hourlyBlocked = policy.evaluate({
      conversationId: 'c1',
      now,
      isSeriousTopic: false,
      shortReplyStreak: 0,
      feedbackSummary: baseSummary(),
      recentSuggestions: [suggestion('s1', '2026-03-06T10:05:00')],
    });
    expect(hourlyBlocked.allow).toBe(false);
    expect(hourlyBlocked.reason).toBe('hourly-cap-reached');

    const dailyBlocked = policy.evaluate({
      conversationId: 'c1',
      now: new Date('2026-03-06T22:00:00'),
      isSeriousTopic: false,
      shortReplyStreak: 0,
      feedbackSummary: baseSummary(),
      recentSuggestions: [
        suggestion('s1', '2026-03-06T09:00:00'),
        suggestion('s2', '2026-03-06T14:00:00'),
      ],
    });
    expect(dailyBlocked.allow).toBe(false);
    expect(dailyBlocked.reason).toBe('daily-cap-reached');
  });

  it('should raise score bias when user gives negative/cold feedback', () => {
    const summary = baseSummary();
    summary.awkwardCount = 2;
    summary.ignoredCount = 3;
    summary.negativeSignalCount = 2;

    const result = policy.evaluate({
      conversationId: 'c1',
      now: new Date('2026-03-07T10:00:00.000Z'),
      isSeriousTopic: false,
      shortReplyStreak: 2,
      feedbackSummary: summary,
      recentSuggestions: [],
    });

    expect(result.allow).toBe(true);
    expect(result.scoreBias).toBeGreaterThan(0);
  });

  it('should lower score bias when user likes and reuses the feature', () => {
    const summary = baseSummary();
    summary.likeCount = 2;
    summary.positiveSignalCount = 3;
    summary.acceptedSuggestionCount = 2;
    summary.repeatRequestCount = 1;
    summary.bookmarkOrViewCount = 1;

    const result = policy.evaluate({
      conversationId: 'c1',
      now: new Date('2026-03-07T10:00:00.000Z'),
      isSeriousTopic: false,
      shortReplyStreak: 0,
      feedbackSummary: summary,
      recentSuggestions: [],
    });

    expect(result.allow).toBe(true);
    expect(result.scoreBias).toBeLessThan(0);
  });
});
