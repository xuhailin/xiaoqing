import type { DialogueIntentState } from '../intent/intent.types';
import type { PersonaDto } from '../persona/persona.service';
import type { ToolKind, TurnContext } from './orchestration.types';

export interface ProfilePromptOptions {
  includeImpressionCore: boolean;
  includeImpressionDetail: boolean;
}

/**
 * 回复组织层共享入参。
 * 表达层只消费上下文、人格与表达控制配置，不承担决策职责。
 */
export interface ExpressionBaseParams {
  context: TurnContext;
  personaDto: PersonaDto;
  profilePrompt: ProfilePromptOptions;
}

export interface ChatExpressionParams extends ExpressionBaseParams {
  recentMessages: Array<{ role: string; content: string }>;
  intentState?: DialogueIntentState | null;
  maxContextTokens: number;
}

export interface ToolExpressionParams extends ExpressionBaseParams {
  userInput: string;
  recentMessages?: Array<{ role: string; content: string }>;
  intentState?: DialogueIntentState | null;
  toolResult: string | null;
  toolError: string | null;
  toolKind: ToolKind;
  toolWasActuallyUsed: boolean;
}

export interface MissingParamsExpressionParams extends ExpressionBaseParams {
  userInput: string;
  missingParams: string[];
  intentState?: DialogueIntentState | null;
}

export type ExpressionParams =
  | ChatExpressionParams
  | ToolExpressionParams
  | MissingParamsExpressionParams;
