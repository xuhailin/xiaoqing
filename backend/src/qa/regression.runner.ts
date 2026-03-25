import { cp, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, relative, resolve } from 'path';
import { ReminderScope } from '@prisma/client';
import type { AgentResult } from '../orchestrator/agent.interface';
import { DispatcherService } from '../orchestrator/dispatcher.service';
import { ConversationService } from '../assistant/conversation/conversation.service';
import type { SendMessageResult } from '../assistant/conversation/orchestration.types';
import { DevAgentService } from '../dev-agent/dev-agent.service';
import type { DevTaskResult } from '../dev-agent/dev-agent.types';
import { PrismaService } from '../infra/prisma.service';
import type {
  CanonicalCapability,
  RegressionScenario,
  ReminderSideEffect,
  ScenarioCleanupEvidence,
  ScenarioEvidence,
  TurnEvidence,
} from './regression.types';

const TERMINAL_DEV_RUN_STATUSES = new Set(['success', 'failed', 'cancelled']);
const SNAPSHOT_EXCLUDED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
]);

export class RegressionScenarioExecutionError extends Error {
  constructor(
    message: string,
    public readonly evidence: ScenarioEvidence | null,
  ) {
    super(message);
    this.name = 'RegressionScenarioExecutionError';
  }
}

export interface RegressionRunnerOptions {
  cleanup: boolean;
  devWorkspaceMode: 'snapshot' | 'current';
  maxDevWaitMs: number;
  devPollIntervalMs: number;
}

export class RegressionRunner {
  constructor(
    private readonly deps: {
      dispatcher: DispatcherService;
      conversation: ConversationService;
      devAgent: DevAgentService;
      prisma: PrismaService;
      projectRoot: string;
    },
    private readonly options: RegressionRunnerOptions,
  ) {}

  async runScenario(scenario: RegressionScenario): Promise<ScenarioEvidence> {
    const startedAt = new Date();
    const reminderIdsBefore = this.needsReminderTracking(scenario)
      ? await this.listChatReminderIds()
      : null;
    const { id: conversationId } = await this.deps.conversation.create();
    let workspaceRoot: string | null = null;
    let removedWorkspaceRoot: string | null = null;
    const turns: TurnEvidence[] = [];
    const activeDevRunIds = new Set<string>();
    let createdChatReminders: ReminderSideEffect[] = [];
    let cleanup: ScenarioCleanupEvidence = {
      deletedConversation: false,
      deletedReminderIds: [],
      deletedDevSessions: 0,
      removedWorkspaceRoot: null,
    };

    try {
      workspaceRoot = await this.prepareWorkspaceIfNeeded(scenario);
      for (let index = 0; index < scenario.transcript.length; index += 1) {
        const turn = scenario.transcript[index];
        const metadata = workspaceRoot
          ? {
              workspaceRoot,
              projectScope: `qa-${sanitizeFileName(scenario.id)}`,
            }
          : undefined;
        const agentResult = await this.deps.dispatcher.dispatch(
          conversationId,
          turn.content,
          undefined,
          metadata,
        );
        const evidence = await this.buildTurnEvidence(
          index,
          turn.content,
          agentResult,
          metadata,
          activeDevRunIds,
        );
        turns.push(evidence);
      }
    } catch (err) {
      const finishedAt = new Date();
      createdChatReminders = await this.detectCreatedChatReminders(
        reminderIdsBefore,
        startedAt,
      );
      cleanup = await this.cleanupScenarioArtifacts({
        conversationId,
        workspaceRoot,
        activeDevRunIds: [...activeDevRunIds],
        createdReminderIds: createdChatReminders.map((reminder) => reminder.id),
      });
      removedWorkspaceRoot = cleanup.removedWorkspaceRoot;
      const evidence = this.buildScenarioEvidence({
        scenario,
        conversationId,
        workspaceRoot: removedWorkspaceRoot ?? workspaceRoot,
        startedAt,
        finishedAt,
        turns,
        createdChatReminders,
        cleanup,
      });
      const message = err instanceof Error ? err.message : String(err);
      throw new RegressionScenarioExecutionError(message, evidence);
    }

    const finishedAt = new Date();
    createdChatReminders = await this.detectCreatedChatReminders(
      reminderIdsBefore,
      startedAt,
    );
    cleanup = await this.cleanupScenarioArtifacts({
      conversationId,
      workspaceRoot,
      activeDevRunIds: [...activeDevRunIds],
      createdReminderIds: createdChatReminders.map((reminder) => reminder.id),
    });
    removedWorkspaceRoot = cleanup.removedWorkspaceRoot;

    return this.buildScenarioEvidence({
      scenario,
      conversationId,
      workspaceRoot: removedWorkspaceRoot ?? workspaceRoot,
      startedAt,
      finishedAt,
      turns,
      createdChatReminders,
      cleanup,
    });
  }

