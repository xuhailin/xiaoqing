import { Injectable, Logger } from '@nestjs/common';
import type { IDevAgentExecutor } from '../dev-agent.types';

const AGENT_EXECUTOR_TOKEN = Symbol('DEV_AGENT_EXECUTORS');
export { AGENT_EXECUTOR_TOKEN };

/**
 * 解析 run-level agent executor。
 *
 * 按 name 查找已注册的 IDevAgentExecutor 实现，默认返回 'claude-code'。
 * 将来新增 agent executor 只需实现 IDevAgentExecutor 并注入即可。
 */
@Injectable()
export class DevAgentExecutorResolver {
  private readonly logger = new Logger(DevAgentExecutorResolver.name);
  private readonly executorMap = new Map<string, IDevAgentExecutor>();

  register(executor: IDevAgentExecutor): void {
    this.executorMap.set(executor.name, executor);
    this.logger.log(`Registered agent executor: ${executor.name}`);
  }

  resolve(name?: string): IDevAgentExecutor | null {
    const target = name ?? 'claude-code';
    const executor = this.executorMap.get(target);
    if (!executor) {
      this.logger.warn(`Agent executor "${target}" not found (registered: ${[...this.executorMap.keys()].join(', ') || 'none'})`);
      return null;
    }
    if (!executor.isAvailable()) {
      this.logger.warn(`Agent executor "${target}" is not available`);
      return null;
    }
    return executor;
  }

  listAvailable(): IDevAgentExecutor[] {
    return [...this.executorMap.values()].filter((e) => e.isAvailable());
  }
}
