import { Injectable } from '@nestjs/common';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { OpenClawExecutor } from '../executors/openclaw.executor';
import { ShellExecutor } from '../executors/shell.executor';
import { ClaudeCodeExecutor } from '../executors/claude-code.executor';
import type { IDevExecutor } from '../executors/executor.interface';

/** 统一解析 dev 执行器，避免 Orchestrator 混用 Capability 与具体实现。 */
@Injectable()
export class DevExecutorResolver {
  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly shellExecutor: ShellExecutor,
    private readonly openclawExecutor: OpenClawExecutor,
    private readonly claudeCodeExecutor: ClaudeCodeExecutor,
  ) {}

  resolve(name: string): IDevExecutor {
    const cap = this.capabilityRegistry.get(name);
    if (cap) {
      return cap as unknown as IDevExecutor;
    }

    switch (name) {
      case 'claude-code':
        return this.claudeCodeExecutor;
      case 'openclaw':
        return this.openclawExecutor;
      case 'shell':
      default:
        return this.shellExecutor;
    }
  }
}
