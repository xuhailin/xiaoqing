import { Controller, Get } from '@nestjs/common';
import { RelationshipOverviewService } from './relationship-overview.service';
import { UserId } from '../../infra/user-id.decorator';

@Controller('relationship')
export class RelationshipOverviewController {
  constructor(private readonly service: RelationshipOverviewService) {}

  @Get('overview')
  async getOverview(@UserId() userId: string) {
    return this.service.getOverview(userId);
  }
}
