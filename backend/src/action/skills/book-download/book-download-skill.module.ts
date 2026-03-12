import { Module } from '@nestjs/common';
import { BookDownloadSkillService } from './book-download-skill.service';

@Module({
  providers: [BookDownloadSkillService],
  exports: [BookDownloadSkillService],
})
export class BookDownloadSkillModule {}
