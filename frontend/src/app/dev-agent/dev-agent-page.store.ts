import { Injectable, computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  DevAgentService,
  DevRun,
  DevSession,
  DevTaskResult,
  DevWorkspaceMeta,
  DevWorkspaceTreeEntry,
} from '../core/services/dev-agent.service';
import {
  ConversationService,
  type ConversationWorkItem,
  type DevRunStream,
} from '../core/services/conversation.service';
import {
  buildChatMessages,
  buildRunState,
  buildWorkspaceOptions,
} from './dev-agent.view-model';

@Injectable()
export class DevAgentPageStore {
  private static readonly TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled', 'waiting_input']);
  private static readonly POLL_INTERVAL_MS = 1500;

  sessions = signal<DevSession[]>([]);
  sending = signal(false);
  lastResult = signal<DevTaskResult | null>(null);
  selectedSessionId = signal<string | null>(null);
  selectedRunId = signal<string | null>(null);
  draftSessionActive = signal(false);
  cancellingRunId = signal<string | null>(null);
  workspaceRootInput = signal('');
  actionNotice = signal<string | null>(null);
  workspaceTreeError = signal<string | null>(null);
  workspaceTree = signal<Record<string, DevWorkspaceTreeEntry[]>>({});
  expandedTreePaths = signal<string[]>(['']);
  loadingTreePaths = signal<string[]>([]);

  readonly selectedSession = computed(
    () => this.sessions().find((session) => session.id === this.selectedSessionId()) ?? null,
  );

  readonly currentRun = computed(() => {
    const session = this.selectedSession();
    if (!session?.runs?.length) {
      return null;
    }
    const preferredRunId = this.selectedRunId();
    if (preferredRunId) {
      const matched = session.runs.find((run) => run.id === preferredRunId);
      if (matched) {
        return matched;
      }
    }
    return [...session.runs]
      .sort((left, right) => this.toTimestamp(right.createdAt) - this.toTimestamp(left.createdAt))[0] ?? null;
  });

  readonly currentResult = computed(() => {
    const currentRun = this.currentRun();
    if (!currentRun) {
      return this.lastResult();
    }
    const previous = this.lastResult();
    return previous?.run.id === currentRun.id
      ? previous
      : this.mapRunToTaskResult(currentRun);
  });

  readonly chatMessages = computed(() =>
    buildChatMessages(this.selectedSession(), this.currentResult()),
  );

  readonly runState = computed(() => buildRunState(this.currentResult()));
  readonly workspaceOptions = computed(() => buildWorkspaceOptions(this.sessions()));

  /** 默认使用固定 conversationId 走 dev 通道 */
  private devConversationId = '';
  private devWorkItemStreamSub: Subscription | null = null;
  private devWorkItemStreamConversationId: string | null = null;
  private finalReplyOverride: { runId: string; text: string; done: boolean } | null = null;
  private progressOverride: { runId: string; lastEvent?: string; currentStepId?: string | null } | null = null;
  private runPollTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSessionsSeq = 0;

  constructor(
    private readonly devAgent: DevAgentService,
    private readonly conversation: ConversationService,
  ) {}

  init(options?: {
    preferredSessionId?: string | null;
    preferredRunId?: string | null;
    workspaceRoot?: string | null;
    notice?: string | null;
  }) {
    const workspaceRoot = options?.workspaceRoot?.trim();
    if (workspaceRoot) {
      this.setWorkspaceRootInput(workspaceRoot);
    }
    if (options?.notice?.trim()) {
      this.notify(options.notice.trim());
    }
    this.loadSessions(options?.preferredSessionId ?? undefined, options?.preferredRunId ?? undefined);
  }

  destroy() {
    this.clearRunPolling();
    this.clearNoticeTimer();
    this.devWorkItemStreamSub?.unsubscribe();
    this.devWorkItemStreamSub = null;
    this.devWorkItemStreamConversationId = null;
    this.finalReplyOverride = null;
    this.progressOverride = null;
  }

