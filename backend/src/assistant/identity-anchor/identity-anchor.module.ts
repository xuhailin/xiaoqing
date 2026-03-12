import { Module } from '@nestjs/common';
import { IdentityAnchorController } from './identity-anchor.controller';
import { IdentityAnchorService } from './identity-anchor.service';

@Module({
  controllers: [IdentityAnchorController],
  providers: [IdentityAnchorService],
  exports: [IdentityAnchorService],
})
export class IdentityAnchorModule {}
