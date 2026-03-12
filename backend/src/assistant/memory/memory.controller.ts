import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryDecayService } from './memory-decay.service';

@Controller('memories')
export class MemoryController {
  constructor(
    private memory: MemoryService,
    private decay: MemoryDecayService,
  ) {}

  @Get('for-injection')
  async forInjection(@Query('midK') midK?: string) {
    const k = Math.max(0, parseInt(String(midK || '5'), 10) || 5);
    return this.memory.getForInjection(k);
  }

  @Get()
  async list(
    @Query('type') type?: 'mid' | 'long',
    @Query('category') category?: string,
  ) {
    return this.memory.list(type, category);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.memory.getOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { content?: string; confidence?: number; sourceMessageIds?: string[] },
  ) {
    return this.memory.update(id, body);
  }

  // --- Decay APIs（须在 Delete(':id') 之前，避免 decay/cleanup 被当作 id）---
  @Post('decay/recalculate')
  async recalculateDecay() {
    const updated = await this.decay.recalcAll();
    return { updated };
  }

  @Get('decay/candidates')
  async getDecayCandidates() {
    return this.decay.getDecayCandidates();
  }

  @Delete('decay/cleanup')
  async cleanupDecayed(@Body() body: { memoryIds: string[] }) {
    const deleted = await this.decay.cleanup(body.memoryIds);
    return { deleted };
  }

  @Delete(':id')
  async deleteOne(@Param('id') id: string) {
    return this.memory.deleteOne(id);
  }
}
