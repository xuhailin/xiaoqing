import {
  DevPlanStep,
  DevRun,
  DevSession,
  DevTaskResult,
  DevWorkspaceMeta,
} from '../core/services/dev-agent.service';

export type DevMessageStatus = 'running' | 'success' | 'failed';

export interface DevChatRunState {
  title: string;
  status: DevMessageStatus;
  statusLabel: string;
  workspaceLabel: string;
  updatedAtLabel: string | null;
}

export interface DevChatMessageBase {
  id: string;
  kind: 'user' | 'assistant' | 'tool-call' | 'tool-result';
  status: DevMessageStatus | null;
  timestamp: string | null;
}

export interface UserMessage extends DevChatMessageBase {
  kind: 'user';
  text: string;
}

export interface AssistantMessage extends DevChatMessageBase {
  kind: 'assistant';
  text: string;
  tone: 'progress' | 'summary';
}

export interface ToolCallMessage extends DevChatMessageBase {
  kind: 'tool-call';
  tool: string;
  command: string;
  summary: string;
}

export interface ToolResultMessage extends DevChatMessageBase {
  kind: 'tool-result';
  tool: string;
  summary: string;
  body: string | null;
  error: string | null;
  meta: string[];
}

export type DevChatMessage =
  | UserMessage
  | AssistantMessage
  | ToolCallMessage
  | ToolResultMessage;

export interface DevSessionBoardSummary {
  total: number;
  running: number;
  failed: number;
  success: number;
}

export interface DevSessionBoardCard {
  id: string;
  title: string;
  status: DevMessageStatus;
  statusLabel: string;
  updatedAt: string | null;
  updatedAtLabel: string | null;
  workspaceLabel: string;
  workspacePath: string | null;
  latestTask: string | null;
  runCount: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
}

export interface DevSessionLane {
  id: DevMessageStatus;
  title: string;
  description: string;
  cards: DevSessionBoardCard[];
}

export interface DevSessionBoardModel {
  summary: DevSessionBoardSummary;
  lanes: DevSessionLane[];
}

interface ParsedRunData {
  lastEvent: string | null;
  finalReply: string | null;
  stopReason: string | null;
  currentStepId: string | null;
  updatedAt: string | null;
  steps: ParsedStepResult[];
  stepLogs: ParsedStepLog[];
  workspace: DevWorkspaceMeta | null;
}

interface ParsedStepResult {
  stepId: string;
  executor: string;
  command: string;
  success: boolean;
  output: string | null;
  error: string | null;
  failureReason: string | null;
  exitCode: number | null;
}

interface ParsedStepLog {
  stepId: string;
  executor: string | null;
  command: string;
  cwd: string | null;
  status: 'success' | 'failed' | null;
  duration: number | null;
  stdoutPreview: string | null;
  stderrPreview: string | null;
  exitCode: number | null;
}

interface StepMessageModel {
  id: string;
  tool: string;
  command: string;
  callStatus: DevMessageStatus;
  resultStatus: DevMessageStatus | null;
  summary: string;
  body: string | null;
  error: string | null;
  meta: string[];
}

export function buildRunState(result: DevTaskResult | null): DevChatRunState | null {
  if (!result) {
    return null;
  }
  const run = taskResultToRun(result);
  const parsed = parseRunData(run);
  return {
    title: normalizedText(run.userInput) ?? '新的开发任务',
    status: normalizeRunStatus(run.status),
    statusLabel: runStatusLabel(run.status),
    workspaceLabel: workspaceLabel(parsed.workspace ?? run.workspace),
    updatedAtLabel: formatDateTime(
      parsed.updatedAt ?? run.finishedAt ?? run.startedAt ?? run.createdAt ?? null,
    ),
  };
}

export function buildChatMessages(
  session: DevSession | null,
  activeResult: DevTaskResult | null,
): DevChatMessage[] {
  const runs = session?.runs?.length
    ? [...session.runs]
        .sort((left, right) => toTimestamp(left.createdAt) - toTimestamp(right.createdAt))
    : activeResult
      ? [taskResultToRun(activeResult)]
      : [];

  return runs.flatMap((run) => buildRunMessages(run));
}

