import { Module } from '@nestjs/common';
import { SkillRegistry } from './skill-registry.service';

@Module({
  providers: [SkillRegistry],
  exports: [SkillRegistry],
})
export class LocalSkillModule {}
