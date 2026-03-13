/**
 * Reflection 输入：本轮对话的决策上下文
 */
export interface ReflectionInput {
  /** 用户输入 */
  userInput: string;
  /** 意图状态 */
  intentState?: {
    taskIntent: string;
    confidence: number;
    requiresTool: boolean;
  };
  /** 行动决策 */
  actionDecision?: {
    action: string;
    reason: string;
    confidence: number;
  };
  /** 工具策略 */
  toolPolicy?: {
    action: string;
    capability?: string;
  };
  /** 助手输出 */
  assistantOutput: string;
  /** 是否有错误 */
  hasError?: boolean;
}

/**
 * Reflection 输出：决策质量评估与调整建议
 */
export interface ReflectionResult {
  /** 决策质量 */
  quality: 'good' | 'suboptimal' | 'failed';
  /** 置信度 */
  confidence: number;
  /** 问题诊断 */
  issues?: string[];
  /** 调整建议（写入 sessionState，影响下一轮） */
  adjustmentHint?: string;
  /** 是否需要重新规划 */
  shouldReplan?: boolean;
}
