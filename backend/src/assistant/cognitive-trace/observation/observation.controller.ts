import { Controller, Get, Query } from '@nestjs/common';
import { ObservationService } from './observation.service';
import type { ObservationDimension, ObservationKind } from '../cognitive-trace.types';

@Controller('cognitive-trace/observations')
export class ObservationController {
  constructor(private readonly observationService: ObservationService) {}

  @Get()
  async query(
    @Query('dimension') dimension?: string,
    @Query('kind') kind?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minSignificance') minSignificance?: string,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.observationService.query({
      dimension: dimension as ObservationDimension | undefined,
      kind: kind as ObservationKind | undefined,
      since: from ? new Date(from) : undefined,
      until: to ? new Date(to) : undefined,
      minSignificance: minSignificance ? parseFloat(minSignificance) : undefined,
      conversationId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('by-day')
  async byDay(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minSignificance') minSignificance?: string,
  ) {
    return this.observationService.queryByDay({
      since: from ? new Date(from) : undefined,
      until: to ? new Date(to) : undefined,
      minSignificance: minSignificance ? parseFloat(minSignificance) : undefined,
    });
  }
}
