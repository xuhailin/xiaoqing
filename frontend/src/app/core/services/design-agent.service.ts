import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type DesignPageType = 'chat' | 'workbench' | 'memory';
export type DesignPreset = 'warm-tech' | 'serious-workbench' | 'quiet-personal';
export type DesignAuditMode = 'code' | 'visual' | 'full';

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
}

export interface RunDesignAuditResultDto {
  success: boolean;
  auditResult: DesignAuditResultDto | null;
  error: string | null;
  actualMode: DesignAuditMode;
  durationMs: number;
  costUsd: number;
}

@Injectable({ providedIn: 'root' })
export class DesignAgentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/design-agent`;

  runAudit(body: DesignAuditRequest): Observable<RunDesignAuditResultDto> {
    return this.http.post<RunDesignAuditResultDto>(`${this.base}/audits`, body);
  }
}
