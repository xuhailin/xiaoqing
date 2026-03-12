import type { GeneralActionCode } from '../../tools/general-action/types';

/** 本地基础行动能力执行结果，供小晴转述 */
export interface GeneralActionSkillResult {
  success: boolean;
  content: string;
  error?: string;
  code?: GeneralActionCode;
  meta?: Record<string, unknown>;
}

export interface GeneralActionSkillExecuteParams {
  /** 用户原始输入（single-step、deterministic） */
  input: string;
}
