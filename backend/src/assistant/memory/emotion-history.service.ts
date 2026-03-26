import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import type { EmotionTrendSummary, UserEmotion } from '../cognitive-pipeline/cognitive-pipeline.types';

@Injectable()
export class EmotionHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecentTrend(conversationId: string): Promise<EmotionTrendSummary | null> {
    const snapshots = await this.prisma.emotionSnapshot.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 7,
    });

    if (snapshots.length < 2) {
      return null;
    }

    const dominantEmotion = this.pickDominantEmotion(
      snapshots.map((snapshot) => snapshot.detectedEmotion as UserEmotion),
    );

    const recentSnapshots = snapshots.slice(0, 3).map((snapshot) => ({
      emotion: snapshot.detectedEmotion as UserEmotion,
      fragility: snapshot.fragility as 'low' | 'medium' | 'high',
      createdAt: snapshot.createdAt,
    }));

    const fragileRisk = recentSnapshots.filter((snapshot) => snapshot.fragility === 'high').length >= 2;

    const recentScore = snapshots
      .slice(0, 3)
      .reduce((sum, snapshot) => sum + this.scoreEmotion(snapshot.detectedEmotion as UserEmotion), 0);
    const olderScore = snapshots
      .slice(3)
      .reduce((sum, snapshot) => sum + this.scoreEmotion(snapshot.detectedEmotion as UserEmotion), 0);

    const recentTrend =
      recentScore > olderScore + 1
        ? 'improving'
        : recentScore < olderScore - 1
          ? 'declining'
          : 'stable';

    return {
      dominantEmotion,
      recentTrend,
      fragileRisk,
      recentSnapshots,
    };
  }

  private pickDominantEmotion(emotions: UserEmotion[]): UserEmotion | null {
    if (emotions.length === 0) return null;

    const counts = new Map<UserEmotion, number>();
    for (const emotion of emotions) {
      counts.set(emotion, (counts.get(emotion) ?? 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  private scoreEmotion(emotion: UserEmotion): number {
    if (emotion === 'hurt' || emotion === 'low' || emotion === 'anxious') return -1;
    if (emotion === 'happy' || emotion === 'excited') return 1;
    return 0;
  }
}
