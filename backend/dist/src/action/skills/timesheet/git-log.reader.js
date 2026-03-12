"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readGitLogForDate = readGitLogForDate;
exports.distributeHours = distributeHours;
const node_child_process_1 = require("node:child_process");
const timesheet_errors_1 = require("./timesheet.errors");
function readGitLogForDate(repoPath, date, author) {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
        throw new timesheet_errors_1.TimesheetGitLogError(`无效日期: ${date}`);
    }
    const nextDay = new Date(dateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    const afterDate = formatDate(dateObj);
    const beforeDate = formatDate(nextDay);
    const authorArg = author ? `--author="${author}"` : '';
    const cmd = `git log --oneline --no-merges --after="${afterDate} 00:00" --before="${beforeDate} 00:00" ${authorArg}`.trim();
    try {
        const output = (0, node_child_process_1.execSync)(cmd, {
            cwd: repoPath,
            encoding: 'utf-8',
            timeout: 10000,
        });
        const commits = output
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => line.replace(/^[0-9a-f]+\s+/, ''));
        return { repoPath, commits };
    }
    catch (e) {
        throw new timesheet_errors_1.TimesheetGitLogError(`读取 git log 失败 (${repoPath}): ${e instanceof Error ? e.message : String(e)}`, e);
    }
}
function distributeHours(projectCount, totalHours = 8) {
    if (projectCount <= 0)
        return [];
    const capped = Math.min(projectCount, totalHours);
    const base = Math.floor(totalHours / capped);
    const remainder = totalHours % capped;
    return Array.from({ length: capped }, (_, i) => base + (i < remainder ? 1 : 0));
}
function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
//# sourceMappingURL=git-log.reader.js.map