  private ensureDevWorkItemStream(conversationId: string) {
    const normalized = conversationId.trim();
    if (!normalized) return;
    if (
      this.devWorkItemStreamSub
      && this.devWorkItemStreamConversationId === normalized
    ) {
      return;
    }

    this.devWorkItemStreamSub?.unsubscribe();
    this.devWorkItemStreamSub = this.conversation
      .streamWorkItems(normalized)
      .subscribe({
        next: (item) => this.handleDevWorkItemStreamItem(item),
        error: () => {
          // 保持轻量：失败则回到轮询；稍后会在下一次 applySelectedSession 时重新订阅
          this.devWorkItemStreamSub = null;
          this.devWorkItemStreamConversationId = null;
        },
      });
    this.devWorkItemStreamConversationId = normalized;
  }

  private handleDevWorkItemStreamItem(item: ConversationWorkItem) {
    const devRunStream = item.devRunStream;
    if (!devRunStream) return;
    if (item.executorType !== 'dev_run') return;

    const runId = item.sourceRefId;
    if (!runId) return;

    const last = this.lastResult();
    if (!last?.run?.id || last.run.id !== runId) return;

    const stream = devRunStream as DevRunStream;
    const nowIso = new Date().toISOString();

    if (stream.kind === 'progress') {
      const patch: Record<string, unknown> = { updatedAt: nowIso };
      const meta = stream.meta ?? {};

      if (stream.phase === 'plan') {
        const round = typeof meta['round'] === 'number' ? (meta['round'] as number) : null;
        patch['lastEvent'] = round != null ? `第 ${round} 轮规划完成` : '规划完成';
        patch['currentStepId'] = null;
      } else if (stream.phase === 'execute') {
        const stepId = typeof meta['stepId'] === 'string' ? (meta['stepId'] as string) : null;
        const success = meta['success'] === true;
        if (stepId) {
          patch['lastEvent'] = success
            ? `步骤 ${stepId} 执行成功`
            : `步骤 ${stepId} 执行失败`;
          patch['currentStepId'] = stepId;
        }
      } else if (stream.phase === 'evaluate') {
        const stepId = typeof meta['stepId'] === 'string' ? (meta['stepId'] as string) : null;
        const reason = typeof meta['reason'] === 'string' ? (meta['reason'] as string) : null;
        if (stepId) patch['currentStepId'] = stepId;
        patch['lastEvent'] = reason ? `评估完成：${reason}` : '评估完成';
      } else if (stream.phase === 'replan') {
        const stepId = typeof meta['stepId'] === 'string' ? (meta['stepId'] as string) : null;
        if (stepId) {
          patch['currentStepId'] = stepId;
          patch['lastEvent'] = `步骤 ${stepId} 触发自动重规划`;
        }
      }

      const shouldOverride = typeof patch['lastEvent'] === 'string'
        || Object.prototype.hasOwnProperty.call(patch, 'currentStepId');
      if (shouldOverride) {
        this.progressOverride = {
          runId,
          ...(typeof patch['lastEvent'] === 'string' ? { lastEvent: patch['lastEvent'] } : {}),
          ...(Object.prototype.hasOwnProperty.call(patch, 'currentStepId')
            ? { currentStepId: patch['currentStepId'] as string | null }
            : {}),
        };
      }

      const prevResult = this.asRecord(last.run.result);
      const nextResult = { ...(prevResult ?? {}), ...patch };
      this.lastResult.set({
        ...last,
        run: {
          ...last.run,
          result: nextResult,
        },
      });
    }

    if (stream.kind === 'final_reply') {
      this.finalReplyOverride = {
        runId,
        text: stream.text,
        done: stream.done,
      };
      const nextResult = {
        ...(this.asRecord(last.run.result) ?? {}),
        finalReply: stream.text,
        updatedAt: nowIso,
      };

      this.lastResult.set({
        ...last,
        run: {
          ...last.run,
          result: nextResult,
        },
      });
    }
  }

