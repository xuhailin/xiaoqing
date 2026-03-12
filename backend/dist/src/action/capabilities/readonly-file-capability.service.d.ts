import type { ICapability } from '../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';
export declare class ReadonlyFileCapabilityService implements ICapability {
    readonly name = "readonly-file";
    readonly taskIntent = "internal_readonly_file";
    readonly channels: MessageChannel[];
    readonly description = "Internal read-only file access capability for local skills.";
    private readonly repoRoot;
    private readonly allowedReadme;
    private readonly allowedPackageJson;
    private readonly allowedSrcRoot;
    isAvailable(): boolean;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
    private parseParams;
    private resolveAllowedPath;
    private isWithin;
    private checkExists;
}
