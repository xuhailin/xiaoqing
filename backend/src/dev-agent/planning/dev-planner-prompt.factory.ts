import { Injectable } from '@nestjs/common';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { ALLOWED_SHELL_COMMANDS } from '../shell-command-policy';
import type { DevTaskContext } from '../dev-task-context';
import { GOAL_MAX_CHARS, REPLAN_REASON_MAX_CHARS } from '../dev-agent.constants';

/** 组装 planner 的 system/user prompt。 */
@Injectable()
export class DevPlannerPromptFactory {
  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  create(goal: string, taskContext: DevTaskContext, options: { round: number; replanReason: string | null }) {
    const safeGoal = String(goal ?? '').slice(0, GOAL_MAX_CHARS);
    const safeReplanReason = options.replanReason
      ? String(options.replanReason).slice(0, REPLAN_REASON_MAX_CHARS)
      : '无';
    const devCapabilities = this.capabilityRegistry.listAvailable('dev');
    const executorLines = devCapabilities.length > 0
      ? devCapabilities.map((c) => `- ${c.name}：${c.description}`).join('\n')
      : '- shell：本地 shell 命令执行（支持 ls, cat, grep, find, node, npm, npx, git, curl 等常用命令）\n- openclaw：远端 AI Agent 执行（适合复杂推理、代码生成等任务）';
    const shellPolicy = `shell 允许命令（只能使用以下首命令）：\n${ALLOWED_SHELL_COMMANDS.map((c) => `- ${c}`).join('\n')}`;

    const systemPrompt = `你是 DevAgent 的任务规划器，需要输出“当前轮”的小步执行计划。

可用执行器：
${executorLines}
${shellPolicy}

硬性规则：
1. 只输出 JSON
2. 当前轮最多返回 2 个步骤（small-step）
3. shell 命令的首命令必须在允许列表中
4. 简单查询/检查优先 shell
5. 代码生成/修改/重构/bug 修复等编码任务，优先 claude-code（它能自主完成多步骤编码，含文件读写、搜索、测试）
6. 只有需要远端 AI 推理且 claude-code 不可用时才用 openclaw
7. 若只是输出文本，禁止 python -c，优先 echo 或 node -e
8. 命令必须可直接执行，不要占位符
9. 避免使用 shell 管道/重定向（如 |、2>/dev/null、>）；若需截断输出，优先使用命令自身参数（如 --max-count、-maxdepth）
10. 使用 claude-code 时，command 字段填写完整的任务描述（自然语言），不是 shell 命令

输出格式：
{
  "summary": "当前轮计划简述",
  "steps": [
    { "index": 1, "description": "步骤描述", "executor": "shell", "command": "具体命令" }
  ]
}`;

    const userPrompt = `任务目标：
${safeGoal}

当前轮次：${options.round}
自动重规划原因（如有）：
${safeReplanReason}

历史上下文（最近步骤与错误）：
${this.formatTaskContextForPlanner(taskContext)}`;

    return { systemPrompt, userPrompt };
  }

  private formatTaskContextForPlanner(taskContext: DevTaskContext): string {
    const recentSteps = taskContext.stepResults.slice(-6).map((s) => {
      return `${s.stepId ?? s.stepIndex}. [${s.executor}] ${s.command} => ${s.success ? 'success' : `failed(${s.errorType ?? 'UNKNOWN'})`}`;
    });
    const recentErrors = taskContext.errors.slice(-4).map((e) => {
      return `${e.stepId}: ${e.errorType} - ${e.message}`;
    });

    if (recentSteps.length === 0 && recentErrors.length === 0) {
      return '无历史步骤（本任务首轮规划）。';
    }

    return [
      '最近步骤：',
      ...(recentSteps.length > 0 ? recentSteps : ['（无）']),
      '最近错误：',
      ...(recentErrors.length > 0 ? recentErrors : ['（无）']),
    ].join('\n');
  }
}
