import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryDecayService } from './memory-decay.service';
import { UserId } from '../../infra/user-id.decorator';

@Controller('memories')
export class MemoryController {
  constructor(
    private memory: MemoryService,
    private decay: MemoryDecayService,
  ) {}

  @Get('for-injection')
  async forInjection(@Query('midK') midK?: string, @UserId() userId?: string) {
    const k = Math.max(0, parseInt(String(midK || '5'), 10) || 5);
    return this.memory.getForInjection(userId ?? 'default-user', k);
  }

  @Get()
  async list(
    @Query('type') type?: 'mid' | 'long',
    @Query('category') category?: string,
    @UserId() userId?: string,
  ) {
    return this.memory.list(userId ?? 'default-user', type, category);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.memory.getOne(id);
  }

  // --- Decay APIs（须在 Delete(':id') 之前，避免 decay/cleanup 被当作 id）---
  @Post('decay/recalculate')
  async recalculateDecay(@UserId() userId?: string) {
    const updated = await this.decay.recalcAll(userId);
    return { updated };
  }

  @Get('decay/candidates')
  async getDecayCandidates(@UserId() userId?: string) {
    return this.decay.getDecayCandidates(userId);
  }

  @Delete('decay/cleanup')
  async cleanupDecayed(@Body() body: { memoryIds: string[] }, @UserId() userId?: string) {
    const deleted = await this.decay.cleanup(body.memoryIds, userId);
    return { deleted };
  }

  // 注意：移除了 PATCH ':id' 和 DELETE ':id' 端点
  // 记忆的修改和删除应该通过内部服务（如 MemoryWriteGuardService）进行，
  // 而不是通过外部 API 直接操作，以保护数据完整性
}
