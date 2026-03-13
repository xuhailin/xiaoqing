import { Injectable } from '@nestjs/common';
import type { ReflectionInput, ReflectionResult } from './reflection.types';

@Injectable()
export class ReflectionService {
  /**
   * 评估本轮决策质量（规则优先，轻量级）
   */
  reflect(input: ReflectionInput): ReflectionResult {
    const issues: string[] = [];

    // 1. 错误检测
    if (input.hasError) {
      return {
        quality: 'failed',
        confidence: 1.0,
        issues: ['执行失败'],
        adjustmentHint: '上一轮执行失败，需要调整策略',
        shouldReplan: true,
      };
    }

    // 2. 意图-行动不匹配
    if (input.intentState && input.actionDecision) {
      const { taskIntent, requiresTool } = input.intentState;
      const { action } = input.actionDecision;

      if (taskIntent === 'dev_task' && action !== 'handoff_dev') {
        issues.push('dev_task 意图未路由到 dev');
      }

      if (requiresTool && action === 'direct_reply') {
        issues.push('工具意图被降级为聊天');
      }
    }

    // 3. 低置信度决策
    const confidence = input.actionDecision?.confidence ?? input.intentState?.confidence ?? 1.0;
    if (confidence < 0.5) {
      issues.push(`决策置信度过低: ${confidence}`);
    }

    // 4. 输出质量检测（简单启发式）
    if (input.assistantOutput.length < 10) {
      issues.push('输出过短');
    }

    // 综合评估
    if (issues.length === 0) {
      return { quality: 'good', confidence };
    }

    if (issues.length <= 2 && confidence >= 0.5) {
      return {
        quality: 'suboptimal',
        confidence,
        issues,
        adjustmentHint: issues.join('；'),
      };
    }

    return {
      quality: 'failed',
      confidence,
      issues,
      adjustmentHint: '多个问题，建议重新评估',
      shouldReplan: true,
    };
  }
}
