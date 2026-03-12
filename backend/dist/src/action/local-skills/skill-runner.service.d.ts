import { CapabilityRegistry } from '../capability-registry.service';
import { SkillRegistry } from './skill-registry.service';
import type { LocalSkillRunRequest, LocalSkillRunResult } from './local-skill.types';
export declare class SkillRunner {
    private readonly skillRegistry;
    private readonly capabilityRegistry;
    private readonly logger;
    constructor(skillRegistry: SkillRegistry, capabilityRegistry: CapabilityRegistry);
    run(request: LocalSkillRunRequest): Promise<LocalSkillRunResult>;
}
