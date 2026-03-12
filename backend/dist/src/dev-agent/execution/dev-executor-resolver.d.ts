import { CapabilityRegistry } from '../../action/capability-registry.service';
import { OpenClawExecutor } from '../executors/openclaw.executor';
import { ShellExecutor } from '../executors/shell.executor';
import { ClaudeCodeExecutor } from '../executors/claude-code.executor';
import type { IDevExecutor } from '../executors/executor.interface';
export declare class DevExecutorResolver {
    private readonly capabilityRegistry;
    private readonly shellExecutor;
    private readonly openclawExecutor;
    private readonly claudeCodeExecutor;
    constructor(capabilityRegistry: CapabilityRegistry, shellExecutor: ShellExecutor, openclawExecutor: OpenClawExecutor, claudeCodeExecutor: ClaudeCodeExecutor);
    resolve(name: string): IDevExecutor;
}
