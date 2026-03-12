import type { CapabilityMeta, CapabilityRequest, CapabilityResult } from './capability.types';
export interface ICapability extends CapabilityMeta {
    isAvailable(): boolean;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
}
