/**
 * 结构化表达控制参数（表达层控制信号的正式入口）。
 *
 * Prompt Block 收敛只是治理过渡；从这里开始，表达层控制优先进入
 * `ExpressionControlState`，而不是新增平级 prose block。
 */
export interface ExpressionControlState {
  warmth: number;
  directness: number;
  humor: 'low' | 'normal' | 'high';
  bondTone: 'professional' | 'warm' | 'close' | 'playful';
  verbosity: 'minimal' | 'normal' | 'elaborated';
  replyMode: 'empathy_first' | 'solution_first' | 'question' | 'acknowledge' | 'tool_result';
  pacing: 'slow_gentle' | 'normal' | 'direct_quick';
  followupDepth: 'none' | 'light' | 'deep';
  mentionMemory: boolean;
  useNickname: boolean;
  boundaryLevel: 'normal' | 'cautious' | 'restricted';
}
