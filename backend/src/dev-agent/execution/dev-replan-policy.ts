import { Injectable } from '@nestjs/common';
import type { DevExecutorErrorType } from '../dev-agent.types';
import type { DevTaskContext } from '../dev-task-context';
import { ALLOWED_SHELL_COMMANDS } from '../shell-command-policy';

/** 失败治理策略：自动重规划判定与失败建议生成。 */
@Injectable()
export class DevReplanPolicy {
  shouldAutoReplan(errorType: DevExecutorErrorType): boolean {
    return errorType === 'COMMAND_NOT_ALLOWED'
      || errorType === 'FILE_NOT_FOUND'
      || errorType === 'NON_ZERO_EXIT'
      || errorType === 'COMMAND_NOT_FOUND';
  }

  buildFailureSuggestion(taskContext: DevTaskContext): string {
    const lastError = taskContext.errors.at(-1);
    if (!lastError) return '请检查步骤命令与路径后重试。';

    switch (lastError.errorType) {
      case 'COMMAND_NOT_ALLOWED':
        return `请改用允许命令：${ALLOWED_SHELL_COMMANDS.join(', ')}`;
      case 'HIGH_RISK_SYNTAX':
        return '检测到高风险 shell 语法，建议人工确认后手动执行。';
      case 'FILE_NOT_FOUND':
        return '建议先执行 ls/find 确认文件路径，再执行目标命令。';
      case 'COMMAND_NOT_FOUND':
        return '命令不存在，建议改用 node/npx/npm/git/curl 等已允许命令。';
      case 'PERMISSION_DENIED':
        return '权限受限，建议改用只读操作或调整任务目标。';
      case 'TIMEOUT':
        return '命令耗时过长，建议拆分为更小步骤。';
      case 'NON_ZERO_EXIT':
        return '命令返回非 0，建议先查看 stderr 并分步排查。';
      default:
        return '建议缩小任务范围并重试。';
    }
  }
}