  setWorkspaceRootInput(value: string) {
    const nextRoot = value.trim();
    const previousRoot = this.workspaceRootInput();
    this.workspaceRootInput.set(nextRoot);
    if (nextRoot !== previousRoot) {
      this.resetWorkspaceTree();
      if (nextRoot) {
        this.ensureWorkspaceTreeLoaded('');
      }
    }
  }

  selectWorkspaceRoot(root: string): string | null {
    const normalizedRoot = root.trim();
    this.setWorkspaceRootInput(normalizedRoot);
    const matched = this.sessions().find((session) => session.workspaceRoot === normalizedRoot);
    if (matched) {
      this.selectSession(matched.id);
      return matched.id;
    }
    return null;
  }

  selectSession(sessionId: string) {
    const session = this.sessions().find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    this.applySelectedSession(session);
  }

  startDraftSession() {
    this.draftSessionActive.set(true);
    this.selectedSessionId.set(null);
    this.selectedRunId.set(null);
    this.lastResult.set(null);
    this.finalReplyOverride = null;
    this.progressOverride = null;
    this.clearRunPolling();
  }

  send(
    content: string,
    options?: {
      forceNewSession?: boolean;
      onSuccess?: (result: DevTaskResult) => void;
    },
  ) {
    const trimmed = content.trim();
    if (!trimmed || this.sending()) return;

    this.sending.set(true);
    const convId = this.devConversationId || 'dev-default';
    const workspaceRoot = this.resolveWorkspaceRootForSend();

    this.devAgent.sendDevMessage(convId, trimmed, {
      workspaceRoot,
      forceNewSession: options?.forceNewSession === true,
    }).subscribe({
      next: (result) => {
        this.draftSessionActive.set(false);
        this.lastResult.set({
          ...result,
          run: {
            ...result.run,
            userInput: result.run.userInput ?? trimmed,
            rerunFromRunId: result.run.rerunFromRunId ?? null,
            startedAt: result.run.startedAt ?? null,
            finishedAt: result.run.finishedAt ?? null,
            createdAt: result.run.createdAt ?? null,
          },
        });
        this.selectedSessionId.set(result.session.id);
        this.selectedRunId.set(result.run.id);
        this.setWorkspaceRootInput(result.run.workspace?.workspaceRoot ?? workspaceRoot ?? '');
        if (result.run.id) {
          this.pollRun(result.run.id, result.session.id);
        } else {
          this.clearRunPolling();
        }
        this.sending.set(false);
        this.loadSessions(result.session.id);
        options?.onSuccess?.(result);
      },
      error: (err) => {
        this.lastResult.set({
          session: { id: '', status: 'failed', workspace: null },
          run: {
            id: '',
            userInput: trimmed,
            status: 'failed',
            executor: null,
            plan: null,
            result: null,
            error: err.message || '请求失败',
            artifactPath: null,
            workspace: null,
          },
          reply: '请求失败：' + (err.error?.message || err.message || '未知错误'),
        });
        this.sending.set(false);
      },
    });
  }

  rerunCurrentRun() {
    if (this.sending()) {
      this.notify('当前已有任务发送中，请稍后重试。');
      return;
    }
    const sourceRunId = this.currentRun()?.id ?? this.lastResult()?.run.id;
    if (!sourceRunId) {
      this.notify('当前没有可重跑的 run。');
      return;
    }

    this.sending.set(true);
    this.devAgent.rerunRun(sourceRunId).subscribe({
      next: (result) => {
        this.lastResult.set({
          ...result,
          run: {
            ...result.run,
            userInput: result.run.userInput ?? this.currentRun()?.userInput ?? '',
            rerunFromRunId: result.run.rerunFromRunId ?? sourceRunId,
            startedAt: result.run.startedAt ?? null,
            finishedAt: result.run.finishedAt ?? null,
            createdAt: result.run.createdAt ?? null,
          },
        });
        this.selectedSessionId.set(result.session.id);
        this.selectedRunId.set(result.run.id);
        this.setWorkspaceRootInput(
          result.run.workspace?.workspaceRoot ?? this.workspaceRootInput(),
        );
        this.pollRun(result.run.id, result.session.id);
        this.sending.set(false);
        this.loadSessions(result.session.id);
        this.notify('已创建新 run 重跑任务。');
      },
      error: (err) => {
        this.sending.set(false);
        const msg = err?.error?.message || err?.message || '未知错误';
        this.notify(`重跑失败：${msg}`);
      },
    });
  }

