import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SystemSelfInfo {
  system: {
    name: string;
    version: string;
    environment: string;
  };
  agents: Array<{
    name: string;
    channel: string;
    active: boolean;
  }>;
  capabilities: Array<{
    name: string;
    description?: string;
    taskIntent?: string[];
    surface?: string;
    scope?: string;
    visibility?: string;
  }>;
  features: Record<string, boolean>;
  executors: Array<{
    name: string;
    description?: string;
    surface: 'dev';
  }>;
}

export interface SystemOverview {
  systemSelf: SystemSelfInfo;
  tokenPolicy: {
    maxContextTokens: number;
    maxSystemTokens: number;
    memoryMidK: number;
    memoryCandidatesMaxLong: number;
    memoryCandidatesMaxMid: number;
    memoryContentMaxChars: number;
    autoSummarizeThreshold: number;
  };
  integrations: Array<{
    key: string;
    label: string;
    enabled: boolean;
    summary: string;
    meta?: Record<string, unknown>;
  }>;
}

@Injectable({ providedIn: 'root' })
export class SystemOverviewService {
  private readonly base = `${environment.apiUrl}/system`;

  constructor(private readonly http: HttpClient) {}

  getOverview() {
    return this.http.get<SystemOverview>(`${this.base}/overview`);
  }

  getSystemSelf() {
    return this.http.get<SystemSelfInfo>(`${this.base}/self`);
  }
}
