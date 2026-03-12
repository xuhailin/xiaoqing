import { Injectable, Logger } from '@nestjs/common';
import type { LocalSkillDefinition } from './local-skill.types';
import { REPO_SUMMARY_SKILL } from './skills/repo-summary.skill';

const SKILL_WHITELIST = new Set(['repo-summary']);

@Injectable()
export class SkillRegistry {
  private readonly logger = new Logger(SkillRegistry.name);
  private readonly skills = new Map<string, LocalSkillDefinition>();

  constructor() {
    this.register(REPO_SUMMARY_SKILL);
  }

  register(skill: LocalSkillDefinition): void {
    if (!SKILL_WHITELIST.has(skill.name)) {
      this.logger.warn(`Skip non-whitelisted local skill: ${skill.name}`);
      return;
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string): LocalSkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): LocalSkillDefinition[] {
    return [...this.skills.values()];
  }
}
