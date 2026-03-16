import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { RegressionReport } from './regression.types';

export class RegressionReporter {
  constructor(private readonly qaRoot: string) {}

  async write(report: RegressionReport): Promise<{
    latestJsonPath: string;
    latestMarkdownPath: string;
    historyJsonPath: string;
    historyMarkdownPath: string;
  }> {
    const latestDir = resolve(this.qaRoot, 'reports', 'latest');
    const historyDir = resolve(this.qaRoot, 'reports', 'history');
    await mkdir(latestDir, { recursive: true });
    await mkdir(historyDir, { recursive: true });

    const slug = `${report.mode}-${report.runId}`;
    const latestJsonPath = resolve(latestDir, `${report.mode}.json`);
    const latestMarkdownPath = resolve(latestDir, `${report.mode}.md`);
    const historyJsonPath = resolve(historyDir, `${slug}.json`);
    const historyMarkdownPath = resolve(historyDir, `${slug}.md`);
    const jsonContent = `${JSON.stringify(report, null, 2)}\n`;
    const markdownContent = buildMarkdownReport(report);

    await writeFile(latestJsonPath, jsonContent, 'utf8');
    await writeFile(historyJsonPath, jsonContent, 'utf8');
    await writeFile(latestMarkdownPath, markdownContent, 'utf8');
    await writeFile(historyMarkdownPath, markdownContent, 'utf8');

    return {
      latestJsonPath,
      latestMarkdownPath,
      historyJsonPath,
      historyMarkdownPath,
    };
  }
}

function buildMarkdownReport(report: RegressionReport): string {
  const failedResults = report.results.filter((result) => result.status !== 'passed');
  const lines: string[] = [
    '# 小晴对话回归报告',
    '',
    `- Run ID: \`${report.runId}\``,
    `- Mode: \`${report.mode}\``,
    `- Generated At: ${report.generatedAt}`,
    `- Summary: total=${report.summary.total}, passed=${report.summary.passed}, failed=${report.summary.failed}, errored=${report.summary.errored}`,
    '',
  ];

  if (failedResults.length === 0) {
    lines.push('## 结果', '', '所有场景均通过。', '');
  } else {
    lines.push('## 失败场景', '');
    for (const result of failedResults) {
      lines.push(`### ${result.scenario.id}`);
      lines.push(`- Status: ${result.status}`);
      if (result.errorMessage) {
        lines.push(`- Error: ${result.errorMessage}`);
      }
      const failedHard = result.hardChecks.filter((item) => !item.passed);
      if (failedHard.length > 0) {
        lines.push(`- Hard Failures: ${failedHard.map((item) => `${item.ruleType}(${item.detail})`).join('；')}`);
      }
      const failedSoft = result.softScores.filter((item) => !item.passed);
      if (failedSoft.length > 0) {
        lines.push(`- Soft Failures: ${failedSoft.map((item) => `${item.dimension}=${item.score}/${item.minScore}`).join('；')}`);
      }
      if (result.evidence?.finalReply) {
        lines.push(`- Final Reply: ${preview(result.evidence.finalReply)}`);
      }
      lines.push('');
    }
  }

  lines.push('## 全量结果', '');
  for (const result of report.results) {
    lines.push(`- ${result.scenario.id}: ${result.status}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function preview(input: string, limit = 180): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit)}...`
    : normalized;
}
