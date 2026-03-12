import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { executeTimesheetWorkflow } from '../src/action/skills/timesheet/timesheet.executor';

interface SmokeRecord {
  index: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  ok: boolean;
  message: string;
}

function parseCount(value: string | undefined, fallback: number): number {
  const n = Number(value ?? '');
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function main(): Promise<void> {
  const targetDate = String(process.argv[2] ?? '2026-03-09').trim();
  const count = parseCount(process.argv[3], 10);
  const outDir = path.join(process.cwd(), 'assets', 'timesheet-debug');
  await fs.mkdir(outDir, { recursive: true });

  const runStartedAt = new Date();
  const records: SmokeRecord[] = [];

  console.log(`[TimesheetSmoke] start date=${targetDate} count=${count}`);

  for (let i = 1; i <= count; i += 1) {
    const startedAt = new Date();
    console.log(`[TimesheetSmoke] run=${i}/${count} startedAt=${startedAt.toISOString()}`);

    let ok = false;
    let message = '';
    try {
      const result = await executeTimesheetWorkflow(targetDate);
      ok = result.ok;
      message = result.message;
    } catch (error) {
      ok = false;
      message = error instanceof Error ? error.message : String(error);
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();
    records.push({
      index: i,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs,
      ok,
      message,
    });

    console.log(
      `[TimesheetSmoke] run=${i}/${count} ok=${ok} durationMs=${durationMs} message=${message}`,
    );
  }

  const runEndedAt = new Date();
  const summary = {
    targetDate,
    count,
    startedAt: runStartedAt.toISOString(),
    endedAt: runEndedAt.toISOString(),
    durationMs: runEndedAt.getTime() - runStartedAt.getTime(),
    successCount: records.filter((r) => r.ok).length,
    failedCount: records.filter((r) => !r.ok).length,
    records,
  };

  const ts = runEndedAt.toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `timesheet-smoke-${targetDate}-${count}x-${ts}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`[TimesheetSmoke] summaryFile=${outPath}`);
}

main().catch((error) => {
  console.error(
    `[TimesheetSmoke] fatal=${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
  process.exit(1);
});
