import { ConfigService } from '@nestjs/config';
export declare class ClaimEngineConfig {
    private readonly config;
    constructor(config: ConfigService);
    get writeDualEnabled(): boolean;
    get readNewEnabled(): boolean;
    get injectionEnabled(): boolean;
    get sessionStateInjectionEnabled(): boolean;
    get writeInteractionEnabled(): boolean;
    get writeEmotionEnabled(): boolean;
    get draftEnabled(): boolean;
    get injectionTokenBudget(): number;
    get canonicalMappingThreshold(): number;
}
