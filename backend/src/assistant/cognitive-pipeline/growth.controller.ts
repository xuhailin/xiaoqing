import { Controller, Get, Patch, Param, Body, BadRequestException } from '@nestjs/common';
import { CognitiveGrowthService, type GrowthItemType } from './cognitive-growth.service';
import { UserId } from '../../infra/user-id.decorator';

@Controller('growth')
export class GrowthController {
  constructor(private growth: CognitiveGrowthService) {}

  /** 获取所有待确认的成长记录 */
  @Get('pending')
  async getPending(@UserId() userId: string) {
    return this.growth.getPending(userId);
  }

  /** 获取当前已生效的成长上下文（供 UI 与 prompt 共用） */
  @Get('context')
  async getContext(@UserId() userId: string) {
    return this.growth.getGrowthContext(userId);
  }

  /** 确认一条成长记录 */
  @Patch(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @Body() body: { type: GrowthItemType },
    @UserId() userId: string,
  ) {
    this.validateType(body?.type);
    await this.growth.confirmGrowth(id, body.type, userId);
    return { ok: true };
  }

  /** 拒绝一条成长记录 */
  @Patch(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { type: GrowthItemType },
    @UserId() userId: string,
  ) {
    this.validateType(body?.type);
    await this.growth.rejectGrowth(id, body.type, userId);
    return { ok: true };
  }

  private validateType(type: unknown): asserts type is GrowthItemType {
    if (type !== 'cognitive_profile' && type !== 'relationship_state') {
      throw new BadRequestException('type must be "cognitive_profile" or "relationship_state"');
    }
  }
}
