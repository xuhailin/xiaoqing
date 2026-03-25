import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type RegressionReportMode = 'gate' | 'gate-agents' | 'replay';
export type RegressionScenarioStatus = 'passed' | 'failed' | 'error';
export type RegressionRunStatus = 'idle' | 'starting' | 'running' | 'succeeded' | 'failed';

export interface RegressionSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  hardFailed: number;
  softFailed: number;
}

export interface RegressionRuleResult {
  bucket: 'mustHappen' | 'mustNotHappen';
  ruleType: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface RegressionSoftScore {
  dimension: string;
  score: number;
  minScore: number;
  weight: number;
  passed: boolean;
  rationale: string;
  source: 'llm' | 'heuristic' | 'skipped';
}

export interface RegressionScenarioInfo {
  id: string;
  name: string;
  sourceType: 'curated' | 'replay' | 'promoted';
  category?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
}

export interface RegressionTurnEvidence {
  index: number;
  userInput: string;
  route: 'chat' | 'dev';
  finalReply: string;
  capabilityUsed: string | null;
  openclawUsed: boolean;
}

export interface RegressionScenarioEvidence {
  conversationId: string;
  sourcePath: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  finalReply: string;
  finalRoute: 'chat' | 'dev' | null;
  usedCapabilities: string[];
  createdChatReminders: Array<{
    id: string;
    title: string | null;
    message: string;
    nextRunAt: string | null;
    createdAt: string;
  }>;
  turns: RegressionTurnEvidence[];
  cleanup: {
    deletedConversation: boolean;
    deletedReminderIds: string[];
    deletedDevSessions: number;
    removedWorkspaceRoot: string | null;
  };
}

export interface RegressionScenarioResult {
  scenario: RegressionScenarioInfo;
  status: RegressionScenarioStatus;
  evidence: RegressionScenarioEvidence | null;
  hardChecks: RegressionRuleResult[];
  softScores: RegressionSoftScore[];
  errorMessage: string | null;
}

export interface RegressionReport {
  runId: string;
  mode: 'gate' | 'gate-agents' | 'replay' | 'all';
  generatedAt: string;
  summary: RegressionSummary;
  results: RegressionScenarioResult[];
}

export interface RegressionReportEnvelope {
  mode: RegressionReportMode;
  filePath: string;
  updatedAt: string | null;
  report: RegressionReport | null;
}

export interface RegressionLatestReportsResponse {
  gate: RegressionReportEnvelope;
  gateAgents: RegressionReportEnvelope;
  replay: RegressionReportEnvelope;
}

export interface RegressionRunState {
  mode: RegressionReportMode;
  status: RegressionRunStatus;
  command: string[];
  pid: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  logs: string[];
  error: string | null;
  runReportGeneratedAt: string | null;
  latestReportUpdatedAt: string | null;
  latestReportGeneratedAt: string | null;
  latestReportSummary: Record<string, unknown> | null;
}

export interface RegressionRunStatesResponse {
  gate: RegressionRunState;
  gateAgents: RegressionRunState;
  replay: RegressionRunState;
}

@Injectable({ providedIn: 'root' })
export class RegressionReportService {
  private base = `${environment.apiUrl}/qa/reports`;

  constructor(private http: HttpClient) {}

  getLatestReports() {
    return this.http.get<RegressionLatestReportsResponse>(`${this.base}/latest`);
  }

  getRunStates() {
    return this.http.get<RegressionRunStatesResponse>(`${environment.apiUrl}/qa/runs`);
  }

  startRun(mode: RegressionReportMode) {
    return this.http.post<RegressionRunState>(`${environment.apiUrl}/qa/runs/${mode}`, {});
  }
}