  resumeCurrentRun() {
    if (this.sending()) {
      this.notify('当前已有任务发送中，请稍后重试。');
      return;
    }
    const currentRun = this.currentRun();
    const sourceRunId = currentRun?.id ?? this.lastResult()?.run.id;
    if (!sourceRunId) {
      this.notify('当前没有可恢复的 run。');
      return;
    }
    if (!this.isRunResumable(currentRun)) {
      this.notify('当前 run 没有可恢复的 agent session。');
      return;
    }

    this.sending.set(true);
    this.devAgent.resumeRun(sourceRunId).subscribe({
      next: (result) => {
        this.lastResult.set({
          ...result,
          run: {
            ...result.run,
            userInput: result.run.userInput ?? '继续上次未完成的任务',
            rerunFromRunId: result.run.rerunFromRunId ?? null,
            startedAt: result.run.startedAt ?? null,
            finishedAt: result.run.finishedAt ?? null,
            createdAt: result.run.createdAt ?? null,
          },
        });
        this.selectedSessionId.set(result.session.id);
        this.selectedRunId.set(result.run.id);
        this.setWorkspaceRootInput(
          result.run.workspace?.workspaceRoot ?? this.workspaceRootInput(),
        );
        this.pollRun(result.run.id, result.session.id);
        this.sending.set(false);
        this.loadSessions(result.session.id);
        this.notify('已创建恢复任务，将继续 agent 会话。');
      },
      error: (err) => {
        this.sending.set(false);
        const msg = err?.error?.message || err?.message || '未知错误';
        this.notify(`恢复失败：${msg}`);
      },
    });
  }

  cancelCurrentRun() {
    const current = this.currentResult();
    if (!current) return;

    const runId = current.run.id;
    if (!runId || !this.isRunCancellable(current.run.status)) return;
    if (this.cancellingRunId() === runId) return;

    this.cancellingRunId.set(runId);

    this.devAgent.cancelRun(runId, '用户主动取消任务').subscribe({
      next: (result) => {
        if (!result.ok) {
          this.cancellingRunId.set(null);
          return;
        }
        this.devAgent.getRun(runId).subscribe({
          next: (run) => {
            if (run) {
              this.lastResult.set(this.mapRunToTaskResult(run));
              this.selectedRunId.set(run.id);
              this.updateSessionRun(run);
            }
            this.clearRunPolling();
            this.cancellingRunId.set(null);
          },
          error: () => {
            this.clearRunPolling();
            this.loadSessions(current.session.id || undefined);
            this.cancellingRunId.set(null);
          },
        });
      },
      error: () => {
        this.cancellingRunId.set(null);
      },
    });
  }

  toggleWorkspaceNode(path: string) {
    const expanded = this.expandedTreePaths();
    if (expanded.includes(path)) {
      this.expandedTreePaths.set(expanded.filter((item) => item !== path));
      return;
    }
    this.expandedTreePaths.set([...expanded, path]);
    this.ensureWorkspaceTreeLoaded(path);
  }

  treeChildren(path = ''): DevWorkspaceTreeEntry[] {
    return this.workspaceTree()[path] ?? [];
  }

  isTreeExpanded(path: string): boolean {
    return this.expandedTreePaths().includes(path);
  }

  isTreeLoading(path: string): boolean {
    return this.loadingTreePaths().includes(path);
  }

  isRunCancellable(status: string): boolean {
    return status === 'queued' || status === 'pending' || status === 'running';
  }

  isRunResumable(run: DevRun | null | undefined): boolean {
    if (!run) return false;
    if (this.isRunCancellable(run.status)) return false;
    const agentSessionId = run.agentSessionId
      ?? (this.asRecord(run.result)?.['agentSessionId'] as string | undefined);
    return !!agentSessionId;
  }

