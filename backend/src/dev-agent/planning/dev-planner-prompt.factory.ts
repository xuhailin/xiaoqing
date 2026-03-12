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
    const capabilityLines = devCapabilities.length > 0
      ? devCapabilities.map((c) => `- ${c.name}：${c.description}`).join('\n')
      : '- shell：本地 shell 命令执行（支持 ls, cat, grep, find, node, npm, npx, git, curl 等常用命令）\n- openclaw：远端 AI Agent 执行（适合复杂推理、代码生成等任务）';
    const shellPolicy = `shell 允许命令（只能使用以下首命令）：\n${ALLOWED_SHELL_COMMANDS.map((c) => `- ${c}`).join('\n')}`;

    const systemPrompt = `你是 DevAgent 的任务规划器，需要输出“当前轮”的小步执行计划。

可用能力（供你理解环境，不用于你直接绑定执行器）：
${capabilityLines}
${shellPolicy}

硬性规则：
1. 只输出 JSON
2. 当前轮最多返回 2 个步骤（small-step）
3. 每个步骤必须先定义 strategy，禁止在规划中绑定具体 executor
4. strategy 仅允许：inspect | edit | verify | autonomous_coding
5. 成本优先：简单读取/定位/检查/运行命令优先规划为 inspect 或 verify，不要滥用 autonomous_coding
6. edit 仅用于小范围修改/补丁式调整；大规模重构或复杂修复才用 autonomous_coding
7. inspect / verify 步骤的 command 应为可直接执行的 shell 命令，且首命令必须在允许列表中
8. edit 若是 shell 小改动可给 shell 命令；若需要自主编码则给自然语言任务指令
9. 若只是输出文本，禁止 python -c，优先 echo 或 node -e
10. 命令必须可直接执行，不要占位符
11. 避免使用 shell 管道/重定向（如 |、2>/dev/null、>）；若需截断输出，优先使用命令自身参数（如 --max-count、-maxdepth）

输出格式：
{
  "summary": "当前轮计划简述",
  "steps": [
    { "index": 1, "description": "步骤描述", "strategy": "inspect", "command": "具体命令或任务指令" }
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
      return `${s.stepId ?? s.stepIndex}. [strategy=${s.strategy}] ${s.command} => ${s.success ? 'success' : `failed(${s.errorType ?? 'UNKNOWN'})`}`;
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
