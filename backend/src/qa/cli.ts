import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConversationService } from '../assistant/conversation/conversation.service';
import { DevAgentService } from '../dev-agent/dev-agent.service';
import { LlmService } from '../infra/llm/llm.service';
import { PrismaService } from '../infra/prisma.service';
import { DispatcherService } from '../orchestrator/dispatcher.service';
import { RegressionDatasetLoader } from './regression.loader';
import { resolveProjectRoot, resolveQaRoot } from './regression.paths';
import { RegressionReporter } from './regression.reporter';
import { RegressionRunner, RegressionScenarioExecutionError } from './regression.runner';
import { RegressionHardJudge } from './regression.hard-judge';
import { QaRuntimeModule } from './qa-runtime.module';
import { RegressionSoftJudge } from './regression.soft-judge';
import type {
  RegressionReport,
  RegressionRunSummary,
  ScenarioRunResult,
} from './regression.types';

interface CliOptions {
  mode: 'gate' | 'replay' | 'all';
  scenarioIds: string[];
  cleanup: boolean;
  skipSoftJudge: boolean;
  devWorkspaceMode: 'snapshot' | 'current';
  maxDevWaitMs: number;
  devPollIntervalMs: number;
}

async function main(): Promise<void> {
  process.env.DEV_RUN_DISABLE_RECOVERY ??= 'true';

  const options = parseArgs(process.argv.slice(2));
  const projectRoot = resolveProjectRoot();
  const qaRoot = resolveQaRoot();
  const loader = new RegressionDatasetLoader(qaRoot);
  const scenarios = await loader.load({
    mode: options.mode,
    scenarioIds: options.scenarioIds.length > 0 ? options.scenarioIds : undefined,
  });

  if (scenarios.length === 0) {
    throw new Error('No regression scenarios matched the current filters.');
  }

  const app = await NestFactory.createApplicationContext(QaRuntimeModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dispatcher = app.get(DispatcherService, { strict: false });
    const conversation = app.get(ConversationService, { strict: false });
    const devAgent = app.get(DevAgentService, { strict: false });
    const prisma = app.get(PrismaService, { strict: false });
    const llm = app.get(LlmService, { strict: false });

    const runner = new RegressionRunner({
      dispatcher,
      conversation,
      devAgent,
      prisma,
      projectRoot,
    }, {
      cleanup: options.cleanup,
      devWorkspaceMode: options.devWorkspaceMode,
      maxDevWaitMs: options.maxDevWaitMs,
      devPollIntervalMs: options.devPollIntervalMs,
    });
    const hardJudge = new RegressionHardJudge();
    const softJudge = new RegressionSoftJudge(llm, {
      enabled: !options.skipSoftJudge,
    });
    const reporter = new RegressionReporter(qaRoot);
    const results: ScenarioRunResult[] = [];

    for (const scenario of scenarios) {
      process.stdout.write(`Running ${scenario.id} ...\n`);
      try {
        const evidence = await runner.runScenario(scenario);
        const hardChecks = hardJudge.evaluate(scenario, evidence);
        const softScores = await softJudge.evaluate(scenario, evidence, hardChecks);
        const status = hardChecks.every((item) => item.passed) && softScores.every((item) => item.passed)
          ? 'passed'
          : 'failed';
        results.push({
          scenario,
          status,
          evidence,
          hardChecks,
          softScores,
          errorMessage: null,
        });
      } catch (err) {
        const error = err as Error;
        const executionError = err instanceof RegressionScenarioExecutionError ? err : null;
        results.push({
          scenario,
          status: 'error',
          evidence: executionError?.evidence ?? null,
          hardChecks: [],
          softScores: [],
          errorMessage: error.message,
        });
      }
    }

    const summary = buildSummary(results);
    const report: RegressionReport = {
      runId: timestampSlug(new Date()),
      mode: options.mode,
      generatedAt: new Date().toISOString(),
      summary,
      results,
    };
    const output = await reporter.write(report);

    process.stdout.write(
      [
        `Report written:`,
        `- ${output.latestJsonPath}`,
        `- ${output.latestMarkdownPath}`,
        `Summary: total=${summary.total}, passed=${summary.passed}, failed=${summary.failed}, errored=${summary.errored}`,
      ].join('\n') + '\n',
    );

    if (summary.failed > 0 || summary.errored > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'all',
    scenarioIds: [],
    cleanup: true,
    skipSoftJudge: false,
    devWorkspaceMode: 'snapshot',
    maxDevWaitMs: 120_000,
    devPollIntervalMs: 2_000,
  };

  for (const arg of argv) {
    if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);
      if (value === 'gate' || value === 'replay' || value === 'all') {
        options.mode = value;
      }
      continue;
    }
    if (arg.startsWith('--scenario=')) {
      options.scenarioIds.push(arg.slice('--scenario='.length));
      continue;
    }
    if (arg === '--no-cleanup') {
      options.cleanup = false;
      continue;
    }
    if (arg === '--skip-soft-judge') {
      options.skipSoftJudge = true;
      continue;
    }
    if (arg.startsWith('--dev-workspace=')) {
      const value = arg.slice('--dev-workspace='.length);
      if (value === 'snapshot' || value === 'current') {
        options.devWorkspaceMode = value;
      }
      continue;
    }
    if (arg.startsWith('--max-dev-wait-ms=')) {
      options.maxDevWaitMs = Number(arg.slice('--max-dev-wait-ms='.length)) || options.maxDevWaitMs;
      continue;
    }
    if (arg.startsWith('--dev-poll-interval-ms=')) {
      options.devPollIntervalMs = Number(arg.slice('--dev-poll-interval-ms='.length)) || options.devPollIntervalMs;
    }
  }

  return options;
}

function buildSummary(results: ScenarioRunResult[]): RegressionRunSummary {
  const summary: RegressionRunSummary = {
    total: results.length,
    passed: 0,
    failed: 0,
    errored: 0,
    hardFailed: 0,
    softFailed: 0,
  };

  for (const result of results) {
    if (result.status === 'passed') {
      summary.passed += 1;
      continue;
    }
    if (result.status === 'error') {
      summary.errored += 1;
      continue;
    }
    summary.failed += 1;
    if (result.hardChecks.some((item) => !item.passed)) {
      summary.hardFailed += 1;
    }
    if (result.softScores.some((item) => !item.passed)) {
      summary.softFailed += 1;
    }
  }

  return summary;
}

function timestampSlug(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

void main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