  private buildScenarioEvidence(input: {
    scenario: RegressionScenario;
    conversationId: string;
    workspaceRoot: string | null;
    startedAt: Date;
    finishedAt: Date;
    turns: TurnEvidence[];
    createdChatReminders: ReminderSideEffect[];
    cleanup: ScenarioCleanupEvidence;
  }): ScenarioEvidence {
    const finalTurn = input.turns[input.turns.length - 1] ?? null;
    const usedCapabilities = [...new Set(
      input.turns
        .map((turn) => turn.capabilityUsed)
        .filter((capability): capability is CanonicalCapability => capability !== null),
    )];

    return {
      conversationId: input.conversationId,
      sourcePath: input.scenario.filePath,
      workspaceRoot: input.workspaceRoot,
      startedAt: input.startedAt.toISOString(),
      finishedAt: input.finishedAt.toISOString(),
      durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
      turns: input.turns,
      finalReply: finalTurn?.finalReply ?? '',
      finalRoute: finalTurn?.route ?? null,
      usedCapabilities,
      createdChatReminders: input.createdChatReminders,
      cleanup: input.cleanup,
    };
  }

  private async buildTurnEvidence(
    index: number,
    userInput: string,
    agentResult: AgentResult,
    metadata: { workspaceRoot: string; projectScope: string } | undefined,
    activeDevRunIds: Set<string>,
  ): Promise<TurnEvidence> {
    if (agentResult.channel === 'chat') {
      const payload = agentResult.payload as SendMessageResult;
      const capabilityUsed = this.extractChatCapability(payload);
      return {
        index,
        userInput,
        route: 'chat',
        immediateReply: agentResult.reply,
        finalReply: payload.assistantMessage.content,
        capabilityUsed,
        openclawUsed: capabilityUsed === 'openclaw',
        metadata,
      };
    }

    const payload = agentResult.payload as DevTaskResult;
    const runId = payload.run.id;
    activeDevRunIds.add(runId);
    try {
      const run = await this.waitForDevRun(runId);
      const finalReply = this.extractDevFinalReply(run) ?? agentResult.reply;
      return {
        index,
        userInput,
        route: 'dev',
        immediateReply: agentResult.reply,
        finalReply,
        capabilityUsed: null,
        openclawUsed: false,
        metadata,
        devRun: {
          runId,
          status: String(run.status ?? payload.run.status),
          finalReply,
          plan: run.plan ?? payload.run.plan,
          result: run.result ?? payload.run.result,
          error: typeof run.error === 'string' ? run.error : payload.run.error,
        },
      };
    } finally {
      activeDevRunIds.delete(runId);
    }
  }

  private extractChatCapability(payload: SendMessageResult): CanonicalCapability | null {
    if (payload.openclawUsed) {
      return 'openclaw';
    }

    switch (payload.localSkillUsed) {
      case 'weather':
        return 'weather';
      case 'book_download':
        return 'book-download';
      case 'general_action':
        return 'general-action';
      case 'timesheet':
        return 'timesheet';
      case 'reminder':
        return 'reminder';
      case 'page_screenshot':
        return 'page-screenshot';
      default:
        break;
    }

    if (payload.meta?.localSkillRun) {
      return 'local-skill';
    }

    return null;
  }

