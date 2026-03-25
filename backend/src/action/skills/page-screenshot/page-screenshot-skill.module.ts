import { Module } from '@nestjs/common';
import { PageScreenshotSkillService } from './page-screenshot-skill.service';

@Module({
  providers: [PageScreenshotSkillService],
  exports: [PageScreenshotSkillService],
})
export class PageScreenshotSkillModule {}
