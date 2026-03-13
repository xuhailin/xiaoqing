import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface DevWorkspaceMeta {
  workspaceRoot: string;
  projectScope: string;
}

export interface DevSession {
  id: string;
  conversationId: string | null;
  title: string | null;
  status: string;
  workspace: DevWorkspaceMeta | null;
  workspaceRoot: string | null;
  projectScope: string | null;
  createdAt: string;
  updatedAt: string;
  runs: DevRun[];
}

export interface DevRun {
  id: string;
  sessionId: string;
  userInput: string;
  rerunFromRunId?: string | null;
  plan: DevPlan | null;
  status: string;
  executor: string | null;
  result: unknown;
  error: string | null;
  artifactPath: string | null;
  workspace: DevWorkspaceMeta | null;
  workspaceRoot: string | null;
  projectScope: string | null;
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
  strategy?: 'inspect' | 'edit' | 'verify' | 'autonomous_coding' | string;
  executor?: 'shell' | 'openclaw' | 'claude-code' | string;
  command: string;
}

export interface DevTaskResult {
  session: {
    id: string;
    status: string;
    workspace: DevWorkspaceMeta | null;
  };
  run: {
    id: string;
    userInput?: string | null;
    rerunFromRunId?: string | null;
    status: string;
    executor: string | null;
    plan: DevPlan | null;
    result: unknown;
    error: string | null;
    artifactPath: string | null;
    workspace: DevWorkspaceMeta | null;
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

  rerunRun(runId: string) {
    return this.http.post<DevTaskResult>(`${this.base}/runs/${runId}/rerun`, {});
  }

  /** 通过 gateway 发送 dev 模式消息 */
  sendDevMessage(
    conversationId: string,
    content: string,
    options?: {
      workspaceRoot?: string;
      projectScope?: string;
    },
  ) {
    const workspaceRoot = options?.workspaceRoot?.trim();
    const projectScope = options?.projectScope?.trim();

    return this.http.post<DevTaskResult>(
      `${this.msgBase}/${conversationId}/messages`,
      {
        content,
        mode: 'dev',
        ...(workspaceRoot
          ? {
              metadata: {
                workspaceRoot,
                ...(projectScope ? { projectScope } : {}),
              },
            }
          : {}),
      },
    );
  }
}