export function buildWorkspaceOptions(sessions: DevSession[]): string[] {
  const roots = new Set<string>();
  for (const session of sessions) {
    if (session.workspaceRoot?.trim()) {
      roots.add(session.workspaceRoot.trim());
    }
  }
  return Array.from(roots).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

export function buildSessionBoard(sessions: DevSession[]): DevSessionBoardModel {
  const cards = sessions.map((session) => buildSessionBoardCard(session));
  const running = cards.filter((card) => card.status === 'running');
  const failed = cards.filter((card) => card.status === 'failed');
  const success = cards.filter((card) => card.status === 'success');

  return {
    summary: {
      total: cards.length,
      running: running.length,
      failed: failed.length,
      success: success.length,
    },
    lanes: [
      {
        id: 'running',
        title: '进行中',
        description: '仍在执行中的会话，优先关注这里。',
        cards: running.sort((left, right) => sortSessionCards(left, right)),
      },
      {
        id: 'failed',
        title: '失败',
        description: '最近一次 run 失败，适合继续定位问题。',
        cards: failed.sort((left, right) => sortSessionCards(left, right)),
      },
      {
        id: 'success',
        title: '成功',
        description: '最近一次 run 已完成，适合复盘结果。',
        cards: success.sort((left, right) => sortSessionCards(left, right)),
      },
    ],
  };
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case 'queued':
    case 'pending':
    case 'running':
      return 'Running';
    case 'success':
      return 'Success';
    default:
      return 'Failed';
  }
}

function buildRunMessages(run: DevRun): DevChatMessage[] {
  const parsed = parseRunData(run);
  const messages: DevChatMessage[] = [];
  const timestamp = run.startedAt ?? run.createdAt ?? null;
  const runningText = buildRunningAssistantText(run, parsed);
  const finalText = buildFinalAssistantText(run, parsed);

  messages.push({
    id: `${run.id}:user`,
    kind: 'user',
    status: null,
    timestamp,
    text: normalizedText(run.userInput) ?? '新的开发任务',
  });

  if (runningText) {
    messages.push({
      id: `${run.id}:assistant:progress`,
      kind: 'assistant',
      status: normalizeRunStatus(run.status) === 'running' ? 'running' : null,
      timestamp,
      text: runningText,
      tone: 'progress',
    });
  }

  for (const step of buildStepMessageModels(run, parsed)) {
    messages.push({
      id: `${run.id}:tool-call:${step.id}`,
      kind: 'tool-call',
      status: step.callStatus,
      timestamp,
      tool: step.tool,
      command: step.command,
      summary: step.summary,
    });

    if (step.resultStatus) {
      messages.push({
        id: `${run.id}:tool-result:${step.id}`,
        kind: 'tool-result',
        status: step.resultStatus,
        timestamp,
        tool: step.tool,
        summary: step.summary,
        body: step.body,
        error: step.error,
        meta: step.meta,
      });
    }
  }

  if (finalText) {
    messages.push({
      id: `${run.id}:assistant:summary`,
      kind: 'assistant',
      status: normalizeRunStatus(run.status),
      timestamp: run.finishedAt ?? parsed.updatedAt ?? timestamp,
      text: finalText,
      tone: 'summary',
    });
  }

  return dedupeMessages(messages);
}

