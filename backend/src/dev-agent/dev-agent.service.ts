import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, DevSessionStatus } from '@prisma/client';
import { DevRunStatus } from '@prisma/client';
import type { DevRunMode, DevTaskResult } from './dev-agent.types';
import { DevSessionRepository } from './dev-session.repository';
import { DevRunRunnerService } from './dev-runner.service';
import { DevCostService } from './dev-cost.service';
import type { SendMessageMetadata } from '../gateway/message-router.types';
import {
  normalizeWorkspaceInput,
  parseWorkspaceMetaFromRunResult,
  type DevWorkspaceMeta,
  withWorkspaceMeta,
} from './workspace/workspace-meta';
import { WorkspaceManager } from './workspace/workspace-manager.service';
import { ConversationWorkService } from '../conversation-work/conversation-work.service';
import { toConversationMessageDto } from '../assistant/conversation/message.dto';

/** DevAgent 薄入口：委派主流程给 orchestrator。 */
@Injectable()
export class DevAgentService {
  constructor(
    private readonly sessions: DevSessionRepository,
    private readonly runner: DevRunRunnerService,
    private readonly costService: DevCostService,
    private readonly workspaceManager: WorkspaceManager,
    private readonly conversationWork: ConversationWorkService,
  ) {}

  async handleTask(
    conversationId: string,
    userInput: string,
    metadata?: SendMessageMetadata,
    options?: { mode?: DevRunMode },
  ): Promise<DevTaskResult> {
    const normalizedInput = userInput.trim();
    const mode: DevRunMode = options?.mode ?? 'orchestrated';
    const requestedWorkspace = normalizeWorkspaceInput(metadata);
    const session = await this.resolveSession(conversationId, requestedWorkspace, {
      forceNewSession: metadata?.forceNewSession === true,
    });
    const work = await this.conversationWork.createDevWorkItem({
      conversationId,
      userInput: normalizedInput,
    });

    let workspace = await this.resolveSessionWorkspace(session.id);
    if (requestedWorkspace) {
      try {
        workspace = await this.workspaceManager.bindSessionWorkspace(
          session.id,
          requestedWorkspace,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const followup = await this.conversationWork.markWaitingInputById(
          work.workItem.id,
          '我需要一个可访问的项目目录，回复我新的 workspace 路径后我就继续处理。',
          `工作区不可用：${message}`,
        );
        return {
          userMessage: toConversationMessageDto(work.userMessage),
          assistantMessage: toConversationMessageDto(work.receiptMessage),
          extraMessages: followup ? [toConversationMessageDto(followup.followupMessage)] : [],
          workItems: [followup?.workItem ?? work.workItem],
          injectedMemories: [],
          session: {
            id: session.id,
            status: session.status,
            workspace,
          },
          run: {
            id: '',
            userInput: normalizedInput,
            rerunFromRunId: null,
            status: 'waiting_input',
            executor: null,
            plan: null,
            result: null,
            error: null,
            artifactPath: null,
            workspace,
          },
          reply: followup?.followupMessage.content ?? work.receiptMessage.content,
        };
      }
    }

    let run;
    let workItem;
    try {
      run = await this.sessions.createRun(
        session.id,
        normalizedInput,
        this.buildQueuedResult(workspace, { mode }),
      );
      workItem = await this.conversationWork.attachDevRun(work.workItem.id, run.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.conversationWork.markFailedById(work.workItem.id, message);
      throw err;
    }

    this.runner.startRun(run.id, session.id);

    return {
      userMessage: toConversationMessageDto(work.userMessage),
      assistantMessage: toConversationMessageDto(work.receiptMessage),
      workItems: [workItem],
      injectedMemories: [],
      session: {
        id: session.id,
        status: session.status,
        workspace,
      },
      run: {
        id: run.id,
        userInput: run.userInput,
        rerunFromRunId: null,
        status: run.status,
        executor: run.executor ?? null,
        plan: null,
        result: run.result,
        error: null,
        artifactPath: null,
        workspace,
      },
      reply: work.receiptMessage.content,
    };
  }

  async listSessions() {
    const sessions = await this.sessions.listSessions();
    return sessions.map((session) => this.decorateSession(session));
  }

  async getSession(sessionId: string) {
    const session = await this.sessions.getSessionWithRuns(sessionId);
    if (!session) return null;
    return this.decorateSession(session);
  }

  async getRun(runId: string) {
    const run = await this.sessions.getRun(runId);
    if (!run) return null;
    return this.decorateRun(run);
  }

  async cancelRun(runId: string, reason?: string) {
    const normalizedReason = reason?.trim() || '任务已取消';
    const run = await this.sessions.cancelRun(runId, normalizedReason);

    if (!run) {
      return {
        ok: false,
        error: 'run not found',
      };
    }

    const terminalStatuses: string[] = [DevRunStatus.success, DevRunStatus.failed, DevRunStatus.cancelled];
    const alreadyTerminal =
      terminalStatuses.includes(run.status) && run.status !== DevRunStatus.cancelled;

    if (alreadyTerminal) {
      return {
        ok: false,
        error: `run already ${run.status}`,
        run: {
          id: run.id,
          status: run.status,
          error: run.error,
          finishedAt: run.finishedAt,
        },
      };
    }

    await this.conversationWork.markDevRunCancelled(runId, normalizedReason);

    return {
      ok: true,
      run: {
        id: run.id,
        status: run.status,
        error: run.error,
        finishedAt: run.finishedAt,
      },
    };
  }

  /**
   * 恢复执行：基于前次 run 的 agent session 继续执行。
   * 创建一个新的 DevRun，关联到源 run 的 agentSessionId。
   */
  async resumeRun(runId: string, userInput?: string): Promise<DevTaskResult> {
    const sourceRun = await this.sessions.getRunWithSession(runId);
    if (!sourceRun?.session) {
      throw new NotFoundException('run not found');
    }

    const isActive = sourceRun.status === DevRunStatus.queued
      || sourceRun.status === DevRunStatus.pending
      || sourceRun.status === DevRunStatus.running;
    if (isActive) {
      throw new BadRequestException(`run ${runId} is still ${sourceRun.status}, cannot resume`);
    }

    // 需要有 agentSessionId 才能 resume
    const agentSessionId = sourceRun.agentSessionId
      ?? (sourceRun.result as Record<string, unknown> | null)?.agentSessionId as string | undefined;
    if (!agentSessionId) {
      throw new BadRequestException(
        `run ${runId} 没有可恢复的 agent session（agentSessionId 为空）`,
      );
    }

    let workspace = parseWorkspaceMetaFromRunResult(sourceRun.result)
      ?? await this.resolveSessionWorkspace(sourceRun.sessionId);
    if (workspace) {
      try {
        workspace = await this.workspaceManager.bindSessionWorkspace(sourceRun.sessionId, workspace);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(`workspaceRoot 不可用：${message}`);
      }
    }

    const effectiveInput = userInput?.trim() || '继续上次未完成的任务';
    const run = await this.sessions.createRun(
      sourceRun.sessionId,
      effectiveInput,
      this.buildQueuedResult(workspace, {
        mode: 'agent',
        resumeFromRunId: sourceRun.id,
        resumeAgentSessionId: agentSessionId,
      }),
    );

    // 记录 resume 链关系
    await this.sessions.updateRunStatus(run.id, { resumedFromRunId: sourceRun.id });

    this.runner.startRun(run.id, sourceRun.sessionId);

    return {
      session: {
        id: sourceRun.session.id,
        status: sourceRun.session.status,
        workspace,
      },
      run: {
        id: run.id,
        userInput: effectiveInput,
        rerunFromRunId: sourceRun.id,
        status: run.status,
        executor: run.executor ?? null,
        plan: null,
        result: run.result,
        error: null,
        artifactPath: null,
        workspace,
      },
      reply: `已基于 run ${sourceRun.id} 创建恢复任务（run: ${run.id}），将恢复 agent 会话上下文继续执行。`,
    };
  }

  async resumeWorkItem(
    conversationId: string,
    workItemId: string,
    userInput: string,
  ): Promise<DevTaskResult> {
    const waitingWorkItem = await this.conversationWork.findWaitingDevWorkItemForConversation(
      conversationId,
      workItemId,
    );
    if (!waitingWorkItem) {
      throw new BadRequestException('当前没有可恢复的开发任务');
    }

    if (!waitingWorkItem.sourceRefId) {
      const requestedWorkspace = normalizeWorkspaceInput({ workspaceRoot: userInput.trim() });
      if (!requestedWorkspace) {
        throw new BadRequestException('请提供可访问的 workspace 路径');
      }

      const session = await this.resolveSession(conversationId, requestedWorkspace);
      let workspace: DevWorkspaceMeta | null = await this.resolveSessionWorkspace(session.id);
      try {
        workspace = await this.workspaceManager.bindSessionWorkspace(session.id, requestedWorkspace);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const followup = await this.conversationWork.reaskWaitingInputById({
          workItemId: waitingWorkItem.id,
          userInput,
          question: '这个路径我还是访问不到，换一个可访问的项目目录给我，我继续接着处理。',
          blockReason: `工作区不可用：${message}`,
        });
        return {
          userMessage: toConversationMessageDto(followup?.userMessage ?? {
            id: '',
            role: 'user',
            kind: 'user',
            content: userInput.trim(),
            createdAt: new Date(),
          } as any),
          assistantMessage: toConversationMessageDto(followup?.assistantMessage ?? {
            id: '',
            role: 'assistant',
            kind: 'chat',
            content: '这个路径我还是访问不到，换一个可访问的项目目录给我，我继续接着处理。',
            createdAt: new Date(),
          } as any),
          extraMessages: [],
          workItems: [followup?.workItem ?? waitingWorkItem],
          injectedMemories: [],
          session: {
            id: session.id,
            status: session.status,
            workspace,
          },
          run: {
            id: '',
            userInput: waitingWorkItem.userFacingGoal,
            rerunFromRunId: null,
            status: 'waiting_input',
            executor: null,
            plan: null,
            result: null,
            error: null,
            artifactPath: null,
            workspace,
          },
          reply: followup?.assistantMessage.content ?? '这个路径我还是访问不到，换一个可访问的项目目录给我，我继续接着处理。',
        };
      }

      const run = await this.sessions.createRun(
        session.id,
        waitingWorkItem.userFacingGoal,
        this.buildQueuedResult(workspace, { mode: 'orchestrated' }),
      );
      const projection = await this.conversationWork.resumeDevWorkItem({
        conversationId,
        workItemId: waitingWorkItem.id,
        newRunId: run.id,
        userInput,
      });
      this.runner.startRun(run.id, session.id);

      return {
        userMessage: toConversationMessageDto(projection.userMessage),
        assistantMessage: toConversationMessageDto(projection.assistantMessage),
        extraMessages: [],
        workItems: [projection.workItem],
        injectedMemories: [],
        session: {
          id: session.id,
          status: session.status,
          workspace,
        },
        run: {
          id: run.id,
          userInput: waitingWorkItem.userFacingGoal,
          rerunFromRunId: null,
          status: run.status,
          executor: run.executor ?? null,
          plan: null,
          result: run.result,
          error: null,
          artifactPath: null,
          workspace,
        },
        reply: projection.assistantMessage.content,
      };
    }

    const resumed = await this.resumeRun(waitingWorkItem.sourceRefId, userInput);
    const projection = await this.conversationWork.resumeDevWorkItem({
      conversationId,
      workItemId: waitingWorkItem.id,
      newRunId: resumed.run.id,
      userInput,
    });

    return {
      ...resumed,
      userMessage: toConversationMessageDto(projection.userMessage),
      assistantMessage: toConversationMessageDto(projection.assistantMessage),
      workItems: [projection.workItem],
      reply: projection.assistantMessage.content,
    };
  }

  async rerunRun(runId: string): Promise<DevTaskResult> {
    const sourceRun = await this.sessions.getRunWithSession(runId);
    if (!sourceRun?.session) {
      throw new NotFoundException('run not found');
    }

    const isActive = sourceRun.status === DevRunStatus.queued
      || sourceRun.status === DevRunStatus.pending
      || sourceRun.status === DevRunStatus.running;
    if (isActive) {
      throw new BadRequestException(`run ${runId} is still ${sourceRun.status}, cannot rerun`);
    }

    let workspace = parseWorkspaceMetaFromRunResult(sourceRun.result)
      ?? await this.resolveSessionWorkspace(sourceRun.sessionId);
    if (workspace) {
      try {
        workspace = await this.workspaceManager.bindSessionWorkspace(sourceRun.sessionId, workspace);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(`workspaceRoot 不可用：${message}`);
      }
    }

    const run = await this.sessions.createRun(
      sourceRun.sessionId,
      sourceRun.userInput,
      this.buildQueuedResult(workspace, { rerunFromRunId: sourceRun.id }),
    );

    this.runner.startRun(run.id, sourceRun.sessionId);

    return {
      session: {
        id: sourceRun.session.id,
        status: sourceRun.session.status,
        workspace,
      },
      run: {
        id: run.id,
        userInput: run.userInput,
        rerunFromRunId: sourceRun.id,
        status: run.status,
        executor: run.executor ?? null,
        plan: null,
        result: run.result,
        error: null,
        artifactPath: null,
        workspace,
      },
      reply: `已基于 run ${sourceRun.id} 创建重跑任务（run: ${run.id}）。可轮询 /dev-agent/runs/${run.id} 查看进度。`,
    };
  }

  async listWorkspaceTree(workspaceRoot: string, path?: string) {
    const normalizedRoot = workspaceRoot?.trim();
    if (!normalizedRoot) {
      throw new BadRequestException('workspaceRoot is required');
    }
    try {
      return await this.workspaceManager.listWorkspaceEntries(normalizedRoot, path ?? '');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`workspace tree unavailable: ${message}`);
    }
  }

  async getSessionCost(sessionId: string) {
    return this.costService.getSessionCostSummary(sessionId);
  }

  async setSessionBudget(sessionId: string, budgetUsd: number | null) {
    const session = await this.sessions.getSession(sessionId);
    if (!session) throw new NotFoundException('session not found');
    await this.costService.setSessionBudget(sessionId, budgetUsd);
    return this.costService.getSessionCostSummary(sessionId);
  }

  private async resolveSession(
    conversationId: string,
    requestedWorkspace: DevWorkspaceMeta | null,
    options?: { forceNewSession?: boolean },
  ) {
    if (options?.forceNewSession) {
      return this.sessions.createSession(conversationId);
    }

    if (!requestedWorkspace) {
      return this.sessions.getOrCreateSession(conversationId);
    }

    const activeSessions = await this.sessions.listActiveSessionsByConversation(conversationId);
    const matched = activeSessions.find((candidate) => {
      const latestRun = candidate.runs[0];
      const existingWorkspace = parseWorkspaceMetaFromRunResult(latestRun?.result);
      return existingWorkspace?.workspaceRoot === requestedWorkspace.workspaceRoot;
    });
    if (matched) {
      return matched;
    }

    return this.sessions.createSession(conversationId);
  }

  private async resolveSessionWorkspace(sessionId: string): Promise<DevWorkspaceMeta | null> {
    const bound = this.workspaceManager.getSessionWorkspace(sessionId);
    if (bound) {
      return bound;
    }

    const latestRun = await this.sessions.getLatestRun(sessionId);
    const fromLatestRun = parseWorkspaceMetaFromRunResult(latestRun?.result);
    if (!fromLatestRun) {
      return null;
    }

    try {
      return await this.workspaceManager.bindSessionWorkspace(sessionId, fromLatestRun);
    } catch {
      return null;
    }
  }

  private buildQueuedResult(
    workspace: DevWorkspaceMeta | null,
    options?: {
      rerunFromRunId?: string | null;
      mode?: DevRunMode;
      resumeFromRunId?: string | null;
      resumeAgentSessionId?: string | null;
    },
  ): Prisma.InputJsonValue {
    const rerunFromRunId = options?.rerunFromRunId ?? null;
    const resumeFromRunId = options?.resumeFromRunId ?? null;
    const resumeAgentSessionId = options?.resumeAgentSessionId ?? null;
    const mode = options?.mode ?? 'orchestrated';
    const events: Array<Record<string, unknown>> = [
      {
        type: 'queued',
        message: '任务已入队，等待执行',
        at: new Date().toISOString(),
      },
    ];
    if (rerunFromRunId) {
      events.push({
        type: 'rerun',
        message: `基于 run ${rerunFromRunId} 触发重跑`,
        sourceRunId: rerunFromRunId,
        at: new Date().toISOString(),
      });
    }
    if (resumeFromRunId) {
      events.push({
        type: 'resume',
        message: `恢复 run ${resumeFromRunId} 的 agent 会话`,
        sourceRunId: resumeFromRunId,
        agentSessionId: resumeAgentSessionId,
        at: new Date().toISOString(),
      });
    }

    return withWorkspaceMeta({
      phase: 'queued',
      mode,
      rerunFromRunId,
      resumeFromRunId,
      resumeAgentSessionId,
      currentStepId: null,
      planRounds: 0,
      completedSteps: 0,
      totalSteps: 0,
      stepLogs: [],
      events,
    }, workspace) as Prisma.InputJsonValue;
  }

  private decorateSession(session: any) {
    const runs = Array.isArray(session.runs)
      ? session.runs.map((run: any) => this.decorateRun(run))
      : [];
    const sessionWorkspace = this.resolveWorkspaceFromRuns(runs)
      ?? this.workspaceManager.getSessionWorkspace(session.id);
    return {
      ...session,
      status: session.status ?? DevSessionStatus.active,
      runs,
      workspace: sessionWorkspace,
      workspaceRoot: sessionWorkspace?.workspaceRoot ?? null,
      projectScope: sessionWorkspace?.projectScope ?? null,
      budgetUsd: session.budgetUsd ?? null,
      totalCostUsd: session.totalCostUsd ?? 0,
    };
  }

  private decorateRun(run: any) {
    const workspace = parseWorkspaceMetaFromRunResult(run?.result)
      ?? this.workspaceManager.getSessionWorkspace(run?.sessionId ?? '');
    const rerunFromRunId = this.parseRerunFromRunResult(run?.result);
    return {
      ...run,
      workspace,
      rerunFromRunId,
      workspaceRoot: workspace?.workspaceRoot ?? null,
      projectScope: workspace?.projectScope ?? null,
    };
  }

  private resolveWorkspaceFromRuns(
    runs: Array<{ workspace?: DevWorkspaceMeta | null; createdAt?: string | Date }>,
  ): DevWorkspaceMeta | null {
    let latestWorkspace: DevWorkspaceMeta | null = null;
    let latestTs = Number.NEGATIVE_INFINITY;
    for (const run of runs) {
      if (run.workspace) {
        const rawTs = run.createdAt instanceof Date
          ? run.createdAt.getTime()
          : Date.parse(String(run.createdAt ?? ''));
        const ts = Number.isFinite(rawTs) ? rawTs : latestTs + 1;
        if (ts >= latestTs) {
          latestWorkspace = run.workspace;
          latestTs = ts;
        }
      }
    }
    return latestWorkspace;
  }

  private parseRerunFromRunResult(result: unknown): string | null {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return null;
    }
    const raw = (result as Record<string, unknown>)['rerunFromRunId'];
    return typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim()
      : null;
  }
}
