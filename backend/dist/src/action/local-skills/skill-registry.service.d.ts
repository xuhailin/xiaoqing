import type { LocalSkillDefinition } from './local-skill.types';
export declare class SkillRegistry {
    private readonly logger;
    private readonly skills;
    constructor();
    register(skill: LocalSkillDefinition): void;
    get(name: string): LocalSkillDefinition | undefined;
    list(): LocalSkillDefinition[];
}
