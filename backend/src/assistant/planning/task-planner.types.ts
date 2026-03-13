/**
 * 任务规划输入
 */
export interface TaskPlanInput {
  /** 用户输入 */
  userInput: string;
  /** 意图状态 */
  intentState?: {
    taskIntent: string;
    escalation: string;
    confidence: number;
  };
}

/**
 * 任务规划结果
 */
export interface TaskPlan {
  /** 是否需要规划 */
  shouldPlan: boolean;
  /** 任务复杂度 */
  complexity?: 'low' | 'mid' | 'high';
  /** 步骤列表 */
  steps?: string[];
  /** 预估时间（分钟） */
  estimatedMinutes?: number;
}
