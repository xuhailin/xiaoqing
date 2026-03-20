import { Module } from '@nestjs/common';
import { IdeaController } from './idea.controller';
import { IdeaService } from './idea.service';

@Module({
  controllers: [IdeaController],
  providers: [IdeaService],
  exports: [IdeaService],
})
export class IdeaModule {}
