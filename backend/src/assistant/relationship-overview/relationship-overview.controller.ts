import { Controller, Get } from '@nestjs/common';
import { RelationshipOverviewService } from './relationship-overview.service';

@Controller('relationship')
export class RelationshipOverviewController {
  constructor(private readonly service: RelationshipOverviewService) {}

  @Get('overview')
  async getOverview() {
    return this.service.getOverview();
  }
}
