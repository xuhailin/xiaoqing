import { Injectable, Logger } from '@nestjs/common';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { RegressionReportsService, type RegressionReportMode } from './regression-reports.service';
import { resolveBackendRoot } from './regression.paths';

type RegressionRunStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'succeeded'
  | 'failed';

interface RegressionRunState {
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
}

@Injectable()
export class RegressionRunService {
  private readonly logger = new Logger(RegressionRunService.name);
  private readonly backendRoot = resolveBackendRoot(process.cwd());
  private readonly states = new Map<RegressionReportMode, RegressionRunState>();
  private readonly children = new Map<RegressionReportMode, ChildProcessWithoutNullStreams>();
  private readonly maxLogLines = 1200;

  constructor(private readonly reports: RegressionReportsService) {}

  async getAllStatuses() {
    const [gate, replay] = await Promise.all([
      this.getStatus('gate'),
      this.getStatus('replay'),
    ]);
    return { gate, replay };
  }

  async getStatus(mode: RegressionReportMode) {
    const state = this.states.get(mode) ?? this.createIdleState(mode);
    const latestReport = await this.reports.readLatestReport(mode);
    const latestGeneratedAt = extractReportGeneratedAt(latestReport.report);

    return {
      ...state,
      latestReportUpdatedAt: latestReport.updatedAt,
      latestReportGeneratedAt: latestGeneratedAt,
      latestReportSummary: extractReportSummary(latestReport.report),
    };
  }

  async start(mode: RegressionReportMode) {
    const current = this.states.get(mode);
    if (current && (current.status === 'starting' || current.status === 'running')) {
      return this.getStatus(mode);
    }

    const command = mode === 'gate'
      ? ['npm', 'run', 'qa:gate']
      : ['npm', 'run', 'qa:replay'];
    const state: RegressionRunState = {
      mode,
      status: 'starting',
      command,
      pid: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      logs: [],
      error: null,
      runReportGeneratedAt: null,
    };
    this.states.set(mode, state);

    const child = spawn(command[0], command.slice(1), {
      cwd: this.backendRoot,
      env: {
        ...process.env,
        FEATURE_DEV_REMINDER: 'false',
        DEV_RUN_DISABLE_RECOVERY: 'true',
        FORCE_COLOR: '0',
      },
      stdio: 'pipe',
    });
    this.children.set(mode, child);

    state.pid = child.pid ?? null;
    state.status = 'running';
    this.appendLog(mode, `[system] Started ${command.join(' ')} (pid=${state.pid ?? 'unknown'})`);

    child.stdout.on('data', (chunk) => {
      this.captureChunk(mode, chunk);
    });
    child.stderr.on('data', (chunk) => {
      this.captureChunk(mode, chunk);
    });
    child.on('error', (error) => {
      state.error = error.message;
      state.status = 'failed';
      state.finishedAt = new Date().toISOString();
      this.appendLog(mode, `[error] ${error.message}`);
      this.children.delete(mode);
      this.logger.error(`Regression run failed to start: mode=${mode} err=${error.message}`);
    });
    child.on('close', async (code) => {
      state.exitCode = code;
      state.status = code === 0 ? 'succeeded' : 'failed';
      state.finishedAt = new Date().toISOString();
      this.appendLog(mode, `[system] Process exited with code ${code ?? 'null'}`);
      this.children.delete(mode);

      try {
        const latestReport = await this.reports.readLatestReport(mode);
        state.runReportGeneratedAt = extractReportGeneratedAt(latestReport.report);
      } catch {
        state.runReportGeneratedAt = null;
      }
    });

    return this.getStatus(mode);
  }

  private captureChunk(mode: RegressionReportMode, chunk: Buffer) {
    const raw = stripAnsi(chunk.toString('utf8'));
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      this.appendLog(mode, line);
    }
  }

  private appendLog(mode: RegressionReportMode, line: string) {
    const state = this.states.get(mode);
    if (!state) {
      return;
    }
    state.logs.push(`[${timestampLabel()}] ${line}`);
    if (state.logs.length > this.maxLogLines) {
      state.logs.splice(0, state.logs.length - this.maxLogLines);
    }
  }

  private createIdleState(mode: RegressionReportMode): RegressionRunState {
    return {
      mode,
      status: 'idle',
      command: mode === 'gate' ? ['npm', 'run', 'qa:gate'] : ['npm', 'run', 'qa:replay'],
      pid: null,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      logs: [],
      error: null,
      runReportGeneratedAt: null,
    };
  }
}

function stripAnsi(input: string): string {
  return input.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-9;]*m/g,
    '',
  );
}

function timestampLabel() {
  return new Date().toISOString().slice(11, 19);
}

function extractReportGeneratedAt(report: unknown): string | null {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return null;
  }
  const value = (report as Record<string, unknown>).generatedAt;
  return typeof value === 'string' ? value : null;
}

function extractReportSummary(report: unknown): Record<string, unknown> | null {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return null;
  }
  const value = (report as Record<string, unknown>).summary;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
