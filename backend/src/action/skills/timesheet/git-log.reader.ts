import { execSync } from 'node:child_process';
import { TimesheetGitLogError } from './timesheet.errors';

export interface GitLogEntry {
  repoPath: string;
  commits: string[];
}

/**
 * 读取指定 git 仓库在目标日期的提交记录。
 * @param repoPath 仓库绝对路径
 * @param date 目标日期 YYYY-MM-DD
 * @param author 可选 git author 过滤（不填则取所有提交）
 * @returns 提交记录列表（one-line 格式，已过滤 merge commits）
 */
export function readGitLogForDate(repoPath: string, date: string, author?: string): GitLogEntry {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    throw new TimesheetGitLogError(`无效日期: ${date}`);
  }

  const nextDay = new Date(dateObj);
  nextDay.setDate(nextDay.getDate() + 1);
  const afterDate = formatDate(dateObj);
  const beforeDate = formatDate(nextDay);

  const authorArg = author ? `--author="${author}"` : '';
  const cmd = `git log --oneline --no-merges --after="${afterDate} 00:00" --before="${beforeDate} 00:00" ${authorArg}`.trim();

  try {
    const output = execSync(cmd, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 10000,
    });
    const commits = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      // 去除 commit hash 前缀，只保留消息
      .map((line) => line.replace(/^[0-9a-f]+\s+/, ''));
    return { repoPath, commits };
  } catch (e) {
    throw new TimesheetGitLogError(
      `读取 git log 失败 (${repoPath}): ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
}

/**
 * 分配 8 小时到 N 个项目（整数，总和 = totalHours）。
 * 使用 floor 分配 + 余数顺分策略。
 */
export function distributeHours(projectCount: number, totalHours: number = 8): number[] {
  if (projectCount <= 0) return [];
  const capped = Math.min(projectCount, totalHours);
  const base = Math.floor(totalHours / capped);
  const remainder = totalHours % capped;
  return Array.from({ length: capped }, (_, i) => base + (i < remainder ? 1 : 0));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
