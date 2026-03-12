import { CapabilityRegistry } from '../capability-registry.service';
import { OpenClawService } from '../../openclaw/openclaw.service';
import type { ToolExecutionResult, ToolRequest } from './tool-executor.types';
export declare class ToolExecutorRegistry {
    private readonly capabilityRegistry;
    private readonly openClaw;
    private readonly logger;
    constructor(capabilityRegistry: CapabilityRegistry, openClaw: OpenClawService);
    isExecutorAvailable(executor: ToolRequest['executor']): boolean;
    execute(request: ToolRequest): Promise<ToolExecutionResult>;
    private fail;
    private fromCapabilityResult;
}
