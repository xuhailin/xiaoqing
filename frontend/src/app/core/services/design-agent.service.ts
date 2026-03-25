import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, interval, of, switchMap, map, startWith, catchError, filter, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DevAgentService, type DevRun } from './dev-agent.service';

export type DesignPageType = 'chat' | 'workbench' | 'memory';
export type DesignPreset = 'warm-tech' | 'serious-workbench' | 'quiet-personal';
export type DesignAuditMode = 'code' | 'visual' | 'full';
export type DesignMessageRole = 'user' | 'assistant' | 'system';

export interface DesignImageInput {
  base64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  annotation?: string;
}

export interface DesignAuditRequest {
  pageName: string;
  pageType: DesignPageType;
  preset?: DesignPreset;
  mode?: DesignAuditMode;
  pageUrl?: string;
  targetFiles?: string[];
  notes?: string;
  workspaceRoot?: string;
}

export interface DesignAuditResultSummary {
  status: string;
  riskLevel: string;
  overallAssessment: string;
}

export interface DesignAuditResultDto {
  summary: DesignAuditResultSummary;
  findings: Array<{
    id: string;
    rule: string;
    severity: string;
    location: string;
    problem: string;
    impact: string;
    source?: string;
  }>;
  minimalFixPlan?: Array<{
    action: string;
    target: string;
    type: string;
    dependsOn?: string[];
  }>;
  noChangeZones?: string[];
  primitiveMapping?: {
    preferredTokens: string[];
    preferredPrimitives: string[];
  };
  nextAction?: {
    recommendedTask: 'refine' | 'none';
    changeBudget: 'minimal' | 'medium';
    handoffPrompt: string;
  };
}

export interface RunDesignAuditResultDto {
  success: boolean;
  auditResult: DesignAuditResultDto | null;
  error: string | null;
  actualMode: DesignAuditMode;
  durationMs: number;
  costUsd: number;
}

// ── 对话相关类型 ────────────────────────────────

export interface DesignConversationMessage {
  id: string;
  conversationId: string;
  role: DesignMessageRole;
  content: string;
  metadata?: {
    images?: DesignImageInput[];
    auditResult?: DesignAuditResultDto;
    proposedChanges?: ProposedChange[];
    executionResult?: {
      success: boolean;
      changedFiles: string[];
      error?: string;
    };
  };
  createdAt: string;
}

export interface ProposedChange {
  filePath: string;
  changeType: 'edit' | 'create' | 'delete';
  description: string;
  diff?: string;
}

export interface DesignConversationDto {
  id: string;
  title?: string;
  status: 'active' | 'completed' | 'archived';
  pageName?: string;
  pageType?: string;
  pageUrl?: string;
  preset?: string;
  createdAt: string;
  updatedAt: string;
  messages: DesignConversationMessage[];
}

export interface CreateConversationRequest {
  title?: string;
  pageName?: string;
  pageType?: DesignPageType;
  pageUrl?: string;
  preset?: DesignPreset;
  workspaceRoot?: string;
  initialMessage?: string;
}

export interface SendMessageRequest {
  content: string;
  images?: DesignImageInput[];
  auditParams?: {
    pageName: string;
    pageType: DesignPageType;
    mode?: DesignAuditMode;
    targetFiles?: string[];
  };
}

