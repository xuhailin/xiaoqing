import { Injectable, Logger } from '@nestjs/common';
import type { PostTurnPlan, PostTurnTask } from './post-turn.types';

/**
 * PostTurnPipeline - 回合后处理调度器
 *
 * 所属层：
 *  - Post-turn
 *
 * 负责：
 *  - 顺序执行 beforeReturn / afterReturn 任务
 *  - 统一兜住 afterReturn 异常，避免影响主链路返回
 *
 * 不负责：
 *  - 不重新做感知、决策或表达
 *  - 不决定具体 post-turn 写回内容
 *  - 不直接拼装用户回复
 *
 * 输入：
 *  - PostTurnPlan、任务 runner
 *
 * 输出：
 *  - 任务执行副作用与日志
 *
 * ⚠️ 约束：
 *  - 只负责调度，不得新增业务写回逻辑
 */
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
