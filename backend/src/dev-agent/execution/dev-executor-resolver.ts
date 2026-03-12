import { Injectable, Logger } from '@nestjs/common';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { ShellExecutor } from '../executors/shell.executor';
import type { IDevExecutor } from '../executors/executor.interface';
import { isDevExecutorName } from '../dev-agent.types';

/** 统一解析 dev 执行器，避免 Orchestrator 混用 Capability 与具体实现。 */
@Injectable()
export class DevExecutorResolver {
  private readonly logger = new Logger(DevExecutorResolver.name);

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly shellExecutor: ShellExecutor,
  ) {}

  resolve(name: string): IDevExecutor {
    if (!isDevExecutorName(name)) {
      this.logger.warn(`Invalid executor name "${name}", fallback to shell`);
      return this.shellExecutor;
    }
    const cap = this.capabilityRegistry.get(name);
    if (cap && this.isDevExecutor(cap)) {
      return cap;
    }
    this.logger.warn(`Executor "${name}" not found or invalid, fallback to shell`);
    return this.shellExecutor;
  }

  private isDevExecutor(capability: unknown): capability is IDevExecutor {
    const maybe = capability as Partial<IDevExecutor>;
    return (
      typeof maybe?.name === 'string' &&
      typeof maybe?.execute === 'function' &&
      Array.isArray(maybe?.supportedStrategies) &&
      (maybe?.costLevel === 'low' || maybe?.costLevel === 'medium' || maybe?.costLevel === 'high')
    );
  }
}
