import { Module } from '@nestjs/common';
import { SeedanceController } from './seeddance.controller';
import { SeedanceService } from './seeddance.service';

@Module({
  controllers: [SeedanceController],
  providers: [SeedanceService],
})
export class SeedanceModule {}
