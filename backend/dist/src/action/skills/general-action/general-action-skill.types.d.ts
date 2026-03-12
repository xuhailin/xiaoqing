import type { GeneralActionCode } from '../../tools/general-action/types';
export interface GeneralActionSkillResult {
    success: boolean;
    content: string;
    error?: string;
    code?: GeneralActionCode;
    meta?: Record<string, unknown>;
}
export interface GeneralActionSkillExecuteParams {
    input: string;
}
