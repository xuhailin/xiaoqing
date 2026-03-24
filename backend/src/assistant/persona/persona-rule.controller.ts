import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PersonaRuleService } from './persona-rule.service';
import type {
  PersonaRuleCategory,
  PersonaRuleProtect,
  PersonaRuleSource,
  PersonaRuleStatus,
} from './persona-rule.types';

@Controller('persona/rules')
export class PersonaRuleController {
  constructor(private readonly personaRules: PersonaRuleService) {}

  @Get()
  list() {
    return this.personaRules.list();
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body()
    body: {
      content?: string;
      weight?: number;
      status?: PersonaRuleStatus;
      protectLevel?: PersonaRuleProtect;
      pendingContent?: string | null;
      category?: PersonaRuleCategory;
      source?: PersonaRuleSource;
    },
  ) {
    return this.personaRules.update(key, body, 'user');
  }

  @Post(':key/promote')
  promote(@Param('key') key: string) {
    return this.personaRules.promote(key);
  }

  @Delete(':key')
  deprecate(@Param('key') key: string) {
    return this.personaRules.deprecate(key, 'user');
  }
}