  /** 从 run.result 中提取执行模式 */
  getRunMode(run: DevRun | null | undefined): 'agent' | 'orchestrated' | null {
    if (!run) return null;
    const resultObj = this.asRecord(run.result);
    const mode = resultObj?.['mode'];
    if (mode === 'agent') return 'agent';
    if (mode === 'orchestrated') return 'orchestrated';
    return null;
  }

  /** 从 run 中提取成本 */
  getRunCostUsd(run: DevRun | null | undefined): number | null {
    if (!run) return null;
    if (typeof run.costUsd === 'number') return run.costUsd;
    const resultObj = this.asRecord(run.result);
    const summaryObj = this.asRecord(resultObj?.['summary']);
    const costFromSummary = summaryObj?.['costUsd'];
    if (typeof costFromSummary === 'number') return costFromSummary;
    const costFromResult = resultObj?.['costUsd'];
    if (typeof costFromResult === 'number') return costFromResult;
    return null;
  }

  private loadSessions(preferredSessionId?: string, preferredRunId?: string) {
    const seq = ++this.loadSessionsSeq;
    this.devAgent.listSessions().subscribe({
      next: (sessions) => {
        if (seq !== this.loadSessionsSeq) {
          return;
        }
        this.sessions.set(sessions);

        if (this.draftSessionActive() && !preferredSessionId && !preferredRunId) {
          this.selectedSessionId.set(null);
          this.selectedRunId.set(null);
          return;
        }

        const activeSession = this.pickActiveSession(sessions, preferredSessionId, preferredRunId);
        if (!activeSession) {
          this.selectedSessionId.set(null);
          this.selectedRunId.set(null);
          if (!this.devConversationId) {
            this.devConversationId = 'dev-default';
          }
          return;
        }

        this.applySelectedSession(activeSession, preferredRunId);
      },
    });
  }

  private applySelectedSession(session: DevSession, preferredRunId?: string) {
    this.draftSessionActive.set(false);
    const currentRun = this.pickLatestRun(session, preferredRunId);
    this.selectedSessionId.set(session.id);
    this.selectedRunId.set(currentRun?.id ?? null);
    if (session.conversationId) {
      this.devConversationId = session.conversationId;
    } else if (!this.devConversationId) {
      this.devConversationId = 'dev-default';
    }

    if (this.devConversationId) {
      this.ensureDevWorkItemStream(this.devConversationId);
    }
    const nextRoot = session.workspaceRoot ?? this.workspaceRootInput();
    if (nextRoot !== this.workspaceRootInput()) {
      this.setWorkspaceRootInput(nextRoot);
    } else if (nextRoot && !this.workspaceTree()['']) {
      this.ensureWorkspaceTreeLoaded('');
    }

    if (!currentRun) {
      return;
    }
    if (this.lastResult()?.run.id !== currentRun.id) {
      this.lastResult.set(this.mapRunToTaskResult(currentRun));
    }
    if (!this.isTerminalStatus(currentRun.status)) {
      this.pollRun(currentRun.id, session.id);
    } else {
      this.clearRunPolling();
    }
  }

  private ensureWorkspaceTreeLoaded(path = '') {
    const workspaceRoot = this.workspaceRootInput().trim();
    if (!workspaceRoot) {
      return;
    }
    if (this.workspaceTree()[path] || this.loadingTreePaths().includes(path)) {
      return;
    }

    this.workspaceTreeError.set(null);
    this.loadingTreePaths.update((paths) => [...paths, path]);
    this.devAgent.listWorkspaceTree(workspaceRoot, path).subscribe({
      next: (response) => {
        this.workspaceTree.update((current) => ({
          ...current,
          [path]: response.entries,
        }));
        this.loadingTreePaths.update((paths) => paths.filter((item) => item !== path));
      },
      error: (err) => {
        const message = err?.error?.message || err?.message || '目录加载失败';
        this.workspaceTreeError.set(message);
        this.loadingTreePaths.update((paths) => paths.filter((item) => item !== path));
      },
    });
  }

