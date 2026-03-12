import { Injectable } from '@nestjs/common';
import { LlmService } from '../../infra/llm/llm.service';
import type { DevTaskContext } from '../dev-task-context';
import { GOAL_MAX_CHARS, PREVIEW_LIMIT } from '../dev-agent.constants';

/** 每步后的任务进度评估：轮中规则 + 轮末 LLM 评估。 */
@Injectable()
export class DevProgressEvaluator {
  constructor(private readonly llm: LlmService) {}

  async evaluateTaskProgress(
    goal: string,
    taskContext: DevTaskContext,
    options: { hasRemainingRoundSteps: boolean },
  ): Promise<{ done: boolean; reason: string }> {
    const safeGoal = String(goal ?? '').slice(0, GOAL_MAX_CHARS);
    if (options.hasRemainingRoundSteps) {
      return { done: false, reason: '当前轮仍有待执行步骤。' };
    }

    const recent = taskContext.stepResults.slice(-4).map((s) => ({
      stepId: s.stepId ?? '',
      command: s.command,
      success: s.success,
      output: this.preview(s.output),
      error: s.error,
    }));

    try {
      const response = await this.llm.generate([
        {
          role: 'system',
          content: `你是任务完成度评估器。根据目标与最近执行结果，判断任务是否完成。
仅输出 JSON：
{"done": true/false, "reason": "一句话原因"}。`,
        },
        {
          role: 'user',
          content: `目标：${safeGoal}\n最近步骤：${JSON.stringify(recent, null, 2)}`,
        },
      ], { scenario: 'reasoning' });

      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const cleaned = (jsonMatch[1] ?? response).trim();
      const parsed = JSON.parse(cleaned) as { done?: boolean; reason?: string };
      return {
        done: parsed.done === true,
        reason: parsed.reason ?? (parsed.done ? '任务目标已满足。' : '需要下一轮小步执行。'),
      };
    } catch {
      return { done: false, reason: '继续下一轮 small-step 规划。' };
    }
  }

  private preview(text: string | null | undefined): string | null {
    if (!text) return null;
    const normalized = text.trim();
    if (!normalized) return null;
    return normalized.length > PREVIEW_LIMIT
      ? `${normalized.slice(0, PREVIEW_LIMIT)}...`
      : normalized;
  }
}
