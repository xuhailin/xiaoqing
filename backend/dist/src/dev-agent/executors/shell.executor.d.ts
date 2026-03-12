import type { IDevExecutor, DevExecutorInput, DevExecutorOutput } from './executor.interface';
import type { ICapability } from '../../action/capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../action/capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';
import { WorkspaceManager } from '../workspace/workspace-manager.service';
export declare class ShellExecutor implements IDevExecutor, ICapability {
    private readonly workspaceManager;
    readonly name = "shell";
    readonly taskIntent = "shell_command";
    readonly channels: MessageChannel[];
    readonly description = "\u672C\u5730 shell \u547D\u4EE4\u6267\u884C\uFF08ls/cat/grep/git/npm \u7B49\uFF09";
    private readonly logger;
    private readonly projectRoot;
    constructor(workspaceManager: WorkspaceManager);
    isAvailable(): boolean;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
    execute(input: DevExecutorInput): Promise<DevExecutorOutput>;
    private executeCommand;
    private runCommandOnce;
    private resolveCwd;
    private classifyFailure;
    private classifySpawnFailure;
    private truncate;
    private limitLines;
}
