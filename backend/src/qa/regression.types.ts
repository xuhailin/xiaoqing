import type { MessageChannel, SendMessageMetadata } from '../gateway/message-router.types';

export type RegressionSourceType = 'curated' | 'replay' | 'promoted';
export type RegressionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CanonicalCapability =
  | 'weather'
  | 'book-download'
  | 'general-action'
  | 'timesheet'
  | 'reminder'
  | 'openclaw'
  | 'local-skill'
  | 'page-screenshot';

export interface ScenarioTurn {
  role: 'user';
  content: string;
}

export interface ExpectationRule {
  type: string;
  description?: string;
  params?: Record<string, unknown>;
}

export interface QualityDimension {
  dimension: string;
  minScore?: number;
  weight?: number;
}

export interface SideEffectExpectation {
  type: string;
  target?: string;
  description?: string;
}

export interface ExpectedExecution {
  route?: MessageChannel;
  capability?: string;
  sideEffects?: SideEffectExpectation[];
}

export interface ScenarioExpectations {
  mustHappen: ExpectationRule[];
  mustNotHappen: ExpectationRule[];
  qualityDimensions: QualityDimension[];
  expectedExecution?: ExpectedExecution;
}

export interface ScenarioReferenceConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ScenarioReference {
  sampleAnswer?: string;
  notes?: string;
  referenceConversation?: ScenarioReferenceConversationTurn[];
}

export interface RegressionScenario {
  id: string;
  name: string;
  sourceType: RegressionSourceType;
  category?: string;
  tags?: string[];
  severity: RegressionSeverity;
  releaseGate: boolean;
  /** 显式指定时覆盖按 category 的推断（如 devagent → agents） */
  gateSuite?: 'core' | 'agents';
  transcript: ScenarioTurn[];
  expectations: ScenarioExpectations;
  reference?: ScenarioReference;
  metadata?: Record<string, unknown>;
  filePath: string;
}

export interface RegressionDatasetFilters {
  mode: 'gate' | 'gate-agents' | 'replay' | 'all';
  scenarioIds?: string[];
  sourceTypes?: RegressionSourceType[];
}

export interface DevRunEvidence {
  runId: string;
  status: string;
  finalReply: string | null;
  plan: unknown;
  result: unknown;
  error: string | null;
}

export interface TurnEvidence {
  index: number;
  userInput: string;
  route: MessageChannel;
  immediateReply: string;
  finalReply: string;
  capabilityUsed: CanonicalCapability | null;
  openclawUsed: boolean;
  metadata?: SendMessageMetadata;
  devRun?: DevRunEvidence;
}

export interface ReminderSideEffect {
  id: string;
  title: string | null;
  message: string;
  nextRunAt: string | null;
  createdAt: string;
}

export interface ScenarioCleanupEvidence {
  deletedConversation: boolean;
  deletedReminderIds: string[];
  deletedDevSessions: number;
  removedWorkspaceRoot: string | null;
}

export interface ScenarioEvidence {
  conversationId: string;
  sourcePath: string;
  workspaceRoot: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  turns: TurnEvidence[];
  finalReply: string;
  finalRoute: MessageChannel | null;
  usedCapabilities: CanonicalCapability[];
  createdChatReminders: ReminderSideEffect[];
  cleanup: ScenarioCleanupEvidence;
}

export interface HardCheckResult {
  bucket: 'mustHappen' | 'mustNotHappen';
  ruleType: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface SoftScoreResult {
  dimension: string;
  score: number;
  minScore: number;
  weight: number;
  passed: boolean;
  rationale: string;
  source: 'llm' | 'heuristic' | 'skipped';
}

export interface ScenarioRunResult {
  scenario: RegressionScenario;
  status: 'passed' | 'failed' | 'error';
  evidence: ScenarioEvidence | null;
  hardChecks: HardCheckResult[];
  softScores: SoftScoreResult[];
  errorMessage: string | null;
}

export interface RegressionRunSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  hardFailed: number;
  softFailed: number;
}

export interface RegressionReport {
  runId: string;
  mode: 'gate' | 'gate-agents' | 'replay' | 'all';
  generatedAt: string;
  summary: RegressionRunSummary;
  results: ScenarioRunResult[];
}
