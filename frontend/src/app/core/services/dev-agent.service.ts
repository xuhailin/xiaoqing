import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface DevSession {
  id: string;
  conversationId: string | null;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  runs: DevRun[];
}

export interface DevRun {
  id: string;
  sessionId: string;
  userInput: string;
  plan: DevPlan | null;
  status: string;
  executor: string | null;
  result: unknown;
  error: string | null;
  artifactPath: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface DevRunCancelResult {
  ok: boolean;
  error?: string;
  run?: {
    id: string;
    status: string;
    error: string | null;
    finishedAt: string | null;
  };
}

export interface DevPlan {
  summary: string;
  steps: DevPlanStep[];
}

export interface DevPlanStep {
  index: number;
  description: string;
  executor: 'shell' | 'openclaw';
  command: string;
}

export interface DevTaskResult {
  session: { id: string; status: string };
  run: {
    id: string;
    status: string;
    executor: string | null;
    plan: DevPlan | null;
    result: unknown;
    error: string | null;
    artifactPath: string | null;
  };
  reply: string;
}

@Injectable({ providedIn: 'root' })
export class DevAgentService {
  private base = `${environment.apiUrl}/dev-agent`;
  private msgBase = `${environment.apiUrl}/conversations`;

  constructor(private http: HttpClient) {}

  listSessions() {
    return this.http.get<DevSession[]>(`${this.base}/sessions`);
  }

  getSession(sessionId: string) {
    return this.http.get<DevSession>(`${this.base}/sessions/${sessionId}`);
  }

  getRun(runId: string) {
    return this.http.get<DevRun>(`${this.base}/runs/${runId}`);
  }

  cancelRun(runId: string, reason?: string) {
    return this.http.post<DevRunCancelResult>(`${this.base}/runs/${runId}/cancel`, {
      ...(reason ? { reason } : {}),
    });
  }

  /** 通过 gateway 发送 dev 模式消息 */
  sendDevMessage(conversationId: string, content: string) {
    return this.http.post<DevTaskResult>(
      `${this.msgBase}/${conversationId}/messages`,
      { content, mode: 'dev' },
    );
  }
}