  private resetWorkspaceTree() {
    this.workspaceTree.set({});
    this.expandedTreePaths.set(['']);
    this.loadingTreePaths.set([]);
    this.workspaceTreeError.set(null);
  }

  private updateSessionRun(run: DevRun) {
    this.sessions.update((sessions) =>
      sessions.map((session) => {
        if (session.id !== run.sessionId) {
          return session;
        }
        const runs = session.runs ?? [];
        const nextRuns = runs.some((item) => item.id === run.id)
          ? runs.map((item) => (item.id === run.id ? run : item))
          : [run, ...runs];
        return {
          ...session,
          runs: nextRuns,
          workspace: run.workspace ?? session.workspace,
          workspaceRoot: run.workspaceRoot ?? session.workspaceRoot,
          projectScope: run.projectScope ?? session.projectScope,
          updatedAt: run.finishedAt ?? run.startedAt ?? run.createdAt ?? session.updatedAt,
        };
      }),
    );
  }

  private pollRun(runId: string, sessionId: string) {
    this.clearRunPolling();
    const pollOnce = () => {
      this.devAgent.getRun(runId).subscribe({
        next: (run) => {
          if (!run) {
            this.schedulePoll(pollOnce);
            return;
          }
          const mapped = this.mapRunToTaskResult(run);

          const record = this.asRecord(mapped.run.result) ?? {};
          const finalOverride = this.finalReplyOverride;
          const progressOverride = this.progressOverride;

          const shouldMergeFinal = !!(
            finalOverride && mapped.run.id === finalOverride.runId
          );
          const shouldMergeProgress = !!(
            progressOverride && mapped.run.id === progressOverride.runId
          );

          if (shouldMergeFinal || shouldMergeProgress) {
            const nowIso = new Date().toISOString();
            const patch: Record<string, unknown> = {};
            patch['updatedAt'] = nowIso;
            if (shouldMergeFinal && finalOverride) {
              patch['finalReply'] = finalOverride.text;
            }
            if (shouldMergeProgress && progressOverride) {
              if (typeof progressOverride.lastEvent === 'string') {
                patch['lastEvent'] = progressOverride.lastEvent;
              }
              if (progressOverride.currentStepId !== undefined) {
                patch['currentStepId'] = progressOverride.currentStepId;
              }
            }

            this.lastResult.set({
              ...mapped,
              run: {
                ...mapped.run,
                result: {
                  ...record,
                  ...patch,
                },
              },
            });
          } else {
            this.lastResult.set(mapped);
          }
          this.selectedRunId.set(run.id);
          this.updateSessionRun(run);
          if (this.isTerminalStatus(run.status)) {
            this.clearRunPolling();
            this.loadSessions(sessionId);
            return;
          }
          this.schedulePoll(pollOnce);
        },
        error: () => this.schedulePoll(pollOnce),
      });
    };
    pollOnce();
  }

  private clearRunPolling() {
    if (this.runPollTimer) {
      clearTimeout(this.runPollTimer);
      this.runPollTimer = null;
    }
  }

  private schedulePoll(task: () => void) {
    this.clearRunPolling();
    this.runPollTimer = setTimeout(task, DevAgentPageStore.POLL_INTERVAL_MS);
  }

  private isTerminalStatus(status: string): boolean {
    return DevAgentPageStore.TERMINAL_STATUSES.has(status);
  }

  private pickActiveSession(
    sessions: DevSession[],
    preferredSessionId?: string,
    preferredRunId?: string,
  ): DevSession | null {
    const preferredRoot = this.workspaceRootInput().trim();
    if (preferredSessionId) {
      const matched = sessions.find((session) => session.id === preferredSessionId);
      if (matched) {
        return matched;
      }
    }
    if (preferredRunId) {
      const matchedRun = sessions.find((session) =>
        session.runs.some((run) => run.id === preferredRunId),
      );
      if (matchedRun) {
        return matchedRun;
      }
    }
    if (preferredRoot) {
      const matchedRoot = sessions.find((session) => session.workspaceRoot === preferredRoot);
      if (matchedRoot) {
        return matchedRoot;
      }
    }
    const runningFirst = sessions.find((session) =>
      session.runs.some((run) =>
        run.status === 'queued' || run.status === 'pending' || run.status === 'running',
      ),
    );
    return runningFirst ?? sessions[0] ?? null;
  }

