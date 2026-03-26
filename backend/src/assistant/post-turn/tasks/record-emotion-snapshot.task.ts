import type { PrismaService } from '../../../infra/prisma.service';
import type { FragilityLevel, UserEmotion } from '../../cognitive-pipeline/cognitive-pipeline.types';

export async function recordEmotionSnapshot(
  prisma: PrismaService,
  input: {
    conversationId: string;
    emotion: UserEmotion;
    fragility: FragilityLevel;
    confidence?: number;
    source: string;
    rawInput?: string | null;
  },
): Promise<void> {
  await prisma.emotionSnapshot.create({
    data: {
      conversationId: input.conversationId,
      detectedEmotion: input.emotion,
      fragility: input.fragility,
      confidence: input.confidence ?? 0.5,
      source: input.source,
      rawInput: input.rawInput?.slice(0, 200) || null,
    },
  });
}
