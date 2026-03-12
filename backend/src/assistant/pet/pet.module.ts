import { Global, Module } from '@nestjs/common';
import { PetController } from './pet.controller';
import { PetService } from './pet.service';

@Global()
@Module({
  controllers: [PetController],
  providers: [PetService],
  exports: [PetService],
})
export class PetModule {}