  private pickLatestRun(session: DevSession, preferredRunId?: string): DevRun | null {
    if (preferredRunId) {
      const matched = session.runs.find((run) => run.id === preferredRunId);
      if (matched) {
        return matched;
      }
    }
    return [...(session.runs ?? [])]
      .sort((left, right) => this.toTimestamp(right.createdAt) - this.toTimestamp(left.createdAt))[0] ?? null;
  }

  private resolveWorkspaceRootForSend(): string | undefined {
    const typed = this.workspaceRootInput().trim();
    if (typed) {
      return typed;
    }
    return this.selectedSession()?.workspaceRoot ?? undefined;
  }

  private mapRunToTaskResult(run: DevRun): DevTaskResult {
    const resultObj = this.asRecord(run.result);
    const summaryObj = this.asRecord(resultObj?.['summary']);
    const finalReply = this.readString(resultObj, 'finalReply');
    const lastEvent = this.readString(resultObj, 'lastEvent');
    const stopReason = this.readString(summaryObj, 'stopReason');

    const reply = this.resolveReply(run.status, {
      finalReply,
      lastEvent,
      runError: run.error,
      stopReason,
    });
    const workspace = this.normalizeWorkspace(run.workspace)
      ?? this.parseWorkspaceFromResult(run.result);

    return {
      session: { id: run.sessionId, status: 'active', workspace },
      run: {
        id: run.id,
        userInput: run.userInput,
        rerunFromRunId: run.rerunFromRunId ?? null,
        status: run.status,
        executor: run.executor,
        plan: run.plan,
        result: run.result,
        error: run.error,
        artifactPath: run.artifactPath,
        workspace,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        createdAt: run.createdAt,
      },
      reply,
    };
  }

  private resolveReply(
    status: string,
    options: {
      finalReply: string | null;
      lastEvent: string | null;
      runError: string | null;
      stopReason: string | null;
    },
  ): string {
    if (options.finalReply) {
      return options.finalReply;
    }
    if (status === 'queued' || status === 'pending' || status === 'running') {
      return options.lastEvent ?? '任务执行中...';
    }
    if (status === 'success') {
      return options.stopReason ?? '任务执行完成。';
    }
    if (status === 'cancelled') {
      return options.runError ?? '任务已取消。';
    }
    return options.runError ?? options.stopReason ?? '任务执行失败。';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(
    record: Record<string, unknown> | null,
    key: string,
  ): string | null {
    const value = record?.[key];
    return typeof value === 'string' ? value : null;
  }

  private normalizeWorkspace(value: unknown): DevWorkspaceMeta | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const workspaceRoot = typeof record['workspaceRoot'] === 'string'
      ? record['workspaceRoot'].trim()
      : '';
    if (!workspaceRoot) {
      return null;
    }
    const projectScope = typeof record['projectScope'] === 'string' && record['projectScope'].trim()
      ? record['projectScope'].trim()
      : workspaceRoot;
    return { workspaceRoot, projectScope };
  }

  private parseWorkspaceFromResult(result: unknown): DevWorkspaceMeta | null {
    const record = this.asRecord(result);
    const summary = this.asRecord(record?.['summary']);
    return this.normalizeWorkspace(summary?.['workspace']) ?? this.normalizeWorkspace(record?.['workspace']);
  }

  private notify(message: string) {
    this.actionNotice.set(message);
    this.clearNoticeTimer();
    this.noticeTimer = setTimeout(() => this.actionNotice.set(null), 2600);
  }

  private clearNoticeTimer() {
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
  }

  private toTimestamp(value: string | Date | null | undefined): number {
    if (value instanceof Date) {
      return value.getTime();
    }
    const timestamp = Date.parse(String(value ?? ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
