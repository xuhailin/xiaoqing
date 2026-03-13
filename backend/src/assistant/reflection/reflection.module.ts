import { Module } from '@nestjs/common';
import { ReflectionService } from './reflection.service';

@Module({
  providers: [ReflectionService],
  exports: [ReflectionService],
})
export class ReflectionModule {}
