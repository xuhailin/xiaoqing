import type { IDevExecutor, DevExecutorInput, DevExecutorOutput } from './executor.interface';
import type { ICapability } from '../../action/capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../action/capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';
import { OpenClawService } from '../../openclaw/openclaw.service';
export declare class OpenClawExecutor implements IDevExecutor, ICapability {
    private readonly openclaw;
    readonly name = "openclaw";
    readonly taskIntent = "openclaw_delegate";
    readonly channels: MessageChannel[];
    readonly description = "\u8FDC\u7AEF AI Agent \u6267\u884C\uFF08\u590D\u6742\u63A8\u7406\u3001\u4EE3\u7801\u751F\u6210\u7B49\uFF09";
    private readonly logger;
    constructor(openclaw: OpenClawService);
    isAvailable(): boolean;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
    execute(input: DevExecutorInput): Promise<DevExecutorOutput>;
}
