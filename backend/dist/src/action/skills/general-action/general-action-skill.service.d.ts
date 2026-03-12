import { ConfigService } from '@nestjs/config';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import type { GeneralActionSkillExecuteParams, GeneralActionSkillResult } from './general-action-skill.types';
export declare class GeneralActionSkillService implements ICapability {
    private readonly logger;
    private readonly enabled;
    readonly name = "general-action";
    readonly taskIntent = "general_tool";
    readonly channels: MessageChannel[];
    readonly description = "\u5176\u4ED6\u5DE5\u5177\u578B\u8BF7\u6C42\uFF08\u641C\u7D22\u3001\u90AE\u4EF6\u3001\u65E5\u5386\u3001\u5916\u90E8\u67E5\u8BE2\u7B49\uFF09";
    constructor(config: ConfigService);
    isAvailable(): boolean;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
    executeGeneralAction(params: GeneralActionSkillExecuteParams): Promise<GeneralActionSkillResult>;
    private parseParams;
}