function buildStepMessageModels(run: DevRun, parsed: ParsedRunData): StepMessageModel[] {
  const planSteps = Array.isArray(run.plan?.steps) ? run.plan!.steps : [];
  const resultMap = new Map(parsed.steps.map((step) => [step.stepId, step]));
  const logMap = new Map(parsed.stepLogs.map((step) => [step.stepId, step]));
  const models: StepMessageModel[] = [];
  const usedStepIds = new Set<string>();

  for (const result of parsed.steps) {
    const log = logMap.get(result.stepId) ?? null;
    models.push({
      id: result.stepId,
      tool: result.executor,
      command: result.command,
      callStatus: result.success ? 'success' : 'failed',
      resultStatus: result.success ? 'success' : 'failed',
      summary: summarizeToolResult({
        output: result.output ?? log?.stdoutPreview ?? null,
        error: result.failureReason ?? result.error ?? log?.stderrPreview ?? null,
        success: result.success,
      }),
      body: normalizedText(result.output) ?? normalizedText(log?.stdoutPreview) ?? null,
      error:
        normalizedText(result.failureReason)
        ?? normalizedText(result.error)
        ?? normalizedText(log?.stderrPreview)
        ?? null,
      meta: buildToolMeta(result.executor, log?.cwd ?? null, result.exitCode ?? log?.exitCode ?? null, log?.duration ?? null),
    });
    usedStepIds.add(result.stepId);
  }

  for (const log of parsed.stepLogs) {
    if (usedStepIds.has(log.stepId)) {
      continue;
    }
    const status = log.status === 'failed'
      ? 'failed'
      : parsed.currentStepId === log.stepId && normalizeRunStatus(run.status) === 'running'
        ? 'running'
        : 'success';
    models.push({
      id: log.stepId,
      tool: normalizedText(log.executor) ?? run.executor ?? 'shell',
      command: log.command,
      callStatus: status,
      resultStatus: status === 'running' ? null : status,
      summary: summarizeToolResult({
        output: log.stdoutPreview,
        error: log.stderrPreview,
        success: status === 'success',
      }),
      body: normalizedText(log.stdoutPreview),
      error: normalizedText(log.stderrPreview),
      meta: buildToolMeta(log.executor ?? run.executor ?? 'shell', log.cwd, log.exitCode, log.duration),
    });
    usedStepIds.add(log.stepId);
  }

  const currentPlanStep = findCurrentPlanStep(planSteps, parsed.currentStepId);
  if (
    normalizeRunStatus(run.status) === 'running'
    && currentPlanStep
    && !usedStepIds.has(currentPlanStep.stepId)
  ) {
    models.push({
      id: currentPlanStep.stepId,
      tool: currentPlanStep.executor ?? run.executor ?? 'shell',
      command: currentPlanStep.command,
      callStatus: 'running',
      resultStatus: null,
      summary: currentPlanStep.description || '正在执行工具调用',
      body: null,
      error: null,
      meta: [],
    });
  }

  return models.sort((left, right) => compareStepId(left.id, right.id));
}

function buildRunningAssistantText(run: DevRun, parsed: ParsedRunData): string | null {
  const status = normalizeRunStatus(run.status);
  if (status !== 'running') {
    return null;
  }
  return normalizedText(parsed.lastEvent)
    ?? (run.plan?.summary?.trim()
      ? `已生成计划：${run.plan.summary.trim()}`
      : '正在处理你的开发任务');
}

function buildFinalAssistantText(run: DevRun, parsed: ParsedRunData): string | null {
  if (normalizeRunStatus(run.status) === 'running') {
    return null;
  }
  return normalizedText(parsed.finalReply)
    ?? normalizedText(parsed.stopReason)
    ?? normalizedText(run.error)
    ?? fallbackAssistantSummary(run.status);
}

function buildToolMeta(
  tool: string,
  cwd: string | null,
  exitCode: number | null,
  durationMs: number | null,
): string[] {
  const items: string[] = [];
  if (normalizedText(tool)) {
    items.push(`tool: ${tool}`);
  }
  if (cwd) {
    items.push(`cwd: ${cwd}`);
  }
  if (exitCode !== null) {
    items.push(`exit: ${exitCode}`);
  }
  if (durationMs !== null) {
    items.push(`${durationMs} ms`);
  }
  return items;
}

function summarizeToolResult(input: {
  output: string | null;
  error: string | null;
  success: boolean;
}): string {
  if (input.error) {
    return firstLine(input.error) ?? (input.success ? '工具执行完成' : '工具执行失败');
  }
  if (input.output) {
    const lines = nonEmptyLineCount(input.output);
    if (lines > 1) {
      return `${lines} lines returned`;
    }
    return firstLine(input.output) ?? '工具返回结果';
  }
  return input.success ? '工具执行完成' : '工具执行失败';
}

