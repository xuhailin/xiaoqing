import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { MemoryProposalStatus } from '@prisma/client';
import type { EntryAgentId } from '../gateway/message-router.types';
import { isEntryAgentId } from './agent-bus.dto';
import { MemoryProposalService } from './memory-proposal.service';

@Controller('agent-bus/memory-proposals')
export class MemoryProposalController {
  constructor(private readonly service: MemoryProposalService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('proposerAgentId') proposerAgentId?: string,
    @Query('delegationId') delegationId?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? Math.min(100, Math.max(1, parseInt(limitStr, 10) || 50)) : 50;
    return this.service.list({
      status: this.isValidStatus(status) ? status : undefined,
      proposerAgentId: isEntryAgentId(proposerAgentId) ? proposerAgentId : undefined,
      delegationId: delegationId?.trim() || undefined,
      limit,
    });
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() body?: { reviewNote?: string },
  ) {
    return this.service.approve(id, body?.reviewNote);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body?: { reviewNote?: string },
  ) {
    return this.service.reject(id, body?.reviewNote);
  }

  @Post(':id/merge')
  async merge(
    @Param('id') id: string,
    @Body() body?: { memoryId?: string; reviewNote?: string },
  ) {
    if (!body?.memoryId?.trim()) {
      throw new NotFoundException('memoryId is required for merge');
    }
    return this.service.merge(id, body.memoryId.trim(), body?.reviewNote);
  }

  private isValidStatus(value: unknown): value is MemoryProposalStatus {
    return typeof value === 'string' && ['pending', 'approved', 'rejected', 'merged'].includes(value);
  }
}
