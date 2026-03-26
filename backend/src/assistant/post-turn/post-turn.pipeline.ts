import { Injectable, Logger } from '@nestjs/common';
import type { PostTurnPlan, PostTurnTask } from './post-turn.types';

@Injectable()
export class PostTurnPipeline {
  private readonly logger = new Logger(PostTurnPipeline.name);

  async runBeforeReturn(
    plan: PostTurnPlan,
    runner: (task: PostTurnTask, plan: PostTurnPlan) => Promise<void>,
  ): Promise<void> {
    for (const task of plan.beforeReturn) {
      await runner(task, plan);
    }
  }

  async runAfterReturn(
    plan: PostTurnPlan,
    runner: (task: PostTurnTask, plan: PostTurnPlan) => Promise<void>,
  ): Promise<void> {
    for (const task of plan.afterReturn) {
      try {
        await runner(task, plan);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        this.logger.error(
          `[PostTurn] Task ${task.type} failed for conversation ${plan.conversationId}: ${message}`,
          stack,
        );
      }
    }
  }
}