function parseRunData(run: DevRun): ParsedRunData {
  const resultRecord = asRecord(run.result);
  const summaryRecord = asRecord(resultRecord?.['summary']);
  const detailRecord = summaryRecord ?? resultRecord;

  return {
    lastEvent: readString(resultRecord, 'lastEvent'),
    finalReply: readString(resultRecord, 'finalReply'),
    stopReason: readString(detailRecord, 'stopReason'),
    currentStepId: readString(resultRecord, 'currentStepId'),
    updatedAt: readString(resultRecord, 'updatedAt'),
    steps: parseStepResults(detailRecord?.['steps']),
    stepLogs: parseStepLogs(detailRecord?.['stepLogs']),
    workspace: normalizeWorkspace(detailRecord?.['workspace']) ?? normalizeWorkspace(resultRecord?.['workspace']),
  };
}

function parseStepResults(value: unknown): ParsedStepResult[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }
      return {
        stepId: readString(record, 'stepId') ?? `step-${index + 1}`,
        executor: readString(record, 'executor')
          ?? readString(record, 'resolvedExecutor')
          ?? 'shell',
        command: readString(record, 'command') ?? '(no command)',
        success: record['success'] === true,
        output: readString(record, 'output'),
        error: readString(record, 'error'),
        failureReason: readString(record, 'failureReason'),
        exitCode: readNumber(record, 'exitCode'),
      } satisfies ParsedStepResult;
    })
    .filter((item): item is ParsedStepResult => item !== null);
}

function parseStepLogs(value: unknown): ParsedStepLog[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }
      const status = readString(record, 'status');
      return {
        stepId: readString(record, 'stepId') ?? `log-${index + 1}`,
        executor: readString(record, 'resolvedExecutor') ?? readString(record, 'executor'),
        command: readString(record, 'command') ?? '(no command)',
        cwd: readString(record, 'cwd'),
        status: status === 'success' || status === 'failed' ? status : null,
        duration: readNumber(record, 'duration'),
        stdoutPreview: readString(record, 'stdoutPreview'),
        stderrPreview: readString(record, 'stderrPreview'),
        exitCode: readNumber(record, 'exitCode'),
      } satisfies ParsedStepLog;
    })
    .filter((item): item is ParsedStepLog => item !== null);
}

function taskResultToRun(task: DevTaskResult): DevRun {
  return {
    id: task.run.id,
    sessionId: task.session.id,
    userInput: task.run.userInput ?? '',
    rerunFromRunId: task.run.rerunFromRunId ?? null,
    plan: task.run.plan,
    status: task.run.status,
    executor: task.run.executor,
    result: task.run.result,
    error: task.run.error,
    artifactPath: task.run.artifactPath,
    workspace: task.run.workspace,
    workspaceRoot: task.run.workspace?.workspaceRoot ?? null,
    projectScope: task.run.workspace?.projectScope ?? null,
    startedAt: task.run.startedAt ?? null,
    finishedAt: task.run.finishedAt ?? null,
    createdAt: task.run.createdAt ?? new Date().toISOString(),
  };
}

function findCurrentPlanStep(
  planSteps: DevPlanStep[],
  currentStepId: string | null,
): (DevPlanStep & { stepId: string }) | null {
  if (!currentStepId) {
    return null;
  }
  const indexText = currentStepId.split('.').at(-1) ?? '';
  const index = Number(indexText);
  if (!Number.isFinite(index)) {
    return null;
  }
  const planStep = planSteps.find((item) => item.index === index);
  return planStep ? { ...planStep, stepId: currentStepId } : null;
}

function compareStepId(left: string, right: string): number {
  const [leftRound, leftStep] = parseStepPosition(left);
  const [rightRound, rightStep] = parseStepPosition(right);
  if (leftRound !== rightRound) {
    return leftRound - rightRound;
  }
  return leftStep - rightStep;
}

function parseStepPosition(stepId: string): [number, number] {
  const [roundText, stepText] = stepId.split('.');
  const round = Number(roundText);
  const step = Number(stepText);
  return [
    Number.isFinite(round) ? round : Number.MAX_SAFE_INTEGER,
    Number.isFinite(step) ? step : Number.MAX_SAFE_INTEGER,
  ];
}

