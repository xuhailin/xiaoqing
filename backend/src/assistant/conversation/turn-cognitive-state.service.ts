import { Injectable } from '@nestjs/common';
import { CognitivePipelineService } from '../cognitive-pipeline/cognitive-pipeline.service';
import type { TurnContext } from './orchestration.types';

@Injectable()
export class TurnCognitiveStateService {
  constructor(
    private readonly cognitivePipeline: CognitivePipelineService,
  ) {}

  analyze(context: TurnContext): NonNullable<TurnContext['runtime']['cognitiveState']> {
    return this.cognitivePipeline.analyzeTurn({
      userInput: context.request.userInput,
      recentMessages: context.conversation.recentMessages,
      intentState: context.runtime.mergedIntentState ?? context.runtime.intentState ?? null,
      worldState: context.world.fullWorldState,
      growthContext: context.growth.growthContext,
      claimSignals: context.claims.claimSignals,
      sessionState: context.claims.sessionState,
      emotionTrend: context.runtime.emotionTrend ?? null,
      socialContext: {
        insights: context.social.insights.map((item) => ({
          content: item.content,
          confidence: item.confidence,
          relatedEntityIds: item.relatedEntityIds,
        })),
        relationSignals: context.social.relationSignals.map((item) => ({
          entityName: item.entityName,
          entityAliases: item.entityAliases,
          relation: item.entityRelation,
          trend: item.trend,
          quality: item.quality,
          note: item.notes,
        })),
      },
    });
  }
}
