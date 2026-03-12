"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const timesheet_executor_1 = require("../src/action/skills/timesheet/timesheet.executor");
function parseCount(value, fallback) {
    const n = Number(value ?? '');
    if (!Number.isFinite(n) || n <= 0)
        return fallback;
    return Math.floor(n);
}
async function main() {
    const targetDate = String(process.argv[2] ?? '2026-03-09').trim();
    const count = parseCount(process.argv[3], 10);
    const outDir = path.join(process.cwd(), 'assets', 'timesheet-debug');
    await fs.mkdir(outDir, { recursive: true });
    const runStartedAt = new Date();
    const records = [];
    console.log(`[TimesheetSmoke] start date=${targetDate} count=${count}`);
    for (let i = 1; i <= count; i += 1) {
        const startedAt = new Date();
        console.log(`[TimesheetSmoke] run=${i}/${count} startedAt=${startedAt.toISOString()}`);
        let ok = false;
        let message = '';
        try {
            const result = await (0, timesheet_executor_1.executeTimesheetWorkflow)(targetDate);
            ok = result.ok;
            message = result.message;
        }
        catch (error) {
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
        console.log(`[TimesheetSmoke] run=${i}/${count} ok=${ok} durationMs=${durationMs} message=${message}`);
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
    console.error(`[TimesheetSmoke] fatal=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
});
//# sourceMappingURL=smoke-timesheet.js.map