function normalizeRunStatus(status: string): DevMessageStatus {
  if (status === 'queued' || status === 'pending' || status === 'running') {
    return 'running';
  }
  if (status === 'success') {
    return 'success';
  }
  return 'failed';
}

function fallbackAssistantSummary(status: string): string {
  if (status === 'success') {
    return '任务执行成功。';
  }
  if (status === 'cancelled') {
    return '任务已取消。';
  }
  return '任务执行失败。';
}

function buildSessionBoardCard(session: DevSession): DevSessionBoardCard {
  const sortedRuns = [...(session.runs ?? [])]
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));
  const latestRun = sortedRuns[0] ?? null;
  const status = latestRun ? normalizeRunStatus(latestRun.status) : 'success';
  const runningCount = sortedRuns.filter((run) => normalizeRunStatus(run.status) === 'running').length;
  const failedCount = sortedRuns.filter((run) => normalizeRunStatus(run.status) === 'failed').length;
  const successCount = sortedRuns.filter((run) => normalizeRunStatus(run.status) === 'success').length;
  const workspace = latestRun?.workspace
    ?? session.workspace
    ?? (session.workspaceRoot
      ? {
          workspaceRoot: session.workspaceRoot,
          projectScope: session.projectScope ?? session.workspaceRoot,
        }
      : null);

  return {
    id: session.id,
    title: sessionTitle(session, latestRun),
    status,
    statusLabel: runStatusLabel(latestRun?.status ?? 'success'),
    updatedAt: session.updatedAt || latestRun?.createdAt || session.createdAt,
    updatedAtLabel: formatDateTime(session.updatedAt || latestRun?.createdAt || session.createdAt),
    workspaceLabel: compactWorkspaceLabel(workspace),
    workspacePath: workspace?.workspaceRoot ?? null,
    latestTask: firstLine(latestRun?.userInput) ?? null,
    runCount: sortedRuns.length,
    successCount,
    failedCount,
    runningCount,
  };
}

function sortSessionCards(left: DevSessionBoardCard, right: DevSessionBoardCard): number {
  return toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
}

function sessionTitle(session: DevSession, latestRun: DevRun | null): string {
  if (session.title?.trim()) {
    return session.title.trim();
  }
  const text = normalizedText(latestRun?.userInput);
  if (text) {
    return text.length > 64 ? `${text.slice(0, 61)}...` : text;
  }
  return '新的开发会话';
}

function compactWorkspaceLabel(workspace: DevWorkspaceMeta | null): string {
  if (!workspace?.workspaceRoot) {
    return '未绑定 workspace';
  }
  const parts = workspace.workspaceRoot.split('/').filter(Boolean);
  const rootName = parts.at(-1) ?? workspace.workspaceRoot;
  const scope = normalizedText(workspace.projectScope);
  return scope && scope !== workspace.workspaceRoot
    ? `${scope} · ${rootName}`
    : rootName;
}

function workspaceLabel(workspace: DevWorkspaceMeta | null | undefined): string {
  if (!workspace?.workspaceRoot) {
    return '未绑定 workspace';
  }
  return workspace.projectScope?.trim()
    ? `${workspace.projectScope} · ${workspace.workspaceRoot}`
    : workspace.workspaceRoot;
}

function dedupeMessages(messages: DevChatMessage[]): DevChatMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) {
      return false;
    }
    seen.add(message.id);
    return true;
  });
}

function nonEmptyLineCount(value: string): number {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
}

function firstLine(value: string | null | undefined): string | null {
  const normalized = normalizedText(value);
  if (!normalized) {
    return null;
  }
  return normalized.split('\n')[0]?.trim() ?? null;
}

function normalizedText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function toTimestamp(value: string | null | undefined): number {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateTime(value: string | null | undefined): string | null {
  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return null;
  }
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' ? value : null;
}

function normalizeWorkspace(value: unknown): DevWorkspaceMeta | null {
  const record = asRecord(value);
  const workspaceRoot = normalizedText(readString(record, 'workspaceRoot'));
  if (!workspaceRoot) {
    return null;
  }
  return {
    workspaceRoot,
    projectScope: normalizedText(readString(record, 'projectScope')) ?? workspaceRoot,
  };
}
