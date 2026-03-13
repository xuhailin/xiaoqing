import type { PersonaDto, ExpressionFields } from '../persona/persona.service';
import type { UserProfileDto } from '../persona/user-profile.service';
import type { AnchorDto } from '../identity-anchor/identity-anchor.service';
import type { TraceStep } from '../../infra/trace/trace.types';
import type {
  BoundaryPromptContext,
  ClaimSignal,
  CognitiveTurnState,
  PersistedGrowthContext,
  SessionStateSignal,
} from '../cognitive-pipeline/cognitive-pipeline.types';
import type { ActionDecision } from '../action-reasoner/action-reasoner.types';
import type { DialogueIntentState } from '../intent/intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';
import type {
  DailyMomentRecord,
  DailyMomentSuggestion,
} from '../daily-moment/daily-moment.types';
import type { LocalSkillRunResult } from '../../action/local-skills/local-skill.types';

export interface MemoryRecallPlan {
  candidatesCount: number;
  selectedCount: number;
  needDetail: boolean;
}

export interface TurnContext {
  request: {
    conversationId: string;
    now: Date;
    userInput: string;
    userMessage: {
      id: string;
      role: 'user';
      content: string;
      createdAt: Date;
    };
  };
  conversation: {
    recentMessages: Array<{ role: string; content: string }>;
  };
  persona: {
    personaDto: PersonaDto;
    expressionFields: ExpressionFields;
    metaFilterPolicy: string | null;
  };
  user: {
    userProfile: UserProfileDto;
    identityAnchors: AnchorDto[];
    anchorText: string | null;
    anchorCity?: string;
  };
  world: {
    storedWorldState: WorldState | null;
    defaultWorldState: WorldState | null;
    fullWorldState: WorldState | null;
  };
  memory: {
    injectedMemories: Array<{ id: string; type: string; content: string }>;
    candidatesCount: number;
    needDetail: boolean;
    memoryBudgetTokens: number;
  };
  growth: {
    growthContext: PersistedGrowthContext;
  };
  claims: {
    claimSignals: ClaimSignal[];
    claimPolicyText: string;
    sessionState: SessionStateSignal | null;
    sessionStateText: string;
    injectedClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }>;
    draftClaimsDebug: Array<{ type: string; key: string; confidence: number; status: string }>;
  };
  runtime: {
    intentState?: DialogueIntentState | null;
    mergedIntentState?: DialogueIntentState | null;
    actionDecision?: ActionDecision;
    memoryRecall?: MemoryRecallPlan;
    cognitiveState?: CognitiveTurnState;
    boundaryPrompt?: BoundaryPromptContext | null;
  };
}

export interface SendMessageResult {
  userMessage: { id: string; role: string; content: string; createdAt: Date };
  assistantMessage: { id: string; role: string; content: string; createdAt: Date };
  injectedMemories: Array<{ id: string; type: string; content: string }>;
  openclawUsed?: boolean;
  localSkillUsed?: 'weather' | 'book_download' | 'general_action' | 'timesheet' | 'reminder';
  dailyMoment?: {
    mode: 'entry' | 'suggestion';
    record?: DailyMomentRecord;
    suggestion?: DailyMomentSuggestion;
  };
  meta?: {
    localSkillRun?: LocalSkillRunResult;
  };
  debugMeta?: Record<string, unknown>;
  trace?: TraceStep[];
}

export type ChatCompletionResult = SendMessageResult;

export type ToolPolicyAction =
  | 'chat'
  | 'ask_missing'
  | 'run_capability'
  | 'run_openclaw';

export interface ToolPolicyDecision {
  action: ToolPolicyAction;
  reason: string;
  capability?: string;
}

export type TurnDecision =
  | {
      kind: 'daily_moment_entry';
      reason: string;
      triggerMode: 'manual' | 'accept_suggestion';
      acceptedSuggestionId?: string;
    }
  | {
      kind: 'chat';
      reason: string;
      intentState?: DialogueIntentState | null;
    }
  | {
      kind: 'ask_missing';
      reason: string;
      intentState: DialogueIntentState;
      missingParams: string[];
    }
  | {
      kind: 'tool';
      reason: string;
      intentState: DialogueIntentState;
      toolRoute: 'local_weather' | 'local_book_download' | 'local_general_action' | 'openclaw';
    };
