import { ConfigService } from '@nestjs/config';
import type { IDevExecutor, DevExecutorInput, DevExecutorOutput } from './executor.interface';
import type { ICapability } from '../../action/capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../action/capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';
import { ClaudeCodeStreamService } from './claude-code-stream.service';
import { WorkspaceManager } from '../workspace/workspace-manager.service';
export declare class ClaudeCodeExecutor implements IDevExecutor, ICapability {
    private readonly streamService;
    private readonly workspaceManager;
    readonly name = "claude-code";
    readonly taskIntent = "claude_code_agent";
    readonly channels: MessageChannel[];
    readonly description = "Claude Code Agent \u81EA\u4E3B\u7F16\u7801\uFF08\u4EE3\u7801\u751F\u6210/\u4FEE\u6539/\u91CD\u6784/bug \u4FEE\u590D\uFF09";
    private readonly logger;
    private readonly enabled;
    private readonly projectRoot;
    private readonly activeAbortControllers;
    constructor(streamService: ClaudeCodeStreamService, workspaceManager: WorkspaceManager, config: ConfigService);
    isAvailable(): boolean;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
    execute(input: DevExecutorInput): Promise<DevExecutorOutput>;
    cancel(runId: string): boolean;
    private classifyError;
}