  private async waitForDevRun(runId: string): Promise<any> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= this.options.maxDevWaitMs) {
      const run = await this.deps.devAgent.getRun(runId);
      if (!run) {
        throw new Error(`Dev run not found: ${runId}`);
      }
      if (TERMINAL_DEV_RUN_STATUSES.has(String(run.status))) {
        return run;
      }
      await sleep(this.options.devPollIntervalMs);
    }

    await this.deps.devAgent.cancelRun(runId, 'QA runner timeout');
    throw new Error(`Dev run timed out after ${this.options.maxDevWaitMs}ms: ${runId}`);
  }

  private extractDevFinalReply(run: any): string | null {
    const result = asRecord(run?.result);
    const finalReply = result && typeof result.finalReply === 'string'
      ? result.finalReply
      : null;
    if (finalReply) {
      return finalReply;
    }
    return typeof run?.reply === 'string' ? run.reply : null;
  }

  private needsReminderTracking(scenario: RegressionScenario): boolean {
    const allRules = [
      ...scenario.expectations.mustHappen,
      ...scenario.expectations.mustNotHappen,
    ];
    return allRules.some((rule) =>
      rule.type === 'side_effect_happened'
      && String(rule.params?.type ?? '') === 'reminder_created',
    );
  }

  private async detectCreatedChatReminders(
    beforeIds: Set<string> | null,
    startedAt: Date,
  ): Promise<ReminderSideEffect[]> {
    if (!beforeIds) {
      return [];
    }

    try {
      const plans = await this.deps.prisma.plan.findMany({
        where: {
          scope: ReminderScope.chat,
          createdAt: { gte: startedAt },
        },
        orderBy: { createdAt: 'asc' },
      });

      return plans
        .filter((plan) => !beforeIds.has(plan.id))
        .map((plan) => ({
          id: plan.id,
          title: plan.title,
          message: plan.description ?? '',
          nextRunAt: plan.nextRunAt ? plan.nextRunAt.toISOString() : null,
          createdAt: plan.createdAt.toISOString(),
        }));
    } catch {
      return [];
    }
  }

  private shouldPrepareWorkspace(scenario: RegressionScenario): boolean {
    return scenario.expectations.expectedExecution?.route === 'dev';
  }

  private async prepareWorkspaceIfNeeded(
    scenario: RegressionScenario,
  ): Promise<string | null> {
    if (!this.shouldPrepareWorkspace(scenario)) {
      return null;
    }

    if (this.options.devWorkspaceMode === 'current') {
      return this.deps.projectRoot;
    }

    const workspaceRoot = resolve(
      tmpdir(),
      'xiaoqing-qa-workspaces',
      `${Date.now()}-${sanitizeFileName(scenario.id)}`,
    );
    await mkdir(workspaceRoot, { recursive: true });
    await cp(this.deps.projectRoot, workspaceRoot, {
      recursive: true,
      filter: (source) => shouldCopyPath(this.deps.projectRoot, source),
    });
    return workspaceRoot;
  }

  private async cleanupScenarioArtifacts(input: {
    conversationId: string;
    workspaceRoot: string | null;
    activeDevRunIds: string[];
    createdReminderIds: string[];
  }): Promise<ScenarioCleanupEvidence> {
    if (!this.options.cleanup) {
      return {
        deletedConversation: false,
        deletedReminderIds: [],
        deletedDevSessions: 0,
        removedWorkspaceRoot: null,
      };
    }

    for (const runId of input.activeDevRunIds) {
      try {
        await this.deps.devAgent.cancelRun(runId, 'QA runner cleanup');
      } catch {
        // ignore cleanup failure
      }
    }

    const deletedReminderIds = [...new Set(input.createdReminderIds)];
    if (deletedReminderIds.length > 0) {
      try {
        await this.deps.prisma.plan.deleteMany({
          where: { id: { in: deletedReminderIds } },
        });
      } catch {
        // ignore cleanup failure
      }
    }

    const deletedDevSessions = await this.deps.prisma.devSession.deleteMany({
      where: { conversationId: input.conversationId },
    });

    let deletedConversation = false;
    try {
      await this.deps.conversation.flushSummarize(input.conversationId).catch(() => ({ flushed: false }));
      await this.deps.conversation.delete(input.conversationId);
      deletedConversation = true;
    } catch {
      deletedConversation = false;
    }

    let removedWorkspaceRoot: string | null = null;
    if (
      input.workspaceRoot
      && input.workspaceRoot !== this.deps.projectRoot
      && this.options.devWorkspaceMode === 'snapshot'
    ) {
      await rm(input.workspaceRoot, { recursive: true, force: true });
      removedWorkspaceRoot = input.workspaceRoot;
    }

    return {
      deletedConversation,
      deletedReminderIds,
      deletedDevSessions: deletedDevSessions.count,
      removedWorkspaceRoot,
    };
  }

  private async listChatReminderIds(): Promise<Set<string> | null> {
    try {
      const plans = await this.deps.prisma.plan.findMany({
        where: { scope: ReminderScope.chat },
        select: { id: true },
      });
      return new Set(plans.map((plan) => plan.id));
    } catch {
      return null;
    }
  }
}

function shouldCopyPath(projectRoot: string, source: string): boolean {
  const rel = relative(projectRoot, source).replaceAll('\\', '/');
  if (!rel || rel === '.') {
    return true;
  }

  const segments = rel.split('/');
  if (segments.some((segment) => SNAPSHOT_EXCLUDED_SEGMENTS.has(segment))) {
    return false;
  }

  if (
    rel === 'qa/reports'
    || rel.startsWith('qa/reports/')
    || rel === 'backend/data/dev-runs'
    || rel.startsWith('backend/data/dev-runs/')
    || rel === 'backend/data/dev-workspaces'
    || rel.startsWith('backend/data/dev-workspaces/')
  ) {
    return false;
  }

  return true;
}

function sanitizeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
