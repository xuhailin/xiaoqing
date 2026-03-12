import { Injectable } from '@nestjs/common';
import type { PostTurnPlan, PostTurnTask } from './post-turn.types';

@Injectable()
export class PostTurnPipeline {
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
      await runner(task, plan);
    }
  }
}
