import { Injectable } from '@nestjs/common';
import type { TaskPlanInput, TaskPlan } from './task-planner.types';

@Injectable()
export class TaskPlannerService {
  /**
   * 判断是否需要规划（规则优先，轻量级）
   */
  shouldPlan(input: TaskPlanInput): TaskPlan {
    const { intentState } = input;

    // 1. 明确的多步骤任务
    if (intentState?.escalation === '应转任务') {
      return this.createSimplePlan(input.userInput);
    }

    // 2. 复杂任务意图
    const complexTaskIntents = ['dev_task', 'general_tool'];
    if (intentState && complexTaskIntents.includes(intentState.taskIntent)) {
      return this.createSimplePlan(input.userInput);
    }

    return { shouldPlan: false };
  }

  private createSimplePlan(userInput: string): TaskPlan {
    // 简单启发式：根据关键词判断复杂度
    const steps: string[] = [];
    let complexity: 'low' | 'mid' | 'high' = 'low';

    if (userInput.includes('然后') || userInput.includes('接着') || userInput.includes('之后')) {
      complexity = 'mid';
      steps.push('理解需求', '执行第一步', '执行后续步骤', '确认完成');
    } else if (userInput.length > 100) {
      complexity = 'mid';
      steps.push('分析需求', '执行任务', '验证结果');
    } else {
      steps.push('执行任务', '确认完成');
    }

    return {
      shouldPlan: true,
      complexity,
      steps,
      estimatedMinutes: complexity === 'low' ? 5 : complexity === 'mid' ? 15 : 30,
    };
  }
}
