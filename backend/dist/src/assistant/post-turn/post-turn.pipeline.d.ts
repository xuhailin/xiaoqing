import type { PostTurnPlan, PostTurnTask } from './post-turn.types';
export declare class PostTurnPipeline {
    runBeforeReturn(plan: PostTurnPlan, runner: (task: PostTurnTask, plan: PostTurnPlan) => Promise<void>): Promise<void>;
    runAfterReturn(plan: PostTurnPlan, runner: (task: PostTurnTask, plan: PostTurnPlan) => Promise<void>): Promise<void>;
}