@Injectable({ providedIn: 'root' })
export class DesignAgentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/design-agent`;
  private readonly devAgent = inject(DevAgentService);

  // ── 对话 API ────────────────────────────────────

  /** 创建新对话 */
  createConversation(request: CreateConversationRequest): Observable<DesignConversationDto> {
    return this.http.post<DesignConversationDto>(`${this.base}/conversations`, request);
  }

  /** 获取对话列表 */
  listConversations(): Observable<DesignConversationDto[]> {
    return this.http.get<DesignConversationDto[]>(`${this.base}/conversations`);
  }

  /** 获取对话详情 */
  getConversation(id: string): Observable<DesignConversationDto> {
    return this.http.get<DesignConversationDto>(`${this.base}/conversations/${id}`);
  }

  /** 发送消息 */
  sendMessage(conversationId: string, request: SendMessageRequest): Observable<DesignConversationDto> {
    return this.http.post<DesignConversationDto>(
      `${this.base}/conversations/${conversationId}/messages`,
      request,
    );
  }

  /** 应用修改 */
  applyChanges(conversationId: string, changeIds?: string[], notes?: string): Observable<{
    success: boolean;
    changedFiles: string[];
    error?: string;
  }> {
    return this.http.post<{
      success: boolean;
      changedFiles: string[];
      error?: string;
    }>(`${this.base}/conversations/${conversationId}/apply`, { changeIds, notes });
  }

  /** 预览修改 */
  previewChanges(conversationId: string, changeIds?: string[]): Observable<{
    diffs: Array<{ filePath: string; diff: string }>;
  }> {
    return this.http.post<{
      diffs: Array<{ filePath: string; diff: string }>;
    }>(`${this.base}/conversations/${conversationId}/preview`, { changeIds });
  }

  /** 删除对话 */
  deleteConversation(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.base}/conversations/${id}`);
  }

  // ── 原有审查 API（向后兼容）────────────────────────

  runAudit(body: DesignAuditRequest): Observable<RunDesignAuditResultDto> {
    return this.http.post<{ sessionId: string; runId: string }>(`${this.base}/audits/run`, body).pipe(
      switchMap(({ runId }) => {
        const actualMode: DesignAuditMode = 'code';
        const terminal = new Set(['success', 'failed', 'cancelled']);
        return interval(1500).pipe(
          startWith(0),
          switchMap(() => this.devAgent.getRun(runId) as Observable<DevRun | null>),
          filter((run): run is DevRun => !!run && terminal.has(run.status)),
          take(1),
          map((run): RunDesignAuditResultDto => {
            const startedAt = run.startedAt ? Date.parse(String(run.startedAt)) : NaN;
            const finishedAt = run.finishedAt ? Date.parse(String(run.finishedAt)) : NaN;
            const durationMs = Number.isFinite(startedAt) && Number.isFinite(finishedAt)
              ? Math.max(0, finishedAt - startedAt)
              : 0;

            const costUsd = typeof run.costUsd === 'number' ? run.costUsd : 0;

            if (run.status !== 'success') {
              return {
                success: false,
                auditResult: null,
                error: run.error || `devAgent run ${run.status}`,
                actualMode,
                durationMs,
                costUsd,
              };
            }

            const resultObj = (run.result && typeof run.result === 'object' && !Array.isArray(run.result))
              ? (run.result as Record<string, unknown>)
              : null;
            const finalReply = typeof resultObj?.['finalReply'] === 'string' ? resultObj['finalReply'] : null;
            if (!finalReply) {
              return {
                success: false,
                auditResult: null,
                error: 'devAgent run success but finalReply missing',
                actualMode,
                durationMs,
                costUsd,
              };
            }

            const json = this.extractFirstJsonObject(finalReply);
            if (!json) {
              return {
                success: false,
                auditResult: null,
                error: 'failed to parse audit_result JSON from finalReply',
                actualMode,
                durationMs,
                costUsd,
              };
            }

            const parsed = json as any;
            const summary = parsed?.summary;
            const findings = parsed?.findings;

            if (!summary || !Array.isArray(findings)) {
              return {
                success: false,
                auditResult: null,
                error: 'audit_result JSON missing summary/findings',
                actualMode,
                durationMs,
                costUsd,
              };
            }

            return {
              success: true,
              auditResult: {
                summary: {
                  status: summary.status,
                  riskLevel: summary.riskLevel,
                  overallAssessment: summary.overallAssessment,
                },
                findings: findings.map((f: any) => ({
                  id: String(f.id ?? ''),
                  rule: String(f.rule ?? ''),
                  severity: String(f.severity ?? ''),
                  location: String(f.location ?? ''),
                  problem: String(f.problem ?? ''),
                  impact: String(f.impact ?? ''),
                  source: f.source ? String(f.source) : undefined,
                })),
                minimalFixPlan: parsed?.minimalFixPlan,
                noChangeZones: parsed?.noChangeZones,
                primitiveMapping: parsed?.primitiveMapping,
                nextAction: parsed?.nextAction,
              },
              error: null,
              actualMode,
              durationMs,
              costUsd,
            };
          }),
          catchError((err) => {
            return of({
              success: false,
              auditResult: null,
              error: err?.message ? String(err.message) : String(err),
              actualMode,
              durationMs: 0,
              costUsd: 0,
            });
          }),
        );
      }),
    );
  }

  private extractFirstJsonObject(text: string): unknown | null {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // fallthrough
      }
    }

    // fallback: try to locate the first {...} block
    const match = trimmed.match(/(\{[\s\S]*\})/);
    if (!match?.[1]) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